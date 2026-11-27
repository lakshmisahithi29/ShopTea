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
const prefix = `p3_${runId}`;
const createdUserIds: string[] = [];
const createdShopIds: string[] = [];

let server: Server;
let baseUrl: string;
let prisma: typeof import('../utils/prisma').prisma;
let env: typeof import('../config/env').env;
let ownerToken: string;
let otherToken: string;
let noShopToken: string;
let emptyToken: string;
let teaId: string;
let milkId: string;
let cupsId: string;
let otherItemId: string;
let wasteMilkId: string;
let otherTransactionId: string;

interface TestResponse {
  response: globalThis.Response;
  body: any;
}

async function request(
  path: string,
  token?: string,
  init: RequestInit = {}
): Promise<TestResponse> {
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

function at(day: number, hour: number, minute = 0): Date {
  return new Date(2026, 0, day, hour, minute, 0, 0);
}

async function createAccount(label: string, withShop: boolean) {
  const user = await prisma.user.create({
    data: {
      username: `${prefix}_${label}`,
      email: `${prefix}-${label}@example.test`,
      password: 'unused-dashboard-fixture-password',
      name: `${label} Owner`,
      ...(withShop
        ? {
            shop: {
              create: {
                name: `${prefix} ${label} Shop`,
                ownerName: `${label} Owner`,
                phone: '+91 98765 43210',
                currency: label === 'owner' ? 'USD' : 'INR',
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
    {
      userId: user.id,
      username: user.username,
      email: user.email,
      shopId: user.shopId,
    },
    env.JWT_SECRET,
    { expiresIn: '1h', algorithm: 'HS256' }
  );
  return { user, token };
}

describe('Phase 3 dashboard API', { concurrency: false }, () => {
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
    const empty = await createAccount('empty', true);
    ownerToken = owner.token;
    otherToken = other.token;
    noShopToken = noShop.token;
    emptyToken = empty.token;
    const shopId = owner.user.shopId!;
    const otherShopId = other.user.shopId!;

    const tea = await prisma.inventoryItem.create({
      data: {
        shopId,
        name: `${prefix} Tea`,
        category: 'TEA_LEAVES',
        unit: 'KG',
        openingStock: 10,
        currentStock: 10,
        unitCost: 100,
        minStock: 2,
        reorderLevel: 5,
        targetStock: 20,
      },
    });
    const milk = await prisma.inventoryItem.create({
      data: {
        shopId,
        name: `${prefix} Milk`,
        category: 'DAIRY',
        unit: 'LITRES',
        openingStock: 1,
        currentStock: 1,
        unitCost: 50,
        minStock: 2,
        reorderLevel: 5,
        targetStock: 10,
      },
    });
    const cups = await prisma.inventoryItem.create({
      data: {
        shopId,
        name: `${prefix} Cups`,
        category: 'PACKAGING',
        unit: 'PIECES',
        openingStock: 0,
        currentStock: 0,
        unitCost: 10,
        minStock: 1,
        reorderLevel: 5,
        targetStock: 30,
      },
    });
    await prisma.inventoryItem.create({
      data: {
        shopId,
        name: `${prefix} Archived Snacks`,
        category: 'SNACKS',
        unit: 'PIECES',
        openingStock: 999,
        currentStock: 999,
        unitCost: 999,
        minStock: 1,
        reorderLevel: 5,
        targetStock: 1000,
        isActive: false,
      },
    });
    const otherItem = await prisma.inventoryItem.create({
      data: {
        shopId: otherShopId,
        name: `${prefix} Other Item`,
        category: 'OTHER',
        unit: 'KG',
        openingStock: 7,
        currentStock: 7,
        unitCost: 25,
        minStock: 1,
        reorderLevel: 2,
        targetStock: 10,
      },
    });
    teaId = tea.id;
    milkId = milk.id;
    cupsId = cups.id;
    otherItemId = otherItem.id;

    const wasteMilk = await prisma.stockTransaction.create({
      data: {
        shopId,
        itemId: milk.id,
        type: 'WASTAGE',
        quantity: 2,
        unitCost: 50,
        totalCost: 100,
        wastageReason: 'EXPIRED',
        date: at(12, 13),
        createdById: owner.user.id,
      },
    });
    wasteMilkId = wasteMilk.id;
    await prisma.stockTransaction.createMany({
      data: [
        {
          shopId,
          itemId: tea.id,
          type: 'PURCHASE',
          quantity: 2,
          unitCost: 100,
          totalCost: 200,
          date: at(10, 10),
          createdById: owner.user.id,
        },
        {
          shopId,
          itemId: tea.id,
          type: 'USAGE',
          quantity: 1,
          unitCost: 100,
          totalCost: 100,
          date: at(10, 15),
          createdById: owner.user.id,
        },
        {
          shopId,
          itemId: milk.id,
          type: 'PURCHASE',
          quantity: 1,
          unitCost: 50,
          totalCost: 50,
          date: at(12, 9),
          createdById: owner.user.id,
        },
        {
          shopId,
          itemId: tea.id,
          type: 'WASTAGE',
          quantity: 0.5,
          unitCost: 100,
          totalCost: 50,
          wastageReason: 'SPOILED',
          date: at(12, 12),
          createdById: owner.user.id,
        },
        {
          shopId,
          itemId: tea.id,
          type: 'PURCHASE',
          quantity: 5,
          unitCost: 100,
          totalCost: 500,
          date: at(9, 23, 59),
          createdById: owner.user.id,
        },
      ],
    });
    const otherTransaction = await prisma.stockTransaction.create({
      data: {
        shopId: otherShopId,
        itemId: otherItem.id,
        type: 'PURCHASE',
        quantity: 10,
        unitCost: 99.9,
        totalCost: 999,
        date: at(11, 12),
        createdById: other.user.id,
      },
    });
    otherTransactionId = otherTransaction.id;
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

  test('dashboard requires authentication and a configured shop', async () => {
    assert.equal((await request('/api/dashboard/summary')).response.status, 401);
    const noShop = await request('/api/dashboard/summary', noShopToken);
    assert.equal(noShop.response.status, 401);
    assert.match(noShop.body.message, /shop profile required/i);
  });

  test('summary totals, status counts, categories, and stock levels match fixtures', async () => {
    const { response, body } = await request('/api/dashboard/summary', ownerToken);
    assert.equal(response.status, 200);
    assert.deepEqual(body.summary, {
      totalActiveItems: 3,
      totalInventoryValue: 1050,
      lowStockCount: 1,
      outOfStockCount: 1,
      itemsNeedingReplenishment: 2,
      salesCountToday: 0,
      salesRevenueToday: 0,
      cogsToday: 0,
      grossProfitToday: 0,
    });
    assert.deepEqual(body.stockValueByCategory, [
      { category: 'TEA_LEAVES', value: 1000, itemCount: 1 },
      { category: 'DAIRY', value: 50, itemCount: 1 },
      { category: 'PACKAGING', value: 0, itemCount: 1 },
    ]);
    assert.deepEqual(body.topItemsByStock.map((item: any) => item.id), [teaId, milkId, cupsId]);
    assert.deepEqual(body.lowStockItems.map((item: any) => item.id), [milkId]);
    assert.deepEqual(body.outOfStockItems.map((item: any) => item.id), [cupsId]);
  });

  test('movement trend uses inclusive local date boundaries and excludes outside movements', async () => {
    const { response, body } = await request(
      '/api/dashboard/movement-trend?from=2026-01-10&to=2026-01-12',
      ownerToken
    );
    assert.equal(response.status, 200);
    assert.equal(body.from, at(10, 0).toISOString());
    assert.equal(body.to, new Date(2026, 0, 12, 23, 59, 59, 999).toISOString());
    assert.deepEqual(body.series.map((row: any) => row.date), ['2026-01-10', '2026-01-11', '2026-01-12']);
    assert.deepEqual(body.totals, { purchaseValue: 250, usageValue: 100 });
    assert.equal(body.series[0].purchaseValue, 200);
    assert.equal(body.series[0].usageValue, 100);
    assert.equal(body.series[2].purchaseValue, 50);

    const reversed = await request('/api/dashboard/movement-trend?from=2026-01-12&to=2026-01-10', ownerToken);
    assert.equal(reversed.response.status, 400);
    const invalid = await request('/api/dashboard/movement-trend?from=2026-02-30&to=2026-03-01', ownerToken);
    assert.equal(invalid.response.status, 400);
  });

  test('wastage totals keep units separate and group reasons and items', async () => {
    const summary = await request('/api/dashboard/wastage-summary?from=2026-01-10&to=2026-01-12', ownerToken);
    assert.equal(summary.response.status, 200);
    assert.equal(summary.body.totalValue, 150);
    assert.equal(summary.body.transactionCount, 2);
    assert.deepEqual(summary.body.quantityByUnit, { KG: 0.5, LITRES: 2 });
    assert.deepEqual(summary.body.byReason, [
      { reason: 'EXPIRED', value: 100, quantityByUnit: { LITRES: 2 }, count: 1 },
      { reason: 'SPOILED', value: 50, quantityByUnit: { KG: 0.5 }, count: 1 },
    ]);
    assert.deepEqual(summary.body.byItem.map((row: any) => [row.itemId, row.value]), [
      [milkId, 100],
      [teaId, 50],
    ]);

    const trend = await request('/api/dashboard/wastage-trend?from=2026-01-10&to=2026-01-12', ownerToken);
    assert.equal(trend.body.totalValue, 150);
    assert.equal(trend.body.series[2].value, 150);
    assert.equal(trend.body.series[2].count, 2);
  });

  test('recent movements are ordered and limited to the authenticated shop', async () => {
    const { body } = await request('/api/dashboard/recent-movements', ownerToken);
    assert.equal(body.movements.length, 6);
    assert.equal(body.movements[0].id, wasteMilkId);
    assert.equal(body.movements.some((row: any) => row.id === otherTransactionId), false);
    assert.equal(body.movements[0].item.id, milkId);
  });

  test('replenishment returns urgency order, quantities, and estimated costs', async () => {
    const { response, body } = await request('/api/dashboard/replenishment', ownerToken);
    assert.equal(response.status, 200);
    assert.deepEqual(body.items.map((item: any) => item.id), [cupsId, milkId]);
    assert.deepEqual(body.items.map((item: any) => item.status), ['OUT_OF_STOCK', 'LOW_STOCK']);
    assert.deepEqual(body.items.map((item: any) => item.suggestedQty), [30, 9]);
    assert.deepEqual(body.items.map((item: any) => item.estimatedCost), [300, 450]);
  });

  test('another tenant sees only its own items, movements, and trend totals', async () => {
    const summary = await request('/api/dashboard/summary', otherToken);
    assert.equal(summary.body.summary.totalActiveItems, 1);
    assert.equal(summary.body.summary.totalInventoryValue, 175);
    assert.deepEqual(summary.body.topItemsByStock.map((item: any) => item.id), [otherItemId]);

    const recent = await request('/api/dashboard/recent-movements', otherToken);
    assert.deepEqual(recent.body.movements.map((row: any) => row.id), [otherTransactionId]);

    const trend = await request('/api/dashboard/movement-trend?from=2026-01-10&to=2026-01-12', otherToken);
    assert.deepEqual(trend.body.totals, { purchaseValue: 999, usageValue: 0 });
  });

  test('a newly created empty shop returns zeroed dashboard data', async () => {
    const summary = await request('/api/dashboard/summary', emptyToken);
    assert.deepEqual(summary.body.summary, {
      totalActiveItems: 0,
      totalInventoryValue: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      itemsNeedingReplenishment: 0,
      salesCountToday: 0,
      salesRevenueToday: 0,
      cogsToday: 0,
      grossProfitToday: 0,
    });
    assert.deepEqual(summary.body.topItemsByStock, []);
    assert.deepEqual(summary.body.stockValueByCategory, []);
    assert.deepEqual((await request('/api/dashboard/recent-movements', emptyToken)).body.movements, []);
    assert.deepEqual((await request('/api/dashboard/replenishment', emptyToken)).body.items, []);
  });

  test('date-only transactions accept local today and reject future or invalid dates', async () => {
    const today = isoDay(new Date());
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const postPurchase = (date: string) => request('/api/transactions/purchase', ownerToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemId: teaId,
        quantity: 0.25,
        unitCost: 100,
        date,
        reference: `${prefix}-local-date`,
        idempotencyKey: `${prefix}-local-${date}`,
      }),
    });

    const accepted = await postPurchase(today);
    assert.equal(accepted.response.status, 201);
    assert.equal(isoDay(accepted.body.transaction.date), today);
    assert.equal(accepted.body.newStock, 10.25);

    const future = await postPurchase(isoDay(tomorrow));
    assert.equal(future.response.status, 400);
    assert.match(future.body.message, /cannot be in the future/i);

    const invalid = await postPurchase('2026-02-30');
    assert.equal(invalid.response.status, 400);
    assert.match(invalid.body.message, /invalid transaction date/i);
  });
});
