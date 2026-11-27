import { Request, Response, NextFunction } from 'express';
import { verifyAuthToken, getClearedAuthCookieOptions } from '../utils/token';
import { prisma } from '../utils/prisma';
import { toSafeUser, SafeUser } from '../utils/safeUser';
import type { Shop } from '@prisma/client';

export type AuthenticatedUser = SafeUser;

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      shop?: Shop | null;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let token = req.cookies?.token;

    // Support Bearer header fallback for API clients / testing
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
      return;
    }

    let payload;
    try {
      payload = verifyAuthToken(token);
    } catch {
      res.clearCookie('token', getClearedAuthCookieOptions());
      res.status(401).json({
        success: false,
        message: 'Invalid or expired session. Please log in again.',
      });
      return;
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        include: { shop: true },
      });

      if (!user) {
        res.clearCookie('token', getClearedAuthCookieOptions());
        res.status(401).json({
          success: false,
          message: 'User session invalid. Please log in again.',
        });
        return;
      }

      req.user = toSafeUser(user);
      req.shop = user.shop;
      next();
    } catch (error) {
      next(error);
    }
}
