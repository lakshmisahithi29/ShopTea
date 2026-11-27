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
const prefix = `p4_${runId}`;
const createdUserIds: string[] = [];
const createdShopIds: string[] = [];

let server: Server;
let baseUrl: string;
let prisma: typeof import('../utils/prisma').prisma;
let env: typeof import('../config/env').env;
let ownerToken: string;
let otherToken: string;
let noShopToken: string;
let ownerId: string;
let supplierId: string;
let otherSupplierId: string;
let otherItemId: string;
let teaId: string;
let zeroItemId: string;

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

async function createAccount(label: string, withShop: boolean) {
  const user = await prisma.user.create({
    data: {
      username: `${prefix}_${label}`,
      email: `${prefix}-${label}@example.test`,
      password: 'unused-inventory-fixture-password',
      name: `${label} Owner`,
      ...(withShop
        ? {
            shop: {
              create: {
                name: `${prefix} ${label} Shop`,
                ownerName: `${label} Owner`,
                phone: '+91 98765 43210',
              },
            },
          }
        : {}),
    },
    include: { shop: true },
  });
  createdUserIds.push(user.id);
  if (user.shop) createdShopIds.push(user.shop.id);
  const token = jwt.sign(
    { userId: user.id, username: user.username, email: user.email, shopId: user.shopId },
    env.JWT_SECRET,
    { expiresIn: '1h', algorithm: 'HS256' }
  );
  return { user, token };
}

function itemPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: `${prefix} Tea`,
    description: 'Single-origin house tea',
    category: 'TEA_LEAVES',
    unit: 'KG',
    leadTimeDays: 3,
    openingStock: 10,
    unitCost: 100,
    minStock: 2,
    reorderLevel: 5,
    targetStock: 20,
    supplierId,
    ...overrides,
  };
}

