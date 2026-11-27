import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError } from '../utils/errors';
import { roundQty } from '../utils/numbers';

export interface RecipeInput {
  itemId: string;
  quantity: number;
}

export interface MenuItemInput {
  name: string;
  description?: string | null;
  category: string;
  sellingPrice: number;
  isActive?: boolean;
  recipeItems: RecipeInput[];
}

const menuInclude = {
  recipeItems: { include: { item: true } },
} satisfies Prisma.MenuItemInclude;

function requireShop(shopId?: string) {
  if (!shopId) throw new UnauthorizedError('Shop profile required. Please complete shop setup.');
  return shopId;
}

function serializeMenuItem(menuItem: any): any {
  return {
    ...menuItem,
    sellingPrice: Number(menuItem.sellingPrice),
    recipeItems: menuItem.recipeItems?.map((recipe: any) => ({
      ...recipe,
      quantity: Number(recipe.quantity),
      item: recipe.item ? {
        ...recipe.item,
        openingStock: Number(recipe.item.openingStock),
        currentStock: Number(recipe.item.currentStock),
        unitCost: Number(recipe.item.unitCost),
        minStock: Number(recipe.item.minStock),
        reorderLevel: Number(recipe.item.reorderLevel),
        targetStock: Number(recipe.item.targetStock),
      } : null,
    })) || [],
  };
}

async function validateRecipe(tx: Prisma.TransactionClient, shopId: string, recipeItems: RecipeInput[]) {
  if (recipeItems.length === 0) return [];
  const ids = recipeItems.map((recipe) => recipe.itemId);
  const items = await tx.inventoryItem.findMany({ where: { id: { in: ids }, shopId } });
  if (items.length !== ids.length) throw new NotFoundError('One or more recipe items do not belong to your shop.');
  const byId = new Map(items.map((item) => [item.id, item]));

  return recipeItems.map((recipe) => {
    const item = byId.get(recipe.itemId)!;
    if (!item.isActive) throw new BadRequestError(`Recipe item "${item.name}" is archived. Restore it before using it in a recipe.`);
    const quantity = roundQty(recipe.quantity);
    if (quantity <= 0) throw new BadRequestError(`Recipe quantity for "${item.name}" is too small.`);
    if ((item.unit === 'PIECES' || item.unit === 'PACKETS') && quantity % 1 !== 0) {
      throw new BadRequestError(`Recipe quantity for ${item.unit.toLowerCase()} must be a whole number.`);
    }
    return { itemId: item.id, quantity };
  });
}

export class MenuService {
  static async list(shopId: string, query: Record<string, any>) {
    const tenantId = requireShop(shopId);
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);
    const where: Prisma.MenuItemWhereInput = {
      shopId: tenantId,
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.activeOnly === 'true' ? { isActive: true } : {}),
    };
    const [menuItems, total] = await Promise.all([
      prisma.menuItem.findMany({ where, include: menuInclude, orderBy: [{ isActive: 'desc' }, { name: 'asc' }], skip: (page - 1) * limit, take: limit }),
      prisma.menuItem.count({ where }),
    ]);
    return { menuItems: menuItems.map(serializeMenuItem), pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  static async getById(shopId: string, id: string) {
    const tenantId = requireShop(shopId);
    const menuItem = await prisma.menuItem.findFirst({ where: { id, shopId: tenantId }, include: menuInclude });
    if (!menuItem) throw new NotFoundError('Menu item not found in your shop.');
    return serializeMenuItem(menuItem);
  }

  static async create(shopId: string, input: MenuItemInput) {
    const tenantId = requireShop(shopId);
    try {
      const menuItem = await prisma.$transaction(async (tx) => {
        const recipeItems = await validateRecipe(tx, tenantId, input.recipeItems);
        return tx.menuItem.create({
          data: {
            shopId: tenantId,
            name: input.name,
            description: input.description || null,
            category: input.category,
            sellingPrice: input.sellingPrice,
            isActive: input.isActive ?? true,
            recipeItems: { create: recipeItems },
          },
          include: menuInclude,
        });
      });
      return serializeMenuItem(menuItem);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('A menu item with this name already exists.');
      }
      throw error;
    }
  }

  static async update(shopId: string, id: string, input: MenuItemInput) {
    const tenantId = requireShop(shopId);
    const existing = await prisma.menuItem.findFirst({ where: { id, shopId: tenantId } });
    if (!existing) throw new NotFoundError('Menu item not found in your shop.');
    try {
      const menuItem = await prisma.$transaction(async (tx) => {
        const recipeItems = await validateRecipe(tx, tenantId, input.recipeItems);
        await tx.recipeItem.deleteMany({ where: { menuItemId: id } });
        return tx.menuItem.update({
          where: { id },
          data: {
            name: input.name,
            description: input.description || null,
            category: input.category,
            sellingPrice: input.sellingPrice,
            isActive: input.isActive ?? true,
            recipeItems: { create: recipeItems },
          },
          include: menuInclude,
        });
      });
      return serializeMenuItem(menuItem);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('A menu item with this name already exists.');
      }
      throw error;
    }
  }
}
