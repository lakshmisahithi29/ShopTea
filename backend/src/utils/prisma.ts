import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

function withPgBouncer(url?: string) {
  if (!url) return url;
  const isPooler = url.includes('-pooler') || url.includes('pgbouncer=true');
  if (!isPooler || url.includes('pgbouncer=true')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}pgbouncer=true`;
}

const datasourceUrl = withPgBouncer(env.DATABASE_URL);

const rawPrisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  transactionOptions: { maxWait: 10_000, timeout: 30_000 },
  ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
});

export const prisma = rawPrisma;
