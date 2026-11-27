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
const prefix = `p7_${runId}`;
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
let ownerShopId: string;
let outItemId: string;
let lowItemId: string;
let reorderItemId: string;
let healthyItemId: string;
let otherItemId: string;
let menuId: string;

interface TestResponse {
  response: globalThis.Response;
  body: any;
}

async function request(path: string, token?: string, init: RequestInit = {}): Promise<TestResponse> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : text; } catch { body = text; }
  return { response, body };
}

async function createAccount(label: string, withShop = true) {
  const user = await prisma.user.create({
    data: {
      username: `${prefix}_${label}`,
      email: `${prefix}-${label}@example.test`,
      password: 'unused-alert-fixture-password',
      name: `${label} Owner`,
      ...(withShop ? { shop: { create: { name: `${prefix} ${label} Shop`, ownerName: `${label} Owner`, phone: '+91 98765 43210' } } } : {}),
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

function itemPayload(name: string, openingStock: number, minStock: number, reorderLevel: number, targetStock: number) {
  return {
    name: `${prefix} ${name}`,
    description: 'Alert lifecycle fixture',
    category: 'TEA_LEAVES',
    unit: 'KG',
    leadTimeDays: 3,
    openingStock,
    unitCost: 100,
    minStock,
    reorderLevel,
    targetStock,
    supplierId: null,
  };
}

async function postItem(payload: Record<string, unknown>) {
  return request('/api/items', ownerToken, {
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

function postJson(path: string, payload: Record<string, unknown>, token = ownerToken) {
  return request(path, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function activeAlerts(itemId?: string) {
  return prisma.stockAlert.findMany({
    where: { shopId: ownerShopId, status: 'ACTIVE', ...(itemId ? { itemId } : {}) },
    orderBy: { triggeredAt: 'asc' },
  });
}

async function alertSummary() {
  const result = await request('/api/alerts/summary', ownerToken);
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body.summary;
}

describe('Phase 7 stock alerts API', { concurrency: false }, () => {
  before(async () => {
    ({ prisma } = await import('../utils/prisma'));
    ({ env } = await import('../config/env'));
    const { createApp } = await import('../app');
    server = createApp().listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const owner = await createAccount('owner');
    const other = await createAccount('other');
    const noShop = await createAccount('noshop', false);
    ownerToken = owner.token;
    otherToken = other.token;
    noShopToken = noShop.token;
    ownerId = owner.user.id;
    ownerShopId = owner.user.shopId!;

    const otherItem = await prisma.inventoryItem.create({
      data: { shopId: other.user.shopId!, name: `${prefix} Other Tea`, category: 'TEA_LEAVES', unit: 'KG', currentStock: 0, unitCost: 50, minStock: 1, reorderLevel: 3, targetStock: 5 },
    });
    otherItemId = otherItem.id;
  });

  after(async () => {
    try {
      if (createdShopIds.length) {
        const shopOwned = { shopId: { in: createdShopIds } };
        await prisma.stockTransaction.deleteMany({ where: shopOwned });
        await prisma.recipeItem.deleteMany({ where: { OR: [{ menuItem: shopOwned }, { item: shopOwned }] } });
        await prisma.saleItem.deleteMany({ where: { sale: shopOwned } });
        await prisma.stockUsageItem.deleteMany({ where: { OR: [{ usageRecord: shopOwned }, { item: shopOwned }] } });
        await prisma.sale.deleteMany({ where: shopOwned });
        await prisma.stockUsage.deleteMany({ where: shopOwned });
        await prisma.menuItem.deleteMany({ where: shopOwned });
        await prisma.inventoryItem.deleteMany({ where: shopOwned });
        await prisma.shop.deleteMany({ where: { id: { in: createdShopIds } } });
      }
      if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    } finally {
      await prisma.$disconnect();
      if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('alerts require authentication, a shop, and valid filters', async () => {
    assert.equal((await request('/api/alerts')).response.status, 401);
    assert.equal((await request('/api/alerts', noShopToken)).response.status, 401);
    assert.equal((await request('/api/alerts?type=INVALID', ownerToken)).response.status, 400);
    assert.equal((await request('/api/alerts?limit=101', ownerToken)).response.status, 400);
    assert.equal((await request('/api/alerts?itemId=not-a-uuid', ownerToken)).response.status, 400);
  });

  test('creation generates one persistent alert for each stock condition', async () => {
    const out = await postItem(itemPayload('Out', 0, 1, 5, 10));
    const low = await postItem(itemPayload('Low', 2, 2, 5, 10));
    const reorder = await postItem(itemPayload('Reorder', 4, 1, 5, 10));
    const healthy = await postItem(itemPayload('Healthy', 20, 1, 5, 10));
    assert.equal(out.response.status, 201, JSON.stringify(out.body));
    assert.equal(low.response.status, 201, JSON.stringify(low.body));
    assert.equal(reorder.response.status, 201, JSON.stringify(reorder.body));
    assert.equal(healthy.response.status, 201, JSON.stringify(healthy.body));
    outItemId = out.body.item.id;
    lowItemId = low.body.item.id;
    reorderItemId = reorder.body.item.id;
    healthyItemId = healthy.body.item.id;

    assert.deepEqual((await activeAlerts()).map((alert) => alert.type), ['OUT_OF_STOCK', 'LOW_STOCK', 'NEEDS_REORDER']);
    await Promise.all([
      request('/api/alerts', ownerToken),
      request('/api/alerts/summary', ownerToken),
      request('/api/alerts', ownerToken),
    ]);
    assert.equal((await activeAlerts()).length, 3);
    assert.deepEqual(await alertSummary(), {
      activeCount: 3,
      unreadCount: 3,
      outOfStockCount: 1,
      lowStockCount: 1,
      needsReorderCount: 1,
    });
  });

  test('threshold changes resolve or replace alerts without losing history or read state', async () => {
    const lowAlert = (await activeAlerts(lowItemId))[0];
    const read = await postJson(`/api/alerts/${lowAlert.id}/read`, {});
    assert.equal(read.response.status, 200, JSON.stringify(read.body));
    assert.ok(read.body.alert.readAt);

    const resolved = await patchItem(lowItemId, { minStock: 0, reorderLevel: 1, targetStock: 5 });
    assert.equal(resolved.response.status, 200, JSON.stringify(resolved.body));
    assert.equal((await activeAlerts(lowItemId)).length, 0);
    const historical = await prisma.stockAlert.findUniqueOrThrow({ where: { id: lowAlert.id } });
    assert.equal(historical.status, 'RESOLVED');
    assert.equal(historical.activeKey, null);
    assert.ok(historical.readAt);
    assert.ok(historical.resolvedAt);
    assert.match(historical.resolutionReason || '', /replenished|threshold/i);

    const usage = await postJson('/api/transactions/usage', { itemId: healthyItemId, quantity: 18, date: isoDay(new Date()) });
    assert.equal(usage.response.status, 201, JSON.stringify(usage.body));
    const created = (await activeAlerts(healthyItemId))[0];
    assert.equal(created.type, 'NEEDS_REORDER');
    const firstTriggeredAt = created.triggeredAt;
    await request('/api/alerts', ownerToken);
    const unchanged = (await activeAlerts(healthyItemId))[0];
    assert.equal(unchanged.id, created.id);
    assert.equal(unchanged.triggeredAt.getTime(), firstTriggeredAt.getTime());

    const zero = await postJson('/api/transactions/usage', { itemId: healthyItemId, quantity: 2, date: isoDay(new Date()) });
    assert.equal(zero.response.status, 201, JSON.stringify(zero.body));
    assert.equal((await activeAlerts(healthyItemId))[0].type, 'OUT_OF_STOCK');
    const reorderHistory = await prisma.stockAlert.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(reorderHistory.status, 'RESOLVED');
    assert.match(reorderHistory.resolutionReason || '', /out of stock/i);
  });

  test('purchases resolve alerts and edits or cancellations recreate the correct condition', async () => {
    const purchase = await postJson('/api/purchases', {
      itemId: outItemId,
      quantity: 6,
      unitCost: 100,
      date: isoDay(new Date()),
      idempotencyKey: `${prefix}-purchase`,
    });
    assert.equal(purchase.response.status, 201, JSON.stringify(purchase.body));
    assert.equal((await activeAlerts(outItemId)).length, 0);
    const originalOut = await prisma.stockAlert.findFirstOrThrow({ where: { itemId: outItemId, type: 'OUT_OF_STOCK' }, orderBy: { triggeredAt: 'desc' } });
    assert.equal(originalOut.status, 'RESOLVED');

    const purchaseId = purchase.body.purchase.id;
    const edited = await request(`/api/purchases/${purchaseId}`, ownerToken, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: 4, unitCost: 110, date: isoDay(new Date()), idempotencyKey: `${prefix}-edit` }),
    });
    assert.equal(edited.response.status, 200, JSON.stringify(edited.body));
    assert.equal((await activeAlerts(outItemId))[0].type, 'NEEDS_REORDER');

    const replacementId = edited.body.purchase.id;
    const cancelled = await postJson(`/api/purchases/${replacementId}/cancel`, { reason: 'Supplier delivery cancelled', idempotencyKey: `${prefix}-cancel-purchase` });
    assert.equal(cancelled.response.status, 200, JSON.stringify(cancelled.body));
    assert.equal((await activeAlerts(outItemId))[0].type, 'OUT_OF_STOCK');
    assert.equal(await prisma.stockAlert.count({ where: { shopId: ownerShopId, itemId: outItemId } }), 3);
  });

  test('sale and manual usage deductions and reversals synchronize alerts atomically', async () => {
    const menu = await postJson('/api/menu', {
      name: `${prefix} Alert Chai`,
      category: 'TEA',
      sellingPrice: 25,
      recipeItems: [{ itemId: reorderItemId, quantity: 4 }],
    });
    assert.equal(menu.response.status, 201, JSON.stringify(menu.body));
    menuId = menu.body.menuItem.id;

    const sale = await postJson('/api/sales', {
      items: [{ menuItemId: menuId, quantity: 1 }],
      date: isoDay(new Date()),
      idempotencyKey: `${prefix}-sale`,
    });
    assert.equal(sale.response.status, 201, JSON.stringify(sale.body));
    assert.equal((await activeAlerts(reorderItemId))[0].type, 'OUT_OF_STOCK');
    const saleId = sale.body.sale.id;
    const saleCancelled = await postJson(`/api/sales/${saleId}/cancel`, { reason: 'Incorrect order', idempotencyKey: `${prefix}-cancel-sale` });
    assert.equal(saleCancelled.response.status, 200, JSON.stringify(saleCancelled.body));
    assert.equal((await activeAlerts(reorderItemId))[0].type, 'NEEDS_REORDER');

    const thresholds = await patchItem(lowItemId, { minStock: 2, reorderLevel: 5, targetStock: 10 });
    assert.equal(thresholds.response.status, 200, JSON.stringify(thresholds.body));
    assert.equal((await activeAlerts(lowItemId))[0].type, 'LOW_STOCK');

    const usage = await postJson('/api/usage-records', {
      items: [{ itemId: lowItemId, quantity: 2 }],
      date: isoDay(new Date()),
      idempotencyKey: `${prefix}-usage`,
    });
    assert.equal(usage.response.status, 201, JSON.stringify(usage.body));
    assert.equal((await activeAlerts(lowItemId))[0].type, 'OUT_OF_STOCK');
    const usageId = usage.body.usage.id;
    const usageCancelled = await postJson(`/api/usage-records/${usageId}/cancel`, { reason: 'Incorrect preparation entry', idempotencyKey: `${prefix}-cancel-usage` });
    assert.equal(usageCancelled.response.status, 200, JSON.stringify(usageCancelled.body));
    assert.equal((await activeAlerts(lowItemId))[0].type, 'LOW_STOCK');
  });

  test('read endpoints, filters, pagination, and tenant isolation preserve notification history', async () => {
    const before = await activeAlerts();
    const foreign = before[0];
    assert.equal((await postJson(`/api/alerts/${foreign.id}/read`, {}, otherToken)).response.status, 404);

    const readAll = await postJson('/api/alerts/read-all', {});
    assert.equal(readAll.response.status, 200, JSON.stringify(readAll.body));
    assert.equal(readAll.body.updatedCount, before.filter((alert) => !alert.readAt).length);
    assert.equal((await alertSummary()).unreadCount, 0);
    assert.equal(await prisma.stockAlert.count({ where: { shopId: ownerShopId, status: 'ACTIVE', readAt: null } }), 0);

    const otherSummary = await request('/api/alerts/summary', otherToken);
    assert.equal(otherSummary.response.status, 200);
    assert.equal(otherSummary.body.summary.activeCount, 1);
    assert.equal(otherSummary.body.summary.unreadCount, 1);
    assert.equal((await request(`/api/alerts?itemId=${otherItemId}`, ownerToken)).body.pagination.total, 0);

    const active = await request('/api/alerts?status=ACTIVE&limit=2&page=1', ownerToken);
    assert.equal(active.response.status, 200);
    assert.equal(active.body.alerts.length, 2);
    assert.equal(active.body.pagination.total, before.length);
    const resolved = await request('/api/alerts?status=RESOLVED&limit=100', ownerToken);
    assert.equal(resolved.response.status, 200);
    assert.ok(resolved.body.pagination.total >= 4);
    assert.ok(resolved.body.alerts.every((alert: any) => alert.status === 'RESOLVED' && alert.resolvedAt));
  });

  test('archiving resolves active monitoring and restoration recreates only the current condition', async () => {
    const archived = await patchItem(reorderItemId, { isActive: false });
    assert.equal(archived.response.status, 200, JSON.stringify(archived.body));
    assert.equal((await activeAlerts(reorderItemId)).length, 0);
    const resolved = await prisma.stockAlert.findFirstOrThrow({ where: { itemId: reorderItemId, status: 'RESOLVED' }, orderBy: { resolvedAt: 'desc' } });
    assert.match(resolved.resolutionReason || '', /archived/i);

    const restored = await patchItem(reorderItemId, { isActive: true });
    assert.equal(restored.response.status, 200, JSON.stringify(restored.body));
    assert.equal((await activeAlerts(reorderItemId)).length, 1);
    assert.equal((await activeAlerts(reorderItemId))[0].type, 'NEEDS_REORDER');
    assert.equal((await request(`/api/items/${otherItemId}`, ownerToken)).response.status, 404);
    assert.equal(ownerId.length > 0, true);
  });
});
