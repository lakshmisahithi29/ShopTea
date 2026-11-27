import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { after, before, describe, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { isoDay } from '../utils/dateRange';

process.env.NODE_ENV = 'test';

const runId = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
const prefix = `p5_${runId}`;
const createdUserIds: string[] = [];
const createdShopIds: string[] = [];

let server: Server;
let baseUrl: string;
let prisma: typeof import('../utils/prisma').prisma;
let env: typeof import('../config/env').env;
let ownerToken: string;
let otherToken: string;
let ownerId: string;
let ownerShopId: string;
let itemId: string;
let supplierId: string;
let otherItemId: string;
let concurrencyItemId: string;
let firstPurchaseId: string;
let editedPurchaseId: string;

interface TestResponse {
  response: globalThis.Response;
  body: any;
}

async function request(path: string, token?: string, init: RequestInit = {}): Promise<TestResponse> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : text;
  } catch {
    body = text;
  }
  return { response, body };
}

async function createAccount(label: string) {
  const user = await prisma.user.create({
    data: {
      username: `${prefix}_${label}`,
      email: `${prefix}-${label}@example.test`,
      password: 'unused-purchase-fixture-password',
      name: `${label} Owner`,
      shop: {
        create: {
          name: `${prefix} ${label} Shop`,
          ownerName: `${label} Owner`,
          phone: '+91 98765 43210',
        },
      },
    },
    include: { shop: true },
  });
  createdUserIds.push(user.id);
  if (user.shop) createdShopIds.push(user.shop.id);
  const token = jwt.sign(
    { userId: user.id, username: user.username, email: user.email, shopId: user.shopId },
    env.JWT_SECRET,
    { expiresIn: '1h', algorithm: 'HS256' },
  );
  return { user, token };
}

function purchasePayload(overrides: Record<string, unknown> = {}) {
  return {
    itemId,
    quantity: 5,
    unitCost: 200,
    supplierId,
    reference: `${prefix}-invoice`,
    remarks: 'Fresh tea delivery',
    date: isoDay(new Date()),
    idempotencyKey: `${prefix}-purchase`,
    ...overrides,
  };
}

