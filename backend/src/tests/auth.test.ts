import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { after, before, describe, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';

const runId = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
const username = `p1_${runId}`;
const email = `phase1-${runId}@example.test`;
const password = 'Phase1Password123';
const createdEmails: string[] = [];

let server: Server;
let baseUrl: string;
let prisma: typeof import('../utils/prisma').prisma;
let env: typeof import('../config/env').env;

interface TestResponse {
  response: globalThis.Response;
  body: any;
  cookie: string | null;
}

async function request(
  path: string,
  options: { method?: string; body?: unknown; cookie?: string; token?: string; omitCsrfHeader?: boolean } = {}
): Promise<TestResponse> {
  const headers: Record<string, string> = {};
  const method = options.method ?? 'GET';
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.cookie && method !== 'GET' && !options.omitCsrfHeader) headers['X-Requested-With'] = 'XMLHttpRequest';

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  const setCookie = response.headers.get('set-cookie');
  const cookie = setCookie && !setCookie.startsWith('token=;')
    ? setCookie.split(';')[0]
    : null;

  return { response, body, cookie };
}

function assertNoSensitiveFields(value: unknown) {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes('"password"'), false);
  assert.equal(serialized.includes('verificationToken'), false);
  assert.equal(serialized.includes(password), false);
}

