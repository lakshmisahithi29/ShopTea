import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { after, before, describe, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

process.env.NODE_ENV = 'test';

const runId = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
const prefix = `p2_${runId}`;
const password = 'Phase2Password123';
const createdEmails: string[] = [];

let server: Server;
let baseUrl: string;
let prisma: typeof import('../utils/prisma').prisma;

interface TestResponse {
  response: globalThis.Response;
  body: any;
  cookie: string | null;
}

interface TestAccount {
  username: string;
  email: string;
  userId: string;
  cookie: string;
}

async function request(
  path: string,
  options: { method?: string; body?: unknown; cookie?: string } = {}
): Promise<TestResponse> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.cookie && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers['X-Requested-With'] = 'XMLHttpRequest';
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : text;
  } catch {
    body = text;
  }

  const setCookie = response.headers.get('set-cookie');
  const cookie = setCookie && !setCookie.startsWith('token=;')
    ? setCookie.split(';')[0]
    : null;

  return { response, body, cookie };
}

async function createAccount(label: string): Promise<TestAccount> {
  const username = `${prefix}_${label}`;
  const email = `${prefix}-${label}@example.test`;
  createdEmails.push(email);

  const registration = await request('/api/auth/register', {
    method: 'POST',
    body: { username, email, password },
  });
  assert.equal(registration.response.status, 201);

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { identifier: email, password },
  });
  assert.equal(login.response.status, 200);
  assert.ok(login.cookie);

  return {
    username,
    email,
    userId: login.body.user.id,
    cookie: login.cookie,
  };
}

function shopPayload(label: string) {
  return {
    name: `${prefix} ${label}`,
    ownerName: 'Phase Two Owner',
    phone: '+91 98765 43210',
    address: `${label} test address`,
    currency: 'INR',
    type: 'CAFE',
    timezone: 'Asia/Kolkata',
    settings: {
      lowStockAlerts: true,
      weekStartsOn: 1,
      dateFormat: 'DD/MM/YYYY',
    },
  };
}

function assertNoSensitiveFields(value: unknown) {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes('"password"'), false);
  assert.equal(serialized.includes(password), false);
}

