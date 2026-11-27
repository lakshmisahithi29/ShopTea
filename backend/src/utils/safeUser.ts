import type { Prisma, Shop, User } from '@prisma/client';

export const safeUserSelect = {
  id: true,
  username: true,
  email: true,
  name: true,
  role: true,
  shopId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type UserWithShop = User & { shop?: Shop | null };

export function toSafeUser(user: UserWithShop) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    role: user.role,
    shopId: user.shopId,
    shop: user.shop ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export type SafeUser = ReturnType<typeof toSafeUser>;
