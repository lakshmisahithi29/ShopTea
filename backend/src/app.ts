import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { errorHandler } from './middlewares/error.middleware';
import authRoutes from './routes/auth.routes';
import shopRoutes from './routes/shop.routes';
import transactionRoutes from './routes/transaction.routes';
import supplierRoutes from './routes/supplier.routes';
import itemRoutes from './routes/item.routes';
import replenishmentRoutes from './routes/replenishment.routes';
import dashboardRoutes from './routes/dashboard.routes';
import purchaseRoutes from './routes/purchase.routes';
import menuRoutes from './routes/menu.routes';
import salesRoutes from './routes/sales.routes';
import usageRoutes from './routes/usage.routes';
import alertRoutes from './routes/alert.routes';
import reportRoutes from './routes/report.routes';
import forecastRoutes from './routes/forecast.routes';

export function createApp(): Express {
  const app = express();

  // Render terminates TLS at a trusted reverse proxy.
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

  // Security HTTP headers
  app.use(helmet());

  // CORS configuration
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    })
  );

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Cookie-authenticated mutations require a custom header so cross-site forms cannot submit them.
  app.use((req, res, next) => {
    const mutatingMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const cookieSession = Boolean(req.cookies?.token);
    const bearerSession = req.headers.authorization?.startsWith('Bearer ');
    if (mutatingMethod && cookieSession && !bearerSession && req.headers['x-requested-with'] !== 'XMLHttpRequest') {
      res.status(403).json({
        success: false,
        message: 'Missing required request header.',
      });
      return;
    }
    next();
  });

  // Health check endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'healthy',
      app: 'ShopTea Inventory API',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/shop', shopRoutes);
  app.use('/api/transactions', transactionRoutes);
  app.use('/api/suppliers', supplierRoutes);
  app.use('/api/items', itemRoutes);
  app.use('/api/replenishment', replenishmentRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/purchases', purchaseRoutes);
  app.use('/api/menu', menuRoutes);
  app.use('/api/sales', salesRoutes);
  app.use('/api/usage-records', usageRoutes);
  app.use('/api/alerts', alertRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/forecasts', forecastRoutes);

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
