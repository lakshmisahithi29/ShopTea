import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { NotFoundError, UnauthorizedError, ConflictError } from '../utils/errors';
import { safeUserSelect } from '../utils/safeUser';

function getShopId(req: Request): string {
  const shopId = req.user?.shopId;
  if (!shopId) {
    throw new UnauthorizedError('Shop profile required. Please complete shop setup.');
  }
  return shopId;
}

export async function createSupplier(req: Request, res: Response) {
  const shopId = getShopId(req);
  const { name, phone, email, address, notes } = req.body;

  // Check unique supplier name per shop
  const existing = await prisma.supplier.findFirst({
    where: { shopId, name },
  });
  if (existing) {
    throw new ConflictError(`A supplier with the name "${name}" already exists in your shop.`);
  }

  const supplier = await prisma.supplier.create({
    data: {
      shopId,
      name,
      phone,
      email: email || null,
      address: address || null,
      notes: notes || null,
      isActive: true,
    },
  });

  res.status(201).json({
    success: true,
    message: 'Supplier added successfully!',
    supplier,
  });
}

export async function getSuppliers(req: Request, res: Response) {
  const shopId = getShopId(req);
  const { activeOnly } = req.query;

  const where: any = { shopId };
  if (activeOnly === 'true') {
    where.isActive = true;
  }

  const suppliers = await prisma.supplier.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: {
          items: true,
          transactions: true,
        },
      },
    },
  });

  res.status(200).json({
    success: true,
    suppliers,
  });
}

export async function getSupplierById(req: Request, res: Response) {
  const shopId = getShopId(req);
  const { id } = req.params;

  const supplier = await prisma.supplier.findFirst({
    where: { id, shopId },
    include: {
      items: true,
    },
  });

  if (!supplier) {
    throw new NotFoundError('Supplier not found in your shop.');
  }

  res.status(200).json({
    success: true,
    supplier,
  });
}

export async function updateSupplier(req: Request, res: Response) {
  const shopId = getShopId(req);
  const { id } = req.params;
  const data = req.body;

  const supplier = await prisma.supplier.findFirst({
    where: { id, shopId },
  });

  if (!supplier) {
    throw new NotFoundError('Supplier not found in your shop.');
  }

  const updated = await prisma.supplier.update({
    where: { id },
    data,
  });

  res.status(200).json({
    success: true,
    message: 'Supplier updated successfully!',
    supplier: updated,
  });
}

export async function getSupplierPurchases(req: Request, res: Response) {
  const shopId = getShopId(req);
  const { id } = req.params;

  const supplier = await prisma.supplier.findFirst({
    where: { id, shopId },
  });

  if (!supplier) {
    throw new NotFoundError('Supplier not found in your shop.');
  }

  const purchases = await prisma.stockTransaction.findMany({
    where: {
      shopId,
      supplierId: id,
      type: 'PURCHASE',
      status: 'ACTIVE',
    },
    orderBy: { date: 'desc' },
    include: {
      item: true,
      createdByUser: { select: safeUserSelect }
    },
  });

  const totalSpent = purchases.reduce((sum: number, p: any) => sum + (Number(p.totalCost) || 0), 0);

  res.status(200).json({
    success: true,
    supplier,
    purchases,
    summary: {
      totalPurchases: purchases.length,
      totalSpent: Number(totalSpent.toFixed(2)),
    },
  });
}
