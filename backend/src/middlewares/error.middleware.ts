import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Handle custom operational AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
    return;
  }

  // Handle Zod Schema Validation Errors
  if (err instanceof ZodError) {
    const formattedErrors = err.issues.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: formattedErrors,
    });
    return;
  }

  // Handle Prisma Database Connection / Initialization Errors
  const errMsg = err.message || '';
  if (
    err.name === 'PrismaClientInitializationError' ||
    errMsg.includes('DATABASE_URL') ||
    errMsg.includes('Environment variable not found') ||
    errMsg.includes('Authentication failed against database server') ||
    errMsg.includes('the provided database credentials') ||
    errMsg.includes("Can't reach database server") ||
    (err as any).code === 'P1000' ||
    (err as any).code === 'P1001'
  ) {
    console.error('⚠️ [Database Configuration Error]:', errMsg);
    res.status(503).json({
      success: false,
      message:
        'Database connection failed. Please configure a valid Neon PostgreSQL DATABASE_URL in backend/.env.',
    });
    return;
  }

  // Handle unexpected unhandled errors
  console.error('[Unhandled Error]:', err);

  res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === 'production'
        ? 'An unexpected internal server error occurred'
        : err.message || 'Internal server error',
  });
}