function postItem(payload: Record<string, unknown>, token = ownerToken) {
  return request('/api/items', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function patchItem(id: string, payload: Record<string, unknown>, token = ownerToken) {
  return request(`/api/items/${id}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

describe('Phase 4 inventory lifecycle API', { concurrency: false }, () => {
  before(async () => {
    ({ prisma } = await import('../utils/prisma'));
    ({ env } = await import('../config/env'));
    const { createApp } = await import('../app');
    const app = createApp();
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const owner = await createAccount('owner', true);
    const other = await createAccount('other', true);
    const noShop = await createAccount('noshop', false);
    ownerToken = owner.token;
    otherToken = other.token;
    noShopToken = noShop.token;
    ownerId = owner.user.id;

    const supplier = await prisma.supplier.create({
      data: { shopId: owner.user.shopId!, name: `${prefix} Supplier`, phone: '+91 90000 00000' },
    });
    const otherSupplier = await prisma.supplier.create({
      data: { shopId: other.user.shopId!, name: `${prefix} Other Supplier`, phone: '+91 90000 00001' },
    });
    supplierId = supplier.id;
    otherSupplierId = otherSupplier.id;

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
  });

  after(async () => {
    if (createdShopIds.length > 0) {
      await prisma.shop.deleteMany({ where: { id: { in: createdShopIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('inventory requires authentication, a shop, and valid item data', async () => {
    assert.equal((await request('/api/items')).response.status, 401);
    assert.equal((await request('/api/items', noShopToken)).response.status, 401);
    assert.equal((await postItem(itemPayload({ category: 'INVALID' }))).response.status, 400);
    assert.equal((await postItem(itemPayload({ openingStock: -1 }))).response.status, 400);
    assert.equal((await postItem(itemPayload({ minStock: 8, reorderLevel: 5 }))).response.status, 400);
    assert.equal((await postItem(itemPayload({ unit: 'PACKETS', openingStock: 1.5 }))).response.status, 400);
    assert.equal((await request('/api/items?category=INVALID', ownerToken)).response.status, 400);
  });

  test('create persists planning details and writes exactly one opening-stock ledger entry', async () => {
    const { response, body } = await postItem(itemPayload());
    assert.equal(response.status, 201);
    teaId = body.item.id;
    assert.equal(body.item.description, 'Single-origin house tea');
    assert.equal(body.item.leadTimeDays, 3);
    assert.equal(body.item.openingStock, 10);
    assert.equal(body.item.currentStock, 10);
    assert.equal(body.item.supplierId, supplierId);
    assert.equal(body.item.status, 'HEALTHY');

    const ledger = await prisma.stockTransaction.findMany({ where: { itemId: teaId } });
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].type, 'PURCHASE');
    assert.equal(ledger[0].reference, 'OPENING-STOCK');
    assert.equal(Number(ledger[0].quantity), 10);
    assert.equal(Number(ledger[0].totalCost), 1000);
    assert.equal(ledger[0].createdById, ownerId);
  });

  test('zero opening stock creates no ledger entry', async () => {
    const { response, body } = await postItem(itemPayload({
      name: `${prefix} Zero Milk`,
      description: null,
      category: 'DAIRY',
      unit: 'LITRES',
      openingStock: 0,
      supplierId: null,
    }));
    assert.equal(response.status, 201);
    zeroItemId = body.item.id;
    assert.equal(body.item.currentStock, 0);
    assert.equal(await prisma.stockTransaction.count({ where: { itemId: zeroItemId } }), 0);
  });

  test('compatible input units normalize stock and cost while incompatible units are rejected', async () => {
    const before = await request('/api/dashboard/summary', ownerToken);
    const created = await postItem(itemPayload({
      name: `${prefix} Converted Tea`,
      unit: 'KG',
      inputUnit: 'G',
      openingStock: 2500,
      unitCost: 0.4,
    }));
    assert.equal(created.response.status, 201);
    assert.equal(created.body.item.currentStock, 2.5);
    assert.equal(created.body.item.unitCost, 400);

    const ledger = await prisma.stockTransaction.findMany({ where: { itemId: created.body.item.id } });
    assert.equal(Number(ledger[0].quantity), 2.5);
    assert.equal(Number(ledger[0].unitCost), 400);
    assert.equal(Number(ledger[0].totalCost), 1000);
    const afterCreate = await request('/api/dashboard/summary', ownerToken);
    assert.equal(afterCreate.body.summary.totalInventoryValue, before.body.summary.totalInventoryValue + 1000);

    const usage = await request('/api/transactions/usage', ownerToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: created.body.item.id, quantity: 250, inputUnit: 'G', date: isoDay(new Date()) }),
    });
    assert.equal(usage.response.status, 201);
    assert.equal(usage.body.newStock, 2.25);

    const purchase = await request('/api/transactions/purchase', ownerToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemId: created.body.item.id,
        quantity: 500,
        inputUnit: 'G',
        unitCost: 0.2,
        date: isoDay(new Date()),
        idempotencyKey: `${prefix}-converted-purchase`,
      }),
    });
    assert.equal(purchase.response.status, 201);
    assert.equal(purchase.body.newStock, 2.75);
    assert.equal(Number(purchase.body.transaction.unitCost), 200);
    assert.equal(Number(purchase.body.transaction.totalCost), 100);

    const after = await request('/api/dashboard/summary', ownerToken);
    const currentItems = await prisma.inventoryItem.findMany({
      where: { shopId: created.body.item.shopId, isActive: true },
    });
    const expectedValue = Number(currentItems
      .reduce((sum, item) => sum + Number(item.currentStock) * Number(item.unitCost), 0)
      .toFixed(2));
    assert.equal(after.body.summary.totalInventoryValue, expectedValue);

    const incompatible = await postItem(itemPayload({
      name: `${prefix} Incompatible Units`,
      unit: 'KG',
      inputUnit: 'ML',
      openingStock: 1,
    }));
    assert.equal(incompatible.response.status, 400);

    const fractionalCount = await postItem(itemPayload({
      name: `${prefix} Fractional Packets`,
      unit: 'PACKETS',
      openingStock: 5,
      minStock: 1.5,
      reorderLevel: 3,
      targetStock: 10,
    }));
    assert.equal(fractionalCount.response.status, 400);
  });

  test('duplicate names are rejected without duplicating stock history', async () => {
    const duplicate = await postItem(itemPayload());
    assert.equal(duplicate.response.status, 409);
    assert.equal(await prisma.inventoryItem.count({ where: { name: `${prefix} Tea` } }), 1);
    assert.equal(await prisma.stockTransaction.count({ where: { itemId: teaId } }), 1);
  });

  test('read, search, category, status, and archive filters are tenant-scoped', async () => {
    const searched = await request('/api/items?search=single-origin&category=TEA_LEAVES&status=HEALTHY', ownerToken);
    assert.equal(searched.response.status, 200);
    assert.deepEqual(searched.body.items.map((item: any) => item.id), [teaId]);

    const outOfStock = await request('/api/items?status=OUT_OF_STOCK', ownerToken);
    assert.deepEqual(outOfStock.body.items.map((item: any) => item.id), [zeroItemId]);

    const detail = await request(`/api/items/${teaId}`, ownerToken);
    assert.equal(detail.response.status, 200);
    assert.equal(detail.body.item.name, `${prefix} Tea`);

    const crossTenant = await request(`/api/items/${otherItemId}`, ownerToken);
    assert.equal(crossTenant.response.status, 404);
    const otherList = await request('/api/items', otherToken);
    assert.deepEqual(otherList.body.items.map((item: any) => item.id), [otherItemId]);
  });

  test('metadata and levels update while stock, opening stock, and unit stay immutable', async () => {
    const updated = await patchItem(teaId, {
      name: `${prefix} Updated Tea`,
      description: 'Updated tasting notes',
      leadTimeDays: 7,
      unitCost: 120,
      minStock: 1,
      reorderLevel: 4,
      targetStock: 25,
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.item.description, 'Updated tasting notes');
    assert.equal(updated.body.item.leadTimeDays, 7);
    assert.equal(updated.body.item.unitCost, 120);
    assert.equal(updated.body.item.openingStock, 10);
    assert.equal(updated.body.item.currentStock, 10);
    assert.equal(updated.body.item.unit, 'KG');

    for (const tampered of [{ currentStock: 999 }, { openingStock: 999 }, { unit: 'LITRES' }, { shopId: 'other' }]) {
      const result = await patchItem(teaId, tampered);
      assert.equal(result.response.status, 400);
    }
    const unchanged = await request(`/api/items/${teaId}`, ownerToken);
    assert.equal(unchanged.body.item.currentStock, 10);
    assert.equal(unchanged.body.item.openingStock, 10);
    assert.equal(unchanged.body.item.unit, 'KG');
    assert.equal(await prisma.stockTransaction.count({ where: { itemId: teaId } }), 1);
  });

  test('cross-tenant items and suppliers cannot be assigned', async () => {
    const create = await postItem(itemPayload({ name: `${prefix} Cross Supplier`, supplierId: otherSupplierId }));
    assert.equal(create.response.status, 404);
    const update = await patchItem(teaId, { supplierId: otherSupplierId });
    assert.equal(update.response.status, 404);
    const crossItem = await patchItem(otherItemId, { description: 'Tampered' }, ownerToken);
    assert.equal(crossItem.response.status, 404);
  });

  test('archive blocks new movements, preserves history, and restore re-enables transactions', async () => {
    const archived = await patchItem(teaId, { isActive: false });
    assert.equal(archived.response.status, 200);
    assert.equal(archived.body.item.isActive, false);
    assert.match(archived.body.message, /history.*preserved/i);

    const archivedList = await request('/api/items?archivedOnly=true', ownerToken);
    assert.deepEqual(archivedList.body.items.map((item: any) => item.id), [teaId]);
    const activeList = await request('/api/items?activeOnly=true', ownerToken);
    assert.equal(activeList.body.items.some((item: any) => item.id === teaId), false);

    const blockedUsage = await request('/api/transactions/usage', ownerToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: teaId, quantity: 1, date: isoDay(new Date()) }),
    });
    assert.equal(blockedUsage.response.status, 400);
    assert.match(blockedUsage.body.message, /archived item/i);
    assert.equal((await request(`/api/items/${teaId}`, ownerToken)).body.item.currentStock, 10);
    assert.equal(await prisma.stockTransaction.count({ where: { itemId: teaId } }), 1);

    const restored = await patchItem(teaId, { isActive: true });
    assert.equal(restored.response.status, 200);
    assert.equal(restored.body.item.isActive, true);
    const usage = await request('/api/transactions/usage', ownerToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: teaId, quantity: 1, date: isoDay(new Date()) }),
    });
    assert.equal(usage.response.status, 201);
    assert.equal(usage.body.newStock, 9);
    assert.equal(await prisma.stockTransaction.count({ where: { itemId: teaId } }), 2);
  });

  test('concurrent duplicate creates produce one item and one opening ledger entry', async () => {
    const payload = itemPayload({ name: `${prefix} Race Item`, openingStock: 2 });
    const results = await Promise.all([postItem(payload), postItem(payload)]);
    assert.deepEqual(results.map((result) => result.response.status).sort(), [201, 409]);
    const items = await prisma.inventoryItem.findMany({ where: { name: `${prefix} Race Item` } });
    assert.equal(items.length, 1);
    assert.equal(await prisma.stockTransaction.count({ where: { itemId: items[0].id } }), 1);
  });

  test('renaming to another existing item returns a conflict and preserves the original', async () => {
    const result = await patchItem(zeroItemId, { name: `${prefix} Updated Tea` });
    assert.equal(result.response.status, 409);
    assert.equal((await request(`/api/items/${zeroItemId}`, ownerToken)).body.item.name, `${prefix} Zero Milk`);
  });

  test('there is no delete endpoint and ledger-backed items cannot be cascade-deleted', async () => {
    const deleted = await request(`/api/items/${teaId}`, ownerToken, { method: 'DELETE' });
    assert.equal(deleted.response.status, 404);
    assert.equal((await request(`/api/items/${teaId}`, ownerToken)).response.status, 200);
    assert.equal(await prisma.stockTransaction.count({ where: { itemId: teaId } }), 2);
  });
});
