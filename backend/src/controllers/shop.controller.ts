import { Request, Response } from 'express';
import { Prisma, Shop, User } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { CreateShopInput, UpdateShopInput } from '../validations/shop.validation';
import { signAuthToken, getAuthCookieOptions } from '../utils/token';
import { toSafeUser } from '../utils/safeUser';
import { ConflictError, NotFoundError, UnauthorizedError } from '../utils/errors';

type UserWithShop = User & { shop?: Shop | null };

function requireShopId(req: Request): string {
  const shopId = req.user?.shopId;
  if (!shopId) {
    throw new NotFoundError('Shop profile not found. Please complete shop setup.');
  }
  return shopId;
}

function sendShopResponse(
  res: Response,
  shop: Shop,
  user: UserWithShop,
  status: number,
  message: string
): void {
  const authToken = signAuthToken({
    userId: user.id,
    username: user.username,
    email: user.email,
    shopId: shop.id,
  });

  res.cookie('token', authToken, getAuthCookieOptions());
  res.status(status).json({
    success: true,
    message,
    shop,
    user: toSafeUser({ ...user, shop }),
  });
}

async function findUserWithShop(userId: string): Promise<UserWithShop | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    include: { shop: true },
  });
}

interface CreateShopOutcome {
  status: 200 | 201;
  shop: Shop | null;
  user: UserWithShop | null;
}

async function createShopAtomically(userId: string, input: CreateShopInput): Promise<CreateShopOutcome> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Claim the unconfigured owner row first. The conditional update locks
        // the row, so concurrent requests cannot both create a shop.
        const claimed = await tx.user.updateMany({
          where: { id: userId, shopId: null },
          data: { name: input.ownerName },
        });

        if (claimed.count === 0) {
          const existing = await tx.user.findUnique({
            where: { id: userId },
            include: { shop: true },
          });
          return { status: 200 as const, shop: existing?.shop ?? null, user: existing };
        }

        const shop = await tx.shop.create({
          data: {
            name: input.name,
            ownerName: input.ownerName,
            phone: input.phone,
            address: input.address || null,
            currency: input.currency,
            type: input.type,
            timezone: input.timezone,
            settings: input.settings,
          },
        });
        await tx.user.update({
          where: { id: userId },
          data: { shopId: shop.id },
        });
        const updatedUser = await tx.user.findUnique({
          where: { id: userId },
          include: { shop: true },
        });
        return { status: 201 as const, shop, user: updatedUser };
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 20_000,
      });
    } catch (error) {
      const canRetry =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034' &&
        attempt < 2;
      if (!canRetry) throw error;
      await new Promise((resolve) => setTimeout(resolve, 75 * (attempt + 1)));
    }
  }

  throw new ConflictError('Shop setup is temporarily busy. Please try again.');
}

export async function createShop(req: Request, res: Response): Promise<void> {
  const authUser = req.user;
  if (!authUser) {
    throw new UnauthorizedError('Authentication required');
  }

  const input = req.body as CreateShopInput;
  const currentUser = await findUserWithShop(authUser.id);

  if (currentUser?.shop) {
    sendShopResponse(res, currentUser.shop, currentUser, 200, 'Shop is already configured.');
    return;
  }

  try {
    const outcome = await createShopAtomically(authUser.id, input);

    if (!outcome.user?.shop || !outcome.shop) {
      throw new ConflictError('Shop configuration changed. Please refresh and try again.');
    }

    sendShopResponse(
      res,
      outcome.shop,
      outcome.user,
      outcome.status,
      outcome.status === 201 ? 'Shop setup completed successfully!' : 'Shop is already configured.'
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const racedUser = await findUserWithShop(authUser.id);
      if (racedUser?.shop) {
        sendShopResponse(res, racedUser.shop, racedUser, 200, 'Shop is already configured.');
        return;
      }
    }
    throw error;
  }
}

export async function getShop(req: Request, res: Response): Promise<void> {
  const shopId = requireShopId(req);
  const shop = await prisma.shop.findFirst({ where: { id: shopId } });

  if (!shop) {
    throw new NotFoundError('Shop profile not found.');
  }

  res.status(200).json({ success: true, shop });
}

export async function updateShop(req: Request, res: Response): Promise<void> {
  const authUser = req.user;
  if (!authUser) {
    throw new UnauthorizedError('Authentication required');
  }

  const shopId = requireShopId(req);
  const input = req.body as UpdateShopInput;
  const data: Prisma.ShopUpdateInput = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.ownerName !== undefined) {
    data.ownerName = input.ownerName;
    data.user = { update: { name: input.ownerName } };
  }
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.address !== undefined) data.address = input.address || null;
  if (input.currency !== undefined) data.currency = input.currency;
  if (input.type !== undefined) data.type = input.type;
  if (input.timezone !== undefined) data.timezone = input.timezone;
  if (input.settings !== undefined) data.settings = input.settings;

  const shop = await prisma.shop.update({
    where: { id: shopId },
    data,
  });

  const updatedUser = await findUserWithShop(authUser.id);
  if (!updatedUser) {
    throw new NotFoundError('Shop owner not found.');
  }

  sendShopResponse(res, shop, updatedUser, 200, 'Shop settings updated successfully.');
}
