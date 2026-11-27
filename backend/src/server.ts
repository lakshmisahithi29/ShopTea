import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './utils/prisma';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`🍵 ShopTea API running in ${env.NODE_ENV} mode on port ${env.PORT}`);
  console.log(`📡 Health Check: http://localhost:${env.PORT}/api/health`);
  console.log(`🌐 Allowed Client URL: ${env.CLIENT_URL}`);
});

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} signal received: closing HTTP server`);
  server.close(async () => {
    await prisma.$disconnect();
    console.log('HTTP server and database connections closed');
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
