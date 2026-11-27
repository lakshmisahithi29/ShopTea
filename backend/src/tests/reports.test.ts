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
const prefix = `p8_${runId}`;
const createdUserIds: string[] = [];
const createdShopIds: string[] = [];

let server: Server;
let baseUrl: string;
let prisma: typeof import('../utils/prisma').prisma;
let env: typeof import('../config/env').env;
let ownerToken: string;
let otherToken: string;
let noShopToken: string;
let ownerShopId: string;
let teaId: string;
let milkId: string;
let cupsId: string;
let otherItemId: string;
let menuId: string;
let from: string;
let to: string;

interface TestResponse { response: globalThis.Response; body: any }

async function request(path: string, token?: string): Promise<TestResponse> {
  const response = await fetch(`${baseUrl}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const text = await response.text();
  let body: any = text;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

async function createAccount(label: string, withShop = true) {
  const user = await prisma.user.create({
    data: {
      username: `${prefix}_${label}`,
      email: `${prefix}-${label}@example.test`,
      password: 'unused-report-fixture-password',
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

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(12, 0, 0, 0);
  return date;
}

async function overview(params = '', token = ownerToken) {
  const result = await request(`/api/reports/overview?${params}`, token);
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body.report;
}

describe('Phase 8 reports and analytics API', { concurrency: false }, () => {
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
    ownerShopId = owner.user.shopId!;
    from = isoDay(daysAgo(6));
    to = isoDay(new Date());

    const tea = await prisma.inventoryItem.create({ data: { shopId: ownerShopId, name: `${prefix} Tea`, category: 'TEA_LEAVES', unit: 'KG', currentStock: 8.6, unitCost: 100, minStock: 1, reorderLevel: 5, targetStock: 20 } });
    const milk = await prisma.inventoryItem.create({ data: { shopId: ownerShopId, name: `${prefix} Milk`, category: 'DAIRY', unit: 'LITRES', currentStock: 4.3, unitCost: 40, minStock: 1, reorderLevel: 3, targetStock: 10 } });
    const cups = await prisma.inventoryItem.create({ data: { shopId: ownerShopId, name: `${prefix} Cups`, category: 'PACKAGING', unit: 'PIECES', currentStock: 2, unitCost: 5, minStock: 1, reorderLevel: 2, targetStock: 10 } });
    teaId = tea.id;
    milkId = milk.id;
    cupsId = cups.id;
    const otherItem = await prisma.inventoryItem.create({ data: { shopId: other.user.shopId!, name: `${prefix} Other Item`, category: 'OTHER', unit: 'KG', currentStock: 3, unitCost: 10 } });
    otherItemId = otherItem.id;

    const menu = await prisma.menuItem.create({ data: { shopId: ownerShopId, name: `${prefix} Chai`, category: 'TEA', sellingPrice: 30 } });
    menuId = menu.id;
    await prisma.recipeItem.createMany({ data: [{ menuItemId: menuId, itemId: teaId, quantity: 0.2 }, { menuItemId: menuId, itemId: milkId, quantity: 0.1 }] });

    await prisma.stockTransaction.createMany({
      data: [
        { shopId: ownerShopId, itemId: teaId, type: 'PURCHASE', quantity: 10, unitCost: 100, totalCost: 1000, date: daysAgo(2) },
        { shopId: ownerShopId, itemId: milkId, type: 'PURCHASE', quantity: 5, unitCost: 40, totalCost: 200, date: daysAgo(1) },
        { shopId: ownerShopId, itemId: teaId, type: 'USAGE', quantity: 1, unitCost: 100, totalCost: 100, date: daysAgo(3), reference: 'MANUAL-PREP' },
        { shopId: ownerShopId, itemId: milkId, type: 'WASTAGE', quantity: 0.5, unitCost: 40, totalCost: 20, date: daysAgo(4), wastageReason: 'SPOILED' },
        { shopId: ownerShopId, itemId: teaId, type: 'PURCHASE', quantity: 999, unitCost: 100, totalCost: 99900, date: daysAgo(2), status: 'CANCELLED', reference: 'CANCELLED-DO-NOT-INCLUDE' },
        { shopId: ownerShopId, itemId: teaId, type: 'PURCHASE', quantity: 5, unitCost: 100, totalCost: 500, date: daysAgo(9) },
        { shopId: ownerShopId, itemId: milkId, type: 'USAGE', quantity: 1, unitCost: 40, totalCost: 40, date: daysAgo(10) },
      ],
    });

    const sale = await prisma.sale.create({
      data: {
        shopId: ownerShopId,
        total: 60,
        status: 'ACTIVE',
        date: new Date(),
        items: { create: { menuItemId: menuId, name: `${prefix} Chai`, quantity: 2, unitPrice: 30, total: 60 } },
      },
    });
    await prisma.stockTransaction.createMany({
      data: [
        { shopId: ownerShopId, itemId: teaId, saleId: sale.id, type: 'USAGE', quantity: 0.4, unitCost: 100, totalCost: 40, date: sale.date },
        { shopId: ownerShopId, itemId: milkId, saleId: sale.id, type: 'USAGE', quantity: 0.2, unitCost: 40, totalCost: 8, date: sale.date },
      ],
    });
    const previousSale = await prisma.sale.create({
      data: {
        shopId: ownerShopId,
        total: 30,
        status: 'ACTIVE',
        date: daysAgo(8),
        items: { create: { menuItemId: menuId, name: `${prefix} Chai`, quantity: 1, unitPrice: 30, total: 30 } },
      },
    });
    await prisma.stockTransaction.create({
      data: { shopId: ownerShopId, itemId: teaId, saleId: previousSale.id, type: 'USAGE', quantity: 0.3, unitCost: 100, totalCost: 30, date: previousSale.date },
    });
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

  test('reports require authentication, a shop, and valid filters', async () => {
    assert.equal((await request('/api/reports/overview')).response.status, 401);
    assert.equal((await request('/api/reports/overview', noShopToken)).response.status, 401);
    assert.equal((await request('/api/reports/overview?from=invalid', ownerToken)).response.status, 400);
    assert.equal((await request('/api/reports/overview?granularity=year', ownerToken)).response.status, 400);
    assert.equal((await request('/api/reports/overview?itemId=not-a-uuid', ownerToken)).response.status, 400);
  });

  test('overview calculates sales, COGS, profit, purchases, consumption, valuation, and comparisons', async () => {
    const report = await overview(`from=${from}&to=${to}&granularity=day`);
    assert.deepEqual(report.summary, {
      salesCount: 1,
      revenue: 60,
      cogs: 48,
      grossProfit: 12,
      reliableCost: true,
      purchaseCount: 2,
      purchaseValue: 1200,
      consumptionCount: 3,
      consumptionValue: 148,
      recipeConsumptionValue: 48,
      manualConsumptionValue: 100,
      inventoryValue: 1042,
      inventoryItemCount: 3,
      costMethod: 'WEIGHTED_AVERAGE',
      grossProfitDefinition: 'Recorded active sales revenue minus recorded active sale-recipe COGS.',
    });
    assert.equal(report.comparison.revenue.change, 30);
    assert.equal(report.comparison.revenue.percentChange, 100);
    assert.equal(report.comparison.purchaseValue.percentChange, 140);
    assert.equal(report.comparison.consumptionValue.percentChange, 111.43);
    assert.equal(report.comparison.cogs.percentChange, 60);
    assert.equal(report.comparison.grossProfit.change, 12);
    assert.equal(report.comparison.grossProfit.percentChange, null);
    assert.equal(report.trend.length, 7);
    assert.equal(report.trend.reduce((sum: number, row: any) => sum + row.revenue, 0), 60);
    assert.equal(report.trend.reduce((sum: number, row: any) => sum + row.cogs, 0), 48);
    assert.equal(report.inventory.find((item: any) => item.itemId === teaId).value, 860);
    assert.equal(report.consumptionByItem.find((item: any) => item.itemId === teaId).quantity, 1.4);
    assert.equal(report.movements.some((movement: any) => movement.reference === 'CANCELLED-DO-NOT-INCLUDE'), true);
  });

  test('item filters and weekly or monthly granularity remain consistent with source records', async () => {
    const tea = await overview(`from=${from}&to=${to}&itemId=${teaId}&granularity=week`);
    assert.equal(tea.summary.revenue, 60);
    assert.equal(tea.summary.cogs, 40);
    assert.equal(tea.summary.grossProfit, 20);
    assert.equal(tea.summary.purchaseValue, 1000);
    assert.equal(tea.summary.consumptionValue, 140);
    assert.equal(tea.summary.inventoryValue, 860);
    assert.equal(tea.trend.reduce((sum: number, row: any) => sum + row.revenue, 0), 60);
    assert.equal(tea.trend.reduce((sum: number, row: any) => sum + row.cogs, 0), 40);
    const month = await overview(`from=${from}&to=${to}&granularity=month`);
    assert.equal(month.trend.reduce((sum: number, row: any) => sum + row.revenue, 0), 60);
    assert.equal(month.trend.reduce((sum: number, row: any) => sum + row.purchaseValue, 0), 1200);
  });

  test('empty datasets and tenant isolation return safe zero values', async () => {
    const other = await overview(`from=${from}&to=${to}`, otherToken);
    assert.equal(other.summary.revenue, 0);
    assert.equal(other.summary.cogs, 0);
    assert.equal(other.summary.grossProfit, 0);
    assert.equal(other.summary.purchaseValue, 0);
    assert.equal(other.summary.consumptionValue, 0);
    assert.equal(other.summary.inventoryItemCount, 1);
    assert.equal(other.trend.every((row: any) => row.revenue === 0), true);
    assert.equal((await request(`/api/reports/overview?itemId=${otherItemId}`, ownerToken)).response.status, 404);
    assert.equal((await request(`/api/reports/overview?itemId=${teaId}`, otherToken)).response.status, 404);
  });

  test('CSV exports use filtered records and safe spreadsheet cells', async () => {
    const purchases = await request(`/api/reports/export?type=purchases&from=${from}&to=${to}`, ownerToken);
    assert.equal(purchases.response.status, 200);
    assert.match(purchases.response.headers.get('content-type') || '', /text\/csv/);
    assert.match(purchases.response.headers.get('content-disposition') || '', /shoptea-purchases/);
    assert.match(purchases.body, /Tea/);
    assert.match(purchases.body, /Milk/);
    assert.doesNotMatch(purchases.body, /CANCELLED-DO-NOT-INCLUDE/);
    const sales = await request(`/api/reports/export?type=sales&from=${from}&to=${to}`, ownerToken);
    assert.match(sales.body, /Chai/);
    const inventory = await request(`/api/reports/export?type=inventory&from=${from}&to=${to}`, ownerToken);
    assert.match(inventory.body, /Inventory value/);
    assert.equal((await request('/api/reports/export?type=invalid', ownerToken)).response.status, 400);
  });

  test('gross profit is withheld when recorded sale cost data is incomplete', async () => {
    await prisma.sale.create({
      data: {
        shopId: ownerShopId,
        total: 20,
        status: 'ACTIVE',
        date: daysAgo(5),
        items: { create: { menuItemId: menuId, name: `${prefix} Chai`, quantity: 1, unitPrice: 20, total: 20 } },
      },
    });
    const date = isoDay(daysAgo(5));
    const report = await overview(`from=${date}&to=${date}`);
    assert.equal(report.summary.revenue, 20);
    assert.equal(report.summary.cogs, 0);
    assert.equal(report.summary.reliableCost, false);
    assert.equal(report.summary.grossProfit, null);
    assert.equal(report.comparison.grossProfit.change, null);
  });
});
