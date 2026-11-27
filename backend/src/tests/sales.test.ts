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
const prefix = `p6_${runId}`;
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
let teaId: string;
let milkId: string;
let cupsId: string;
let otherItemId: string;
let chaiMenuId: string;
let teaMenuId: string;
let firstSaleId: string;
let firstUsageId: string;

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

async function createAccount(label: string) {
  const user = await prisma.user.create({
    data: {
      username: `${prefix}_${label}`,
      email: `${prefix}-${label}@example.test`,
      password: 'unused-sales-fixture-password',
      name: `${label} Owner`,
      shop: { create: { name: `${prefix} ${label} Shop`, ownerName: `${label} Owner`, phone: '+91 98765 43210' } },
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

function salePayload(overrides: Record<string, unknown> = {}) {
  return {
    items: [{ menuItemId: chaiMenuId, quantity: 2 }, { menuItemId: teaMenuId, quantity: 1 }],
    reference: `${prefix}-order`,
    notes: 'Counter sale',
    date: isoDay(new Date()),
    idempotencyKey: `${prefix}-sale`,
    ...overrides,
  };
}

function usagePayload(overrides: Record<string, unknown> = {}) {
  return {
    items: [
      { itemId: teaId, quantity: 0.5, inputUnit: 'KG' },
      { itemId: milkId, quantity: 300, inputUnit: 'ML' },
      { itemId: cupsId, quantity: 2, inputUnit: 'PIECES' },
    ],
    reference: `${prefix}-prep`,
    notes: 'Morning preparation',
    date: isoDay(new Date()),
    idempotencyKey: `${prefix}-usage`,
    ...overrides,
  };
}

function postSale(payload: Record<string, unknown>, token = ownerToken) {
  return request('/api/sales', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

function postUsage(payload: Record<string, unknown>, token = ownerToken) {
  return request('/api/usage-records', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

function postMenu(payload: Record<string, unknown>, token = ownerToken) {
  return request('/api/menu', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

function patchMenu(id: string, payload: Record<string, unknown>, token = ownerToken) {
  return request(`/api/menu/${id}`, token, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

async function stock(itemId: string) {
  return (await request(`/api/items/${itemId}`, ownerToken)).body.item;
}

describe('Phase 6 sales, recipes, and stock usage API', { concurrency: false }, () => {
  before(async () => {
    ({ prisma } = await import('../utils/prisma'));
    ({ env } = await import('../config/env'));
    const { createApp } = await import('../app');
    server = createApp().listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const owner = await createAccount('owner');
    const other = await createAccount('other');
    ownerToken = owner.token;
    otherToken = other.token;
    ownerId = owner.user.id;
    ownerShopId = owner.user.shopId!;

    const tea = await prisma.inventoryItem.create({ data: { shopId: ownerShopId, name: `${prefix} Tea`, category: 'TEA_LEAVES', unit: 'KG', openingStock: 10, currentStock: 10, unitCost: 100, minStock: 1 } });
    const milk = await prisma.inventoryItem.create({ data: { shopId: ownerShopId, name: `${prefix} Milk`, category: 'DAIRY', unit: 'LITRES', openingStock: 5, currentStock: 5, unitCost: 50, minStock: 1 } });
    const cups = await prisma.inventoryItem.create({ data: { shopId: ownerShopId, name: `${prefix} Cups`, category: 'PACKAGING', unit: 'PIECES', openingStock: 20, currentStock: 20, unitCost: 5, minStock: 2 } });
    teaId = tea.id;
    milkId = milk.id;
    cupsId = cups.id;
    await prisma.stockTransaction.createMany({
      data: [
        { shopId: ownerShopId, itemId: teaId, type: 'PURCHASE', quantity: 10, unitCost: 100, totalCost: 1000, reference: 'OPENING-STOCK', idempotencyKey: `${prefix}-opening-tea`, createdById: ownerId },
        { shopId: ownerShopId, itemId: milkId, type: 'PURCHASE', quantity: 5, unitCost: 50, totalCost: 250, reference: 'OPENING-STOCK', idempotencyKey: `${prefix}-opening-milk`, createdById: ownerId },
        { shopId: ownerShopId, itemId: cupsId, type: 'PURCHASE', quantity: 20, unitCost: 5, totalCost: 100, reference: 'OPENING-STOCK', idempotencyKey: `${prefix}-opening-cups`, createdById: ownerId },
      ],
    });
    const otherItem = await prisma.inventoryItem.create({ data: { shopId: other.user.shopId!, name: `${prefix} Other Item`, category: 'OTHER', unit: 'KG', currentStock: 4, unitCost: 25 } });
    otherItemId = otherItem.id;

    const chai = await postMenu({ name: `${prefix} Masala Chai`, category: 'TEA', sellingPrice: 30, recipeItems: [{ itemId: teaId, quantity: 0.02 }, { itemId: milkId, quantity: 0.1 }] });
    const teaMenu = await postMenu({ name: `${prefix} Tea`, category: 'TEA', sellingPrice: 15, recipeItems: [{ itemId: teaId, quantity: 0.01 }] });
    assert.equal(chai.response.status, 201, JSON.stringify(chai.body));
    assert.equal(teaMenu.response.status, 201, JSON.stringify(teaMenu.body));
    chaiMenuId = chai.body.menuItem.id;
    teaMenuId = teaMenu.body.menuItem.id;
  });

  after(async () => {
    try {
      if (createdShopIds.length) {
        const shopOwned = { shopId: { in: createdShopIds } };
        const shopFilter = { id: { in: createdShopIds } };
        await prisma.stockTransaction.deleteMany({ where: shopOwned });
        await prisma.recipeItem.deleteMany({
          where: { OR: [{ menuItem: shopOwned }, { item: shopOwned }] },
        });
        await prisma.saleItem.deleteMany({ where: { sale: shopOwned } });
        await prisma.stockUsageItem.deleteMany({
          where: { OR: [{ usageRecord: shopOwned }, { item: shopOwned }] },
        });
        await prisma.sale.deleteMany({ where: shopOwned });
        await prisma.stockUsage.deleteMany({ where: shopOwned });
        await prisma.menuItem.deleteMany({ where: shopOwned });
        await prisma.inventoryItem.deleteMany({ where: shopOwned });
        await prisma.shop.deleteMany({ where: shopFilter });
      }
      if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    } finally {
      await prisma.$disconnect();
      if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('menu recipes validate ownership, count units, and duplicate names', async () => {
    const list = await request('/api/menu', ownerToken);
    assert.equal(list.response.status, 200);
    assert.equal(list.body.pagination.total, 2);
    assert.equal(list.body.menuItems.find((menu: any) => menu.id === chaiMenuId).recipeItems.length, 2);

    const duplicate = await postMenu({ name: `${prefix} Masala Chai`, sellingPrice: 30, recipeItems: [{ itemId: teaId, quantity: 0.02 }] });
    assert.equal(duplicate.response.status, 409);
    const crossTenant = await postMenu({ name: `${prefix} Cross Recipe`, sellingPrice: 10, recipeItems: [{ itemId: otherItemId, quantity: 1 }] });
    assert.equal(crossTenant.response.status, 404);
    const fractionalCount = await postMenu({ name: `${prefix} Fractional Cups`, sellingPrice: 10, recipeItems: [{ itemId: cupsId, quantity: 1.5 }] });
    assert.equal(fractionalCount.response.status, 400);
    assert.equal((await request(`/api/menu/${chaiMenuId}`, otherToken)).response.status, 404);
  });

  test('sale creation uses backend prices, deducts recipes atomically, and prevents duplicate stock deductions', async () => {
    const raced = await Promise.all([postSale(salePayload()), postSale(salePayload())]);
    assert.deepEqual(raced.map((result) => result.response.status).sort(), [200, 201]);
    const created = raced.find((result) => result.response.status === 201)!;
    const duplicate = raced.find((result) => result.response.status === 200)!;
    firstSaleId = created.body.sale.id;
    assert.equal(duplicate.body.sale.id, firstSaleId);
    assert.equal(duplicate.body.isDuplicate, true);
    assert.equal(created.body.sale.total, 75);
    assert.equal(created.body.sale.items.length, 2);
    assert.equal((await stock(teaId)).currentStock, 9.95);
    assert.equal((await stock(milkId)).currentStock, 4.8);
    assert.equal(created.body.sale.movements.length, 2);
    assert.deepEqual(created.body.sale.movements.map((movement: any) => movement.totalCost).sort((a: number, b: number) => a - b), [5, 10]);

    const retry = await postSale(salePayload());
    assert.equal(retry.response.status, 200);
    assert.equal(retry.body.isDuplicate, true);
    assert.equal((await stock(teaId)).currentStock, 9.95);

    await patchMenu(chaiMenuId, { name: `${prefix} Masala Chai`, category: 'TEA', sellingPrice: 99, recipeItems: [{ itemId: teaId, quantity: 0.03 }, { itemId: milkId, quantity: 0.1 }] });
    const historical = (await request(`/api/sales/${firstSaleId}`, ownerToken)).body.sale;
    assert.equal(historical.items.find((item: any) => item.menuItemId === chaiMenuId).unitPrice, 30);
    const dashboard = (await request('/api/dashboard/summary', ownerToken)).body.summary;
    assert.equal(dashboard.salesRevenueToday, 75);
    assert.equal(dashboard.cogsToday, 15);
    assert.equal(dashboard.grossProfitToday, 60);
  });

  test('insufficient stock, unavailable menu items, and cross-tenant access fail without partial records', async () => {
    const countBefore = await prisma.sale.count({ where: { shopId: ownerShopId } });
    const insufficient = await postSale(salePayload({ items: [{ menuItemId: chaiMenuId, quantity: 1000 }], idempotencyKey: `${prefix}-insufficient` }));
    assert.equal(insufficient.response.status, 400);
    assert.match(insufficient.body.message, /Insufficient stock/);
    assert.equal(await prisma.sale.count({ where: { shopId: ownerShopId } }), countBefore);
    assert.equal((await stock(teaId)).currentStock, 9.95);

    await patchMenu(teaMenuId, { name: `${prefix} Tea`, category: 'TEA', sellingPrice: 15, isActive: false, recipeItems: [{ itemId: teaId, quantity: 0.01 }] });
    const unavailable = await postSale(salePayload({ items: [{ menuItemId: teaMenuId, quantity: 1 }], idempotencyKey: `${prefix}-inactive` }));
    assert.equal(unavailable.response.status, 400);
    await patchMenu(teaMenuId, { name: `${prefix} Tea`, category: 'TEA', sellingPrice: 15, isActive: true, recipeItems: [{ itemId: teaId, quantity: 0.01 }] });

    const list = await request('/api/sales', ownerToken);
    assert.equal(list.body.pagination.total, 1);
    assert.equal(list.body.summary.revenue, 75);
    assert.equal(list.body.summary.itemsSold, 3);
    assert.equal((await request('/api/sales', otherToken)).body.pagination.total, 0);
    assert.equal((await request(`/api/sales/${firstSaleId}`, otherToken)).response.status, 404);
  });

  test('sale cancellation restores recipe stock, preserves reversals, and updates dashboard financials', async () => {
    const payload = { reason: 'Customer returned the order', idempotencyKey: `${prefix}-cancel-sale` };
    const cancelled = await request(`/api/sales/${firstSaleId}/cancel`, ownerToken, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal(cancelled.response.status, 200, JSON.stringify(cancelled.body));
    assert.equal(cancelled.body.sale.status, 'CANCELLED');
    assert.equal(cancelled.body.reversals.length, 2);
    assert.equal((await stock(teaId)).currentStock, 10);
    assert.equal((await stock(milkId)).currentStock, 5);
    const retry = await request(`/api/sales/${firstSaleId}/cancel`, ownerToken, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal(retry.body.isDuplicate, true);
    assert.equal((await stock(teaId)).currentStock, 10);
    assert.equal(await prisma.stockTransaction.count({ where: { shopId: ownerShopId, saleId: firstSaleId, type: 'REVERSAL' } }), 2);
    const dashboard = (await request('/api/dashboard/summary', ownerToken)).body.summary;
    assert.equal(dashboard.salesRevenueToday, 0);
    assert.equal(dashboard.cogsToday, 0);
    assert.equal(dashboard.grossProfitToday, 0);
    const trend = (await request(`/api/dashboard/movement-trend?from=${isoDay(new Date())}&to=${isoDay(new Date())}`, ownerToken)).body;
    assert.equal(trend.totals.usageValue, 0);
  });

  test('manual usage supports multiple items, conversions, cost snapshots, filters, and idempotency', async () => {
    const raced = await Promise.all([postUsage(usagePayload()), postUsage(usagePayload())]);
    assert.deepEqual(raced.map((result) => result.response.status).sort(), [200, 201]);
    const created = raced.find((result) => result.response.status === 201)!;
    firstUsageId = created.body.usage.id;
    assert.equal(created.body.usage.totalCost, 75);
    assert.equal(created.body.usage.items.length, 3);
    assert.equal(created.body.usage.movements.length, 3);
    assert.equal((await stock(teaId)).currentStock, 9.5);
    assert.equal((await stock(milkId)).currentStock, 4.7);
    assert.equal((await stock(cupsId)).currentStock, 18);
    const list = await request(`/api/usage-records?itemId=${milkId}`, ownerToken);
    assert.equal(list.body.pagination.total, 1);
    assert.equal(list.body.summary.activeUsageCount, 1);
    assert.equal(list.body.summary.totalCost, 75);
    assert.equal((await request('/api/usage-records', otherToken)).body.pagination.total, 0);
    assert.equal((await request(`/api/usage-records/${firstUsageId}`, otherToken)).response.status, 404);
  });

  test('usage cancellation restores all items and invalid units or quantities roll back safely', async () => {
    const payload = { reason: 'Preparation entry was incorrect', idempotencyKey: `${prefix}-cancel-usage` };
    const cancelled = await request(`/api/usage-records/${firstUsageId}/cancel`, ownerToken, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal(cancelled.response.status, 200, JSON.stringify(cancelled.body));
    assert.equal(cancelled.body.usage.status, 'CANCELLED');
    assert.equal(cancelled.body.reversals.length, 3);
    assert.equal((await stock(teaId)).currentStock, 10);
    assert.equal((await stock(milkId)).currentStock, 5);
    assert.equal((await stock(cupsId)).currentStock, 20);
    const retry = await request(`/api/usage-records/${firstUsageId}/cancel`, ownerToken, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal(retry.body.isDuplicate, true);
    assert.equal((await stock(cupsId)).currentStock, 20);

    const incompatible = await postUsage(usagePayload({ items: [{ itemId: teaId, quantity: 1, inputUnit: 'LITRES' }], idempotencyKey: `${prefix}-bad-unit` }));
    assert.equal(incompatible.response.status, 400);
    const fractional = await postUsage(usagePayload({ items: [{ itemId: cupsId, quantity: 0.5, inputUnit: 'PIECES' }], idempotencyKey: `${prefix}-fractional` }));
    assert.equal(fractional.response.status, 400);
    const insufficient = await postUsage(usagePayload({ items: [{ itemId: teaId, quantity: 1000, inputUnit: 'KG' }], idempotencyKey: `${prefix}-overdraw` }));
    assert.equal(insufficient.response.status, 400);
    assert.equal((await stock(teaId)).currentStock, 10);
    assert.equal(await prisma.stockUsage.count({ where: { shopId: ownerShopId } }), 1);
  });
});
