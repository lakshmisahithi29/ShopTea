import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { after, before, describe, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { isoDay } from '../utils/dateRange';
import {
  addCalendarDays,
  calculateReorderRecommendation,
  classifyTrend,
  daysOfCover,
  forecastDataQuality,
  weightedMovingAverage,
} from '../services/forecastMath';

process.env.NODE_ENV = 'test';

const runId = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
const prefix = `p9_${runId}`;
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
let idleId: string;
let otherItemId: string;
let menuId: string;
let today: Date;

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
      password: 'unused-forecast-fixture-password',
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
  const date = new Date(today);
  date.setDate(date.getDate() - days);
  date.setHours(12, 0, 0, 0);
  return date;
}

async function forecast(params = '', token = ownerToken) {
  const result = await request(`/api/forecasts?${params}`, token);
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body.forecast;
}

async function createSale(days: number, quantity: number, status: 'ACTIVE' | 'CANCELLED' = 'ACTIVE') {
  const date = daysAgo(days);
  const total = 30 * quantity;
  const sale = await prisma.sale.create({
    data: {
      shopId: ownerShopId,
      total,
      status,
      date,
      items: { create: { menuItemId: menuId, name: `${prefix} Chai`, quantity, unitPrice: 30, total } },
    },
  });
  await prisma.stockTransaction.create({
    data: {
      shopId: ownerShopId,
      itemId: teaId,
      saleId: sale.id,
      type: 'USAGE',
      quantity: 0.2 * quantity,
      unitCost: 100,
      totalCost: 20 * quantity,
      date,
      status,
    },
  });
}