describe('Phase 2 shop onboarding API', { concurrency: false }, () => {
  before(async () => {
    ({ prisma } = await import('../utils/prisma'));
    const { createApp } = await import('../app');
    const app = createApp();
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    if (createdEmails.length > 0) {
      await prisma.shop.deleteMany({ where: { name: { startsWith: prefix } } });
      await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    }
    await prisma.$disconnect();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('shop read and update require authentication', async () => {
    const read = await request('/api/shop');
    assert.equal(read.response.status, 401);

    const update = await request('/api/shop', {
      method: 'PATCH',
      body: { name: `${prefix} Unauthorized` },
    });
    assert.equal(update.response.status, 401);
  });

  test('invalid shop type, timezone, currency, phone, and settings are rejected', async () => {
    const account = await createAccount('invalid');
    const result = await request('/api/shop', {
      method: 'POST',
      cookie: account.cookie,
      body: {
        name: 'A',
        ownerName: 'Phase Two Owner',
        phone: 'not-a-phone',
        currency: 'XXX',
        type: 'INVALID',
        timezone: 'Mars/Olympus',
        settings: { lowStockAlerts: 'yes' },
      },
    });

    assert.equal(result.response.status, 400);
    assert.equal(result.body.success, false);
    const user = await prisma.user.findUnique({ where: { id: account.userId } });
    assert.equal(user?.shopId, null);
    assert.equal(await prisma.shop.count({ where: { name: { startsWith: prefix } } }), 0);
  });

  test('users without a shop receive a clear onboarding response', async () => {
    const account = await createAccount('noshop');
    const read = await request('/api/shop', { cookie: account.cookie });
    assert.equal(read.response.status, 404);
    assert.match(read.body.message, /complete shop setup/i);

    const update = await request('/api/shop', {
      method: 'PATCH',
      cookie: account.cookie,
      body: { name: `${prefix} No Shop` },
    });
    assert.equal(update.response.status, 404);
  });

  test('shop creation persists validated fields and returns a safe session user', async () => {
    const account = await createAccount('owner');
    const payload = shopPayload('Owner Shop');
    const result = await request('/api/shop', {
      method: 'POST',
      cookie: account.cookie,
      body: payload,
    });

    assert.equal(result.response.status, 201);
    assert.equal(result.body.success, true);
    assert.equal(result.body.shop.name, payload.name);
    assert.equal(result.body.shop.type, 'CAFE');
    assert.equal(result.body.shop.timezone, 'Asia/Kolkata');
    assert.deepEqual(result.body.shop.settings, payload.settings);
    assert.equal(result.body.user.shopId, result.body.shop.id);
    assert.equal(result.body.user.name, payload.ownerName);
    assert.ok(result.cookie?.startsWith('token='));
    assertNoSensitiveFields(result.body);

    const stored = await prisma.shop.findUnique({ where: { id: result.body.shop.id } });
    assert.equal(stored?.type, 'CAFE');
    assert.deepEqual(stored?.settings, payload.settings);
  });

  test('shop read returns only the authenticated owner shop', async () => {
    const account = await createAccount('reader');
    const created = await request('/api/shop', {
      method: 'POST',
      cookie: account.cookie,
      body: shopPayload('Reader Shop'),
    });
    assert.equal(created.response.status, 201);

    const read = await request('/api/shop', { cookie: account.cookie });
    assert.equal(read.response.status, 200);
    assert.equal(read.body.shop.id, created.body.shop.id);
  });

  test('repeated setup is idempotent and does not create another shop', async () => {
    const account = await createAccount('retry');
    const payload = shopPayload('Retry Shop');
    const first = await request('/api/shop', {
      method: 'POST',
      cookie: account.cookie,
      body: payload,
    });
    const second = await request('/api/shop', {
      method: 'POST',
      cookie: account.cookie,
      body: payload,
    });

    assert.equal(first.response.status, 201);
    assert.equal(second.response.status, 200);
    assert.equal(second.body.shop.id, first.body.shop.id);
    assert.equal(await prisma.shop.count({ where: { name: payload.name } }), 1);
  });

  test('concurrent setup creates exactly one shop and both callers succeed', async () => {
    const account = await createAccount('race');
    const payload = shopPayload('Race Shop');
    const results = await Promise.all([
      request('/api/shop', { method: 'POST', cookie: account.cookie, body: payload }),
      request('/api/shop', { method: 'POST', cookie: account.cookie, body: payload }),
    ]);

    assert.deepEqual(results.map((result) => result.response.status).sort(), [200, 201]);
    assert.equal(results[0].body.shop.id, results[1].body.shop.id);
    assert.equal(await prisma.shop.count({ where: { name: payload.name } }), 1);
    const user = await prisma.user.findUnique({
      where: { id: account.userId },
      include: { shop: true },
    });
    assert.equal(user?.shop?.name, payload.name);
  });

  test('shop settings updates persist and synchronize the owner name', async () => {
    const account = await createAccount('settings');
    const created = await request('/api/shop', {
      method: 'POST',
      cookie: account.cookie,
      body: shopPayload('Settings Shop'),
    });
    assert.equal(created.response.status, 201);

    const updates = {
      name: `${prefix} Updated Shop`,
      ownerName: 'Updated Phase Two Owner',
      phone: '+1 202 555 0147',
      address: '',
      currency: 'USD',
      type: 'RESTAURANT',
      timezone: 'America/New_York',
      settings: {
        lowStockAlerts: false,
        weekStartsOn: 0,
        dateFormat: 'MM/DD/YYYY',
      },
    };
    const updated = await request('/api/shop', {
      method: 'PATCH',
      cookie: account.cookie,
      body: updates,
    });

    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.shop.id, created.body.shop.id);
    assert.equal(updated.body.shop.name, updates.name);
    assert.equal(updated.body.shop.address, null);
    assert.equal(updated.body.shop.currency, 'USD');
    assert.equal(updated.body.shop.type, 'RESTAURANT');
    assert.equal(updated.body.shop.timezone, 'America/New_York');
    assert.deepEqual(updated.body.shop.settings, updates.settings);
    assert.equal(updated.body.user.name, updates.ownerName);
    assertNoSensitiveFields(updated.body);

    const read = await request('/api/shop', { cookie: account.cookie });
    assert.equal(read.body.shop.name, updates.name);
    assert.deepEqual(read.body.shop.settings, updates.settings);
    const user = await prisma.user.findUnique({ where: { id: account.userId } });
    assert.equal(user?.name, updates.ownerName);
  });

  test('cross-shop identifiers cannot be used to read or modify another tenant', async () => {
    const accountA = await createAccount('tenanta');
    const accountB = await createAccount('tenantb');
    const shopA = await request('/api/shop', {
      method: 'POST',
      cookie: accountA.cookie,
      body: shopPayload('Tenant A'),
    });
    const shopB = await request('/api/shop', {
      method: 'POST',
      cookie: accountB.cookie,
      body: shopPayload('Tenant B'),
    });
    assert.equal(shopA.response.status, 201);
    assert.equal(shopB.response.status, 201);
    assert.notEqual(shopA.body.shop.id, shopB.body.shop.id);

    const queried = await request(`/api/shop?shopId=${shopA.body.shop.id}`, {
      cookie: accountB.cookie,
    });
    assert.equal(queried.response.status, 200);
    assert.equal(queried.body.shop.id, shopB.body.shop.id);

    const tampered = await request('/api/shop', {
      method: 'PATCH',
      cookie: accountB.cookie,
      body: { name: `${prefix} Tampered`, shopId: shopA.body.shop.id },
    });
    assert.equal(tampered.response.status, 400);

    const direct = await request(`/api/shop/${shopA.body.shop.id}`, {
      cookie: accountB.cookie,
    });
    assert.equal(direct.response.status, 404);

    const unchanged = await prisma.shop.findUnique({ where: { id: shopA.body.shop.id } });
    assert.equal(unchanged?.name, shopA.body.shop.name);
  });

  test('legacy setup payloads receive safe defaults', async () => {
    const account = await createAccount('defaults');
    const result = await request('/api/shop', {
      method: 'POST',
      cookie: account.cookie,
      body: {
        name: `${prefix} Defaults Shop`,
        ownerName: 'Default Owner',
        phone: '+91 98765 43210',
      },
    });

    assert.equal(result.response.status, 201);
    assert.equal(result.body.shop.currency, 'INR');
    assert.equal(result.body.shop.type, 'TEA_SHOP');
    assert.equal(result.body.shop.timezone, 'Asia/Kolkata');
    assert.deepEqual(result.body.shop.settings, {
      lowStockAlerts: true,
      weekStartsOn: 1,
      dateFormat: 'DD/MM/YYYY',
    });
  });
});