function postPurchase(payload: Record<string, unknown>, token = ownerToken) {
  return request('/api/purchases', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function patchPurchase(id: string, payload: Record<string, unknown>, token = ownerToken) {
  return request(`/api/purchases/${id}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function cancelPurchase(id: string, payload: Record<string, unknown>, token = ownerToken) {
  return request(`/api/purchases/${id}/cancel`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

describe('Phase 5 purchase management API', { concurrency: false }, () => {
  before(async () => {
    ({ prisma } = await import('../utils/prisma'));
    ({ env } = await import('../config/env'));
    const { createApp } = await import('../app');
    const app = createApp();
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const owner = await createAccount('owner');
    const other = await createAccount('other');
    ownerToken = owner.token;
    otherToken = other.token;
    ownerId = owner.user.id;
    ownerShopId = owner.user.shopId!;

    const supplier = await prisma.supplier.create({
      data: { shopId: ownerShopId, name: `${prefix} Supplier`, phone: '+91 90000 00000' },
    });
    supplierId = supplier.id;

    const item = await prisma.inventoryItem.create({
      data: {
        shopId: ownerShopId,
        name: `${prefix} Tea`,
        category: 'TEA_LEAVES',
        unit: 'KG',
        openingStock: 10,
        currentStock: 10,
        unitCost: 100,
        minStock: 2,
        reorderLevel: 5,
        targetStock: 30,
        supplierId,
      },
    });
    itemId = item.id;
    await prisma.stockTransaction.create({
      data: {
        shopId: ownerShopId,
        itemId,
        type: 'PURCHASE',
        quantity: 10,
        unitCost: 100,
        totalCost: 1000,
        reference: 'OPENING-STOCK',
        idempotencyKey: `${prefix}-opening`,
        createdById: ownerId,
      },
    });

    const otherItem = await prisma.inventoryItem.create({
      data: {
        shopId: other.user.shopId!,
        name: `${prefix} Other Item`,
        category: 'OTHER',
        unit: 'KG',
        currentStock: 4,
        unitCost: 25,
      },
    });
    otherItemId = otherItem.id;

    const concurrencyItem = await prisma.inventoryItem.create({
      data: {
        shopId: ownerShopId,
        name: `${prefix} Concurrency Item`,
        category: 'OTHER',
        unit: 'KG',
        currentStock: 0,
        unitCost: 0,
      },
    });
    concurrencyItemId = concurrencyItem.id;
  });

  after(async () => {
    if (createdShopIds.length) await prisma.shop.deleteMany({ where: { id: { in: createdShopIds } } });
    if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('purchase creation uses weighted-average costing and idempotency prevents duplicate stock', async () => {
    const created = await postPurchase(purchasePayload());
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    firstPurchaseId = created.body.purchase.id;
    assert.equal(created.body.newStock, 15);
    assert.equal(created.body.updatedItem.unitCost, 133.33);
    assert.equal(created.body.purchase.unitCost, 200);
    assert.equal(created.body.purchase.totalCost, 1000);
    assert.equal(created.body.purchase.status, 'ACTIVE');

    const duplicate = await postPurchase(purchasePayload());
    assert.equal(duplicate.response.status, 200);
    assert.equal(duplicate.body.isDuplicate, true);
    assert.equal((await request(`/api/items/${itemId}`, ownerToken)).body.item.currentStock, 15);

    const racePayload = purchasePayload({ quantity: 2, unitCost: 300, idempotencyKey: `${prefix}-race` });
    const raced = await Promise.all([postPurchase(racePayload), postPurchase(racePayload)]);
    assert.deepEqual(raced.map((result) => result.response.status).sort(), [200, 201]);
    assert.equal((await request(`/api/items/${itemId}`, ownerToken)).body.item.currentStock, 17);
    assert.equal(await prisma.stockTransaction.count({ where: { shopId: ownerShopId, idempotencyKey: `${prefix}-race` } }), 1);

    const distinct = await Promise.all([
      postPurchase(purchasePayload({ itemId: concurrencyItemId, quantity: 1, unitCost: 100, idempotencyKey: `${prefix}-concurrent-a` })),
      postPurchase(purchasePayload({ itemId: concurrencyItemId, quantity: 1, unitCost: 200, idempotencyKey: `${prefix}-concurrent-b` })),
    ]);
    assert.deepEqual(distinct.map((result) => result.response.status).sort(), [201, 201]);
    const concurrentItem = (await request(`/api/items/${concurrencyItemId}`, ownerToken)).body.item;
    assert.equal(concurrentItem.currentStock, 2);
    assert.equal(concurrentItem.unitCost, 150);
  });

  test('purchase history, filters, summaries, and tenant isolation use real records', async () => {
    const list = await request('/api/purchases', ownerToken);
    assert.equal(list.response.status, 200);
    assert.equal(list.body.pagination.total, 5);
    assert.equal(list.body.summary.activePurchaseCount, 5);
    assert.equal(list.body.summary.activePurchaseValue, 2900);
    assert.equal(list.body.summary.costMethod, 'WEIGHTED_AVERAGE');

    const filtered = await request(`/api/purchases?itemId=${itemId}&status=ACTIVE`, ownerToken);
    assert.equal(filtered.body.pagination.total, 3);
    const other = await request('/api/purchases', otherToken);
    assert.equal(other.body.pagination.total, 0);
    assert.equal((await request(`/api/purchases/${firstPurchaseId}`, otherToken)).response.status, 404);
  });

  test('editing a purchase creates a reversal and replacement without losing audit history', async () => {
    const editPayload = {
      quantity: 4,
      unitCost: 250,
      supplierId,
      reference: `${prefix}-edited-invoice`,
      remarks: 'Corrected delivery quantity',
      date: isoDay(new Date()),
      idempotencyKey: `${prefix}-edit`,
    };
    const edited = await patchPurchase(firstPurchaseId, editPayload);
    assert.equal(edited.response.status, 200, JSON.stringify(edited.body));
    editedPurchaseId = edited.body.purchase.id;
    assert.equal(edited.body.newStock, 16);
    assert.equal(edited.body.updatedItem.unitCost, 162.5);
    assert.equal(edited.body.original.status, 'CANCELLED');
    assert.equal(edited.body.reversal.type, 'REVERSAL');
    assert.equal(edited.body.reversal.reversalOfId, firstPurchaseId);
    assert.equal(edited.body.original.auditGroupId, edited.body.purchase.auditGroupId);
    assert.equal(edited.body.reversal.auditGroupId, edited.body.purchase.auditGroupId);

    const retry = await patchPurchase(firstPurchaseId, editPayload);
    assert.equal(retry.response.status, 200);
    assert.equal(retry.body.isDuplicate, true);
    assert.equal((await request(`/api/items/${itemId}`, ownerToken)).body.item.currentStock, 16);
    assert.equal(await prisma.stockTransaction.count({ where: { shopId: ownerShopId, type: 'REVERSAL' } }), 1);
  });

  test('cancelling a purchase reverses stock, recalculates cost, and remains idempotent', async () => {
    const payload = { reason: 'Supplier cancelled the delivery', idempotencyKey: `${prefix}-cancel` };
    const cancelled = await cancelPurchase(editedPurchaseId, payload);
    assert.equal(cancelled.response.status, 200, JSON.stringify(cancelled.body));
    assert.equal(cancelled.body.newStock, 12);
    assert.equal(cancelled.body.updatedItem.unitCost, 133.33);
    assert.equal(cancelled.body.purchase.status, 'CANCELLED');
    assert.equal(cancelled.body.reversal.type, 'REVERSAL');

    const retry = await cancelPurchase(editedPurchaseId, payload);
    assert.equal(retry.response.status, 200);
    assert.equal(retry.body.isDuplicate, true);
    assert.equal((await request(`/api/items/${itemId}`, ownerToken)).body.item.currentStock, 12);
    assert.equal(await prisma.stockTransaction.count({ where: { shopId: ownerShopId, type: 'REVERSAL' } }), 2);

    const history = await request('/api/purchases?status=CANCELLED', ownerToken);
    assert.equal(history.body.pagination.total, 2);
  });

  test('unsafe cancellations and invalid suppliers roll back without changing stock or history', async () => {
    const usage = await request('/api/transactions/usage', ownerToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, quantity: 11, date: isoDay(new Date()), idempotencyKey: `${prefix}-usage` }),
    });
    assert.equal(usage.response.status, 201);
    assert.equal(usage.body.newStock, 1);

    const active = await prisma.stockTransaction.findFirst({
      where: { shopId: ownerShopId, idempotencyKey: `${prefix}-race` },
    });
    const unsafe = await cancelPurchase(active!.id, { reason: 'Too late to cancel', idempotencyKey: `${prefix}-unsafe` });
    assert.equal(unsafe.response.status, 400);
    assert.match(unsafe.body.message, /already been consumed/i);
    assert.equal((await request(`/api/items/${itemId}`, ownerToken)).body.item.currentStock, 1);

    const countBefore = await prisma.stockTransaction.count({ where: { shopId: ownerShopId } });
    const invalid = await postPurchase(purchasePayload({
      quantity: 1,
      unitCost: 100,
      supplierId: otherItemId,
      idempotencyKey: `${prefix}-invalid-supplier`,
    }));
    assert.equal(invalid.response.status, 404);
    assert.equal((await request(`/api/items/${itemId}`, ownerToken)).body.item.currentStock, 1);
    assert.equal(await prisma.stockTransaction.count({ where: { shopId: ownerShopId } }), countBefore);

    const cross = await patchPurchase(firstPurchaseId, { quantity: 1, unitCost: 100, idempotencyKey: `${prefix}-cross` }, otherToken);
    assert.equal(cross.response.status, 404);
  });

  test('opening stock is protected and dashboard valuation follows the updated weighted cost', async () => {
    const opening = await prisma.stockTransaction.findFirst({
      where: { shopId: ownerShopId, reference: 'OPENING-STOCK' },
    });
    const protectedEdit = await patchPurchase(opening!.id, {
      quantity: 1,
      unitCost: 100,
      idempotencyKey: `${prefix}-opening-edit`,
    });
    assert.equal(protectedEdit.response.status, 400);

    const shopItems = await prisma.inventoryItem.findMany({ where: { shopId: ownerShopId, isActive: true } });
    const expectedInventoryValue = Number(shopItems.reduce(
      (sum, shopItem) => sum + Number(shopItem.currentStock) * Number(shopItem.unitCost),
      0,
    ).toFixed(2));
    const dashboard = (await request('/api/dashboard/summary', ownerToken)).body;
    assert.equal(dashboard.summary.totalInventoryValue, expectedInventoryValue);
    const trend = (await request(`/api/dashboard/movement-trend?from=${isoDay(new Date())}&to=${isoDay(new Date())}`, ownerToken)).body;
    assert.equal(trend.totals.purchaseValue, 1900);
  });
});
