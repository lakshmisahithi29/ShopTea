import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env';

const tokenPayloadSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  email: z.string().email(),
  shopId: z.string().min(1).nullable().optional(),
});

export type TokenPayload = z.infer<typeof tokenPayloadSchema>;

/**
 * Sign JWT token for user session
 */
export function signAuthToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
}

/**
 * Verify JWT token
 */
export function verifyAuthToken(token: string): TokenPayload {
  const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  return tokenPayloadSchema.parse(payload);
}

function durationToMilliseconds(duration: string): number {
  const match = /^(\d+)(ms|s|m|h|d|w)$/.exec(duration);
  if (!match) return 7 * 24 * 60 * 60 * 1000;

  const units: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
  };
  return Number(match[1]) * units[match[2]];
}

/**
 * Standard HTTP-only cookie configuration
 * Supports local dev (SameSite: lax) and production cross-site (SameSite: none, Secure: true)
 */
export function getAuthCookieOptions() {
  const isProd = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: env.COOKIE_SAME_SITE ?? (isProd ? 'none' : 'lax'),
    maxAge: durationToMilliseconds(env.JWT_EXPIRES_IN),
    path: '/',
  };
}

export function getClearedAuthCookieOptions() {
  const { maxAge: _maxAge, ...options } = getAuthCookieOptions();
  return options;
}