describe('Phase 1 authentication API', { concurrency: false }, () => {
  before(async () => {
    ({ prisma } = await import('../utils/prisma'));
    ({ env } = await import('../config/env'));
    const { createApp } = await import('../app');
    const app = createApp();
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    if (createdEmails.length > 0) {
      await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    }
    await prisma.$disconnect();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('health endpoint is available without authentication', async () => {
    const { response, body } = await request('/api/health');
    assert.equal(response.status, 200);
    assert.equal(body.status, 'healthy');
  });

  test('registration validates input', async () => {
    const { response, body } = await request('/api/auth/register', {
      method: 'POST',
      body: { username: 'x', email: 'not-an-email', password: 'short' },
    });
    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.ok(Array.isArray(body.errors));
  });

  test('registration normalizes values and stores only a bcrypt hash', async () => {
    createdEmails.push(email);
    const { response, body } = await request('/api/auth/register', {
      method: 'POST',
      body: { username: username.toUpperCase(), email: email.toUpperCase(), password },
    });
    assert.equal(response.status, 201);
    assert.equal(body.success, true);
    assertNoSensitiveFields(body);

    const user = await prisma.user.findUnique({ where: { email } });
    assert.ok(user);
    assert.equal(user.username, username);
    assert.notEqual(user.password, password);
    assert.equal(await bcrypt.compare(password, user.password), true);
  });

  test('duplicate email and username return stable conflicts', async () => {
    const duplicateEmail = await request('/api/auth/register', {
      method: 'POST',
      body: { username: `${username}x`, email: email.toUpperCase(), password },
    });
    assert.equal(duplicateEmail.response.status, 409);
    assert.match(duplicateEmail.body.message, /email already exists/i);

    const duplicateUsername = await request('/api/auth/register', {
      method: 'POST',
      body: { username: username.toUpperCase(), email: `other-${runId}@example.test`, password },
    });
    assert.equal(duplicateUsername.response.status, 409);
    assert.match(duplicateUsername.body.message, /username is already taken/i);
  });

  test('concurrent duplicate registrations create exactly one user', async () => {
    const raceEmail = `race-${runId}@example.test`;
    createdEmails.push(raceEmail);
    const payloads = [
      { username: `r1_${runId}`, email: raceEmail, password },
      { username: `r2_${runId}`, email: raceEmail.toUpperCase(), password },
    ];
    const results = await Promise.all(
      payloads.map((payload) => request('/api/auth/register', { method: 'POST', body: payload }))
    );
    assert.deepEqual(results.map((result) => result.response.status).sort(), [201, 409]);
    assert.equal(await prisma.user.count({ where: { email: raceEmail } }), 1);
  });

  test('wrong password returns a generic error without a session cookie', async () => {
    const { response, body, cookie } = await request('/api/auth/login', {
      method: 'POST',
      body: { identifier: email, password: 'WrongPassword123' },
    });
    assert.equal(response.status, 401);
    assert.equal(body.message, 'Invalid credentials');
    assert.equal(cookie, null);
  });

  test('email login sets a secure HTTP-only cookie and returns a safe user', async () => {
    const { response, body, cookie } = await request('/api/auth/login', {
      method: 'POST',
      body: { identifier: email.toUpperCase(), password },
    });
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.ok(cookie?.startsWith('token='));
    assertNoSensitiveFields(body);

    const setCookie = response.headers.get('set-cookie') ?? '';
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Path=\//i);
    assert.match(setCookie, /Max-Age=\d+/i);
  });

  test('session validation works with cookies and bearer tokens', async () => {
    const login = await request('/api/auth/login', {
      method: 'POST',
      body: { identifier: username.toUpperCase(), password },
    });
    assert.equal(login.response.status, 200);
    assert.ok(login.cookie);

    const cookieSession = await request('/api/auth/me', { cookie: login.cookie! });
    assert.equal(cookieSession.response.status, 200);
    assert.equal(cookieSession.body.user.email, email);
    assertNoSensitiveFields(cookieSession.body);

    const token = login.cookie!.split('=')[1];
    const bearerSession = await request('/api/auth/me', { token });
    assert.equal(bearerSession.response.status, 200);
    assert.equal(bearerSession.body.user.username, username);
  });

  test('profile updates require authentication and persist only validated safe fields', async () => {
    assert.equal((await request('/api/auth/profile', { method: 'PATCH', body: { name: 'No Session' } })).response.status, 401);
    const login = await request('/api/auth/login', { method: 'POST', body: { identifier: email, password } });
    const token = login.cookie!.split('=')[1];
    assert.equal((await request('/api/auth/profile', { method: 'PATCH', body: { name: '' }, token })).response.status, 400);
    assert.equal((await request('/api/auth/profile', { method: 'PATCH', body: { name: 'Shop Owner', email: 'changed@example.test' }, token })).response.status, 400);
    const updated = await request('/api/auth/profile', { method: 'PATCH', body: { name: '  Shop Owner  ' }, token });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.user.name, 'Shop Owner');
    assert.equal(updated.body.user.email, email);
    assertNoSensitiveFields(updated.body);
    const session = await request('/api/auth/me', { token });
    assert.equal(session.body.user.name, 'Shop Owner');
  });

  test('cookie-authenticated mutations require the cross-site request header', async () => {
    const login = await request('/api/auth/login', { method: 'POST', body: { identifier: email, password } });
    const cookie = login.cookie!;
    const rejected = await request('/api/auth/profile', {
      method: 'PATCH',
      body: { name: 'CSRF Blocked' },
      cookie,
      omitCsrfHeader: true,
    });
    assert.equal(rejected.response.status, 403);
    assert.equal(rejected.body.success, false);

    const accepted = await request('/api/auth/profile', { method: 'PATCH', body: { name: 'Cookie Owner' }, cookie });
    assert.equal(accepted.response.status, 200);
    const session = await request('/api/auth/me', { cookie });
    assert.equal(session.body.user.name, 'Cookie Owner');
  });

  test('missing, tampered, expired, and unknown-user sessions are rejected', async () => {
    const missing = await request('/api/auth/me');
    assert.equal(missing.response.status, 401);

    const login = await request('/api/auth/login', {
      method: 'POST',
      body: { identifier: email, password },
    });
    const token = login.cookie!.split('=')[1];
    const tampered = await request('/api/auth/me', { token: `${token}x` });
    assert.equal(tampered.response.status, 401);
    assert.match(tampered.response.headers.get('set-cookie') ?? '', /token=;/);

    const expired = jwt.sign(
      { userId: 'unknown-user', username, email, shopId: null },
      env.JWT_SECRET,
      { expiresIn: -1, algorithm: 'HS256' }
    );
    const expiredResult = await request('/api/auth/me', { token: expired });
    assert.equal(expiredResult.response.status, 401);

    const unknownUser = jwt.sign(
      { userId: crypto.randomUUID(), username, email, shopId: null },
      env.JWT_SECRET,
      { expiresIn: '5m', algorithm: 'HS256' }
    );
    const unknownResult = await request('/api/auth/me', { token: unknownUser });
    assert.equal(unknownResult.response.status, 401);
  });

  test('logout clears the session cookie', async () => {
    const login = await request('/api/auth/login', {
      method: 'POST',
      body: { identifier: email, password },
    });
    const { response, body } = await request('/api/auth/logout', {
      method: 'POST',
      cookie: login.cookie!,
    });
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    const setCookie = response.headers.get('set-cookie') ?? '';
    assert.match(setCookie, /token=;/);
    assert.match(setCookie, /Expires=Thu, 01 Jan 1970/i);

    const session = await request('/api/auth/me');
    assert.equal(session.response.status, 401);
  });

  test('legacy email verification endpoints are absent', async () => {
    const verify = await request('/api/auth/verify-email?token=anything');
    assert.equal(verify.response.status, 404);
    const resend = await request('/api/auth/resend-verification', {
      method: 'POST',
      body: { email },
    });
    assert.equal(resend.response.status, 404);
  });

  test('production cookie defaults are cross-site secure and configurable', async () => {
    const { getAuthCookieOptions } = await import('../utils/token');
    const previousNodeEnv = env.NODE_ENV;
    const previousSameSite = env.COOKIE_SAME_SITE;
    try {
      env.NODE_ENV = 'production';
      env.COOKIE_SAME_SITE = undefined;
      const production = getAuthCookieOptions();
      assert.equal(production.secure, true);
      assert.equal(production.httpOnly, true);
      assert.equal(production.sameSite, 'none');

      env.COOKIE_SAME_SITE = 'lax';
      assert.equal(getAuthCookieOptions().sameSite, 'lax');

      const { createApp } = await import('../app');
      assert.equal(createApp().get('trust proxy'), 1);
    } finally {
      env.NODE_ENV = previousNodeEnv;
      env.COOKIE_SAME_SITE = previousSameSite;
    }
  });
});