describe('Phase 9 stock forecasting API', { concurrency: false }, () => {
  before(async () => {
    today = new Date();
    today.setHours(0, 0, 0, 0);
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

    const tea = await prisma.inventoryItem.create({ data: { shopId: ownerShopId, name: `${prefix} Tea`, category: 'TEA_LEAVES', unit: 'KG', currentStock: 10, unitCost: 100, minStock: 2, reorderLevel: 4, targetStock: 20, leadTimeDays: 2 } });
    const milk = await prisma.inventoryItem.create({ data: { shopId: ownerShopId, name: `${prefix} Milk`, category: 'DAIRY', unit: 'LITRES', currentStock: 5, unitCost: 40, minStock: 1, reorderLevel: 3, targetStock: 10, leadTimeDays: 1 } });
    const idle = await prisma.inventoryItem.create({ data: { shopId: ownerShopId, name: `${prefix} Idle`, category: 'PACKAGING', unit: 'PIECES', currentStock: 8, unitCost: 5, minStock: 1, reorderLevel: 2, targetStock: 10 } });
    teaId = tea.id;
    milkId = milk.id;
    idleId = idle.id;
    const otherItem = await prisma.inventoryItem.create({ data: { shopId: other.user.shopId!, name: `${prefix} Other Item`, category: 'OTHER', unit: 'KG', currentStock: 3, unitCost: 10 } });
    otherItemId = otherItem.id;

    const menu = await prisma.menuItem.create({ data: { shopId: ownerShopId, name: `${prefix} Chai`, category: 'TEA', sellingPrice: 30 } });
    menuId = menu.id;
    await prisma.recipeItem.create({ data: { menuItemId: menuId, itemId: teaId, quantity: 0.2 } });

    for (let days = 13; days >= 7; days -= 1) await createSale(days, 1);
    for (let days = 6; days >= 1; days -= 1) await createSale(days, 1);
    await createSale(0, 2);
    await createSale(4, 10, 'CANCELLED');

    for (let days = 13; days >= 7; days -= 1) {
      await prisma.stockTransaction.create({ data: { shopId: ownerShopId, itemId: teaId, type: 'USAGE', quantity: 0.8, unitCost: 100, totalCost: 80, date: daysAgo(days), reference: 'MANUAL-PREP' } });
    }
    for (let days = 6; days >= 1; days -= 1) {
      await prisma.stockTransaction.create({ data: { shopId: ownerShopId, itemId: teaId, type: 'USAGE', quantity: 0.8, unitCost: 100, totalCost: 80, date: daysAgo(days), reference: 'MANUAL-PREP' } });
    }
    await prisma.stockTransaction.create({ data: { shopId: ownerShopId, itemId: teaId, type: 'USAGE', quantity: 1.6, unitCost: 100, totalCost: 160, date: daysAgo(0), reference: 'MANUAL-PREP' } });

    for (let days = 3; days >= 1; days -= 1) {
      await prisma.stockTransaction.create({ data: { shopId: ownerShopId, itemId: milkId, type: 'USAGE', quantity: 1, unitCost: 40, totalCost: 40, date: daysAgo(days), reference: 'MANUAL-PREP' } });
    }
    await prisma.stockTransaction.createMany({
      data: [
        { shopId: ownerShopId, itemId: teaId, type: 'PURCHASE', quantity: 10, unitCost: 100, totalCost: 1000, date: daysAgo(2) },
        { shopId: ownerShopId, itemId: milkId, type: 'PURCHASE', quantity: 5, unitCost: 40, totalCost: 200, date: daysAgo(1) },
        { shopId: ownerShopId, itemId: milkId, type: 'WASTAGE', quantity: 0.5, unitCost: 40, totalCost: 20, date: daysAgo(3), wastageReason: 'SPOILED' },
        { shopId: ownerShopId, itemId: teaId, type: 'PURCHASE', quantity: 999, unitCost: 100, totalCost: 99900, date: daysAgo(2), status: 'CANCELLED', reference: 'CANCELLED-DO-NOT-INCLUDE' },
      ],
    });
  });

  after(async () => {
    try {
      if (createdShopIds.length) {
        const shopOwned = { shopId: { in: createdShopIds } };
        await prisma.stockTransaction.deleteMany({ where: shopOwned });
        await prisma.recipeItem.deleteMany({ where: { OR: [{ menuItem: shopOwned }, { item: shopOwned }] } });
        await prisma.saleItem.deleteMany({ where: { sale: shopOwned } });
        await prisma.sale.deleteMany({ where: shopOwned });
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

  test('forecasting math is deterministic and keeps reorder inputs explicit', () => {
    assert.equal(weightedMovingAverage([1, 1, 1, 1, 1, 1, 2], 7), 1.25);
    assert.equal(weightedMovingAverage([], 7), 0);
    assert.deepEqual(classifyTrend([1, 1, 1, 1, 1, 1, 2], [1, 1, 1, 1, 1, 1, 1]), { trend: 'INCREASING', percentChange: ((8 / 7) - 1) * 100 });
    assert.deepEqual(classifyTrend([1, 1], [2, 2]), { trend: 'DECREASING', percentChange: -50 });
    assert.equal(forecastDataQuality(2), 'INSUFFICIENT');
    assert.equal(forecastDataQuality(3), 'LIMITED');
    assert.equal(forecastDataQuality(7), 'GOOD');
    assert.equal(daysOfCover(10, 2), 5);
    assert.equal(daysOfCover(10, 0), null);
    const recommendation = calculateReorderRecommendation({ currentStock: 10, minStock: 2, targetStock: 20, averageDailyUsage: 1.25, leadTimeDays: 2, forecastDays: 7, safetyBufferDays: 2, asOf: today });
    assert.equal(recommendation.reorderPoint, 5);
    assert.equal(recommendation.daysUntilReorder, 4);
    assert.equal(recommendation.suggestedPurchaseQty, 10);
    assert.equal(isoDay(recommendation.suggestedReorderDate!), isoDay(addCalendarDays(today, 4)));
  });

  test('forecasts require authentication, a shop, and valid parameters', async () => {
    assert.equal((await request('/api/forecasts')).response.status, 401);
    assert.equal((await request('/api/forecasts', noShopToken)).response.status, 401);
    assert.equal((await request('/api/forecasts?historyDays=6', ownerToken)).response.status, 400);
    assert.equal((await request('/api/forecasts?forecastDays=31', ownerToken)).response.status, 400);
    assert.equal((await request('/api/forecasts?windowDays=2', ownerToken)).response.status, 400);
    assert.equal((await request('/api/forecasts?itemId=not-a-uuid', ownerToken)).response.status, 400);
  });

  test('exact metrics and weighted forecasts agree with recorded sales and consumption', async () => {
    const result = await forecast(`historyDays=14&forecastDays=7&windowDays=7&safetyBufferDays=2&itemId=${teaId}`);
    assert.equal(result.model.name, 'WEIGHTED_MOVING_AVERAGE');
    assert.equal(result.historyRange.days, 14);
    assert.equal(result.forecastRange.days, 7);
    assert.deepEqual(result.exact, {
      asOf: result.exact.asOf,
      inventoryItemCount: 1,
      inventoryValue: 1000,
      salesCount: 14,
      salesRevenue: 450,
      purchaseCount: 1,
      purchaseValue: 1000,
      consumptionMovementCount: 28,
      consumptionValue: 1500,
      wastageValue: 0,
      stockMovementTotals: result.exact.stockMovementTotals,
    });
    assert.equal(result.exact.stockMovementTotals.find((row: any) => row.type === 'PURCHASE').value, 1000);
    const tea = result.items[0];
    assert.equal(tea.dataQuality, 'GOOD');
    assert.equal(tea.historicalUsageQuantity, 15);
    assert.deepEqual(tea.history.quantities.slice(-7), [1, 1, 1, 1, 1, 1, 2]);
    assert.equal(tea.historicalAverageDailyConsumption, 1.25);
    assert.equal(tea.trend, 'INCREASING');
    assert.equal(tea.trendPercentChange, 14.3);
    assert.equal(tea.prediction.predictedConsumption, 8.75);
    assert.equal(tea.prediction.dailyForecast.reduce((sum: number, row: any) => sum + row.quantity, 0), 8.75);
    assert.equal(tea.prediction.daysUntilStockOut, 8);
    assert.equal(tea.prediction.estimatedStockOutDate, isoDay(addCalendarDays(today, 8)));
    assert.equal(tea.prediction.reorderPoint, 5);
    assert.equal(tea.prediction.daysUntilReorder, 4);
    assert.equal(tea.prediction.suggestedReorderDate, isoDay(addCalendarDays(today, 4)));
    assert.equal(tea.prediction.suggestedPurchaseQty, 10);
    assert.equal(tea.prediction.estimatedPurchaseCost, 1000);
    assert.equal(result.salesForecast.dataQuality, 'GOOD');
    assert.equal(result.salesForecast.historicalRevenue, 450);
    assert.equal(result.salesForecast.prediction.predictedRevenue, 262.5);
    assert.equal(result.salesForecast.prediction.predictedSalesCount, 7);
  });

  test('item filters, data-quality states, and tenant isolation prevent misleading or cross-shop forecasts', async () => {
    const milk = await forecast(`historyDays=14&itemId=${milkId}`);
    assert.equal(milk.items.length, 1);
    assert.equal(milk.items[0].dataQuality, 'LIMITED');
    assert.notEqual(milk.items[0].prediction, null);
    const idle = await forecast(`historyDays=14&itemId=${idleId}`);
    assert.equal(idle.items[0].dataQuality, 'INSUFFICIENT');
    assert.equal(idle.items[0].historicalAverageDailyConsumption, 0);
    assert.equal(idle.items[0].prediction, null);
    assert.equal(idle.salesForecast.prediction, null);
    const other = await forecast('historyDays=14', otherToken);
    assert.equal(other.items.length, 1);
    assert.equal(other.items[0].itemId, otherItemId);
    assert.equal(other.exact.salesRevenue, 0);
    assert.equal((await request(`/api/forecasts?itemId=${otherItemId}`, ownerToken)).response.status, 404);
    assert.equal((await request(`/api/forecasts?itemId=${teaId}`, otherToken)).response.status, 404);
  });

  test('prediction period, moving window, lead time, and safety buffer change recommendations consistently', async () => {
    const result = await forecast(`historyDays=14&forecastDays=14&windowDays=3&safetyBufferDays=0&itemId=${teaId}`);
    const prediction = result.items[0].prediction;
    assert.equal(result.items[0].historicalAverageDailyConsumption, 1.5);
    assert.equal(prediction.predictedConsumption, 21);
    assert.equal(prediction.dailyForecast.length, 14);
    assert.equal(prediction.dailyForecast.reduce((sum: number, row: any) => sum + row.quantity, 0), 21);
    assert.equal(prediction.safetyStock, 0);
    assert.equal(prediction.reorderPoint, 3);
    assert.equal(prediction.daysUntilReorder, 4.667);
    assert.equal(prediction.desiredStock, 24);
    assert.equal(prediction.suggestedPurchaseQty, 14);
    assert.equal(prediction.estimatedPurchaseCost, 1400);
  });
});
