import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const DATA_FILE = path.resolve(__dirname, '../../data/dev-store.json');

export interface DevStoreData {
  users: any[];
  shops: any[];
  suppliers: any[];
  inventoryItems: any[];
  stockTransactions: any[];
}

function getDefaultData(): DevStoreData {
  const salt = bcrypt.genSaltSync(10);
  const devStorePassword = process.env.DEV_STORE_PASSWORD;
  if (!devStorePassword) {
    throw new Error('DEV_STORE_PASSWORD is required to initialize the local development store.');
  }
  const hashedPassword = bcrypt.hashSync(devStorePassword, salt);

  const defaultShop = {
    id: 'seed-shop-001',
    name: 'Chai Charcha & Co.',
    ownerName: 'Rajesh Sharma',
    phone: '+91 98765 43210',
    address: 'Shop 4, Market Complex, MG Road, Pune',
    currency: 'INR',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const defaultUser = {
    id: 'seed-user-001',
    username: 'rajesh_sharma',
    email: 'owner@chaicharcha.com',
    password: hashedPassword,
    name: 'Rajesh Sharma',
    role: 'OWNER',
    isEmailVerified: true,
    verificationTokenHash: null,
    verificationTokenExpiresAt: null,
    shopId: defaultShop.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const defaultSuppliers = [
    {
      id: 'sup-001',
      shopId: defaultShop.id,
      name: 'Assam Gold Tea Traders',
      phone: '+91 98220 11223',
      email: 'sales@assamgoldtea.com',
      address: 'Guwahati, Assam',
      notes: 'Primary supplier for CTC and Orthodox tea leaves. 3-day delivery.',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sup-002',
      shopId: defaultShop.id,
      name: 'Gokul Dairy Fresh',
      phone: '+91 98900 33445',
      email: 'orders@gokuldairy.com',
      address: 'Hadapsar, Pune',
      notes: 'Daily morning delivery of full cream buffalo milk.',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sup-003',
      shopId: defaultShop.id,
      name: 'Pooja Packaging & Disposables',
      phone: '+91 97654 55667',
      email: 'pooja.packaging@gmail.com',
      address: 'Raviwar Peth, Pune',
      notes: 'Cups, lids, paper stirrers and parcel carry bags.',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const defaultItems = [
    {
      id: 'item-001',
      shopId: defaultShop.id,
      name: 'Assam CTC Premium Tea Leaf',
      category: 'TEA_LEAVES',
      unit: 'KG',
      openingStock: 25.0,
      currentStock: 25.0,
      unitCost: 380.0,
      minStock: 5.0,
      reorderLevel: 8.0,
      targetStock: 30.0,
      supplierId: 'sup-001',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'item-002',
      shopId: defaultShop.id,
      name: 'Darjeeling Green Tea Blend',
      category: 'TEA_LEAVES',
      unit: 'KG',
      openingStock: 6.0,
      currentStock: 6.0,
      unitCost: 750.0,
      minStock: 1.5,
      reorderLevel: 2.5,
      targetStock: 8.0,
      supplierId: 'sup-001',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'item-003',
      shopId: defaultShop.id,
      name: 'Full Cream Buffalo Milk',
      category: 'DAIRY',
      unit: 'LITRES',
      openingStock: 40.0,
      currentStock: 40.0,
      unitCost: 68.0,
      minStock: 10.0,
      reorderLevel: 15.0,
      targetStock: 50.0,
      supplierId: 'sup-002',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'item-004',
      shopId: defaultShop.id,
      name: 'Cardamom (Elaichi) Whole',
      category: 'SPICES',
      unit: 'G',
      openingStock: 1000.0,
      currentStock: 1000.0,
      unitCost: 3.2,
      minStock: 200.0,
      reorderLevel: 350.0,
      targetStock: 1500.0,
      supplierId: null,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'item-005',
      shopId: defaultShop.id,
      name: 'Fresh Ginger (Adrak)',
      category: 'SPICES',
      unit: 'KG',
      openingStock: 8.0,
      currentStock: 8.0,
      unitCost: 90.0,
      minStock: 2.0,
      reorderLevel: 3.0,
      targetStock: 10.0,
      supplierId: null,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'item-006',
      shopId: defaultShop.id,
      name: 'White Refined Sugar',
      category: 'SWEETENERS',
      unit: 'KG',
      openingStock: 50.0,
      currentStock: 50.0,
      unitCost: 44.0,
      minStock: 10.0,
      reorderLevel: 15.0,
      targetStock: 60.0,
      supplierId: null,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'item-007',
      shopId: defaultShop.id,
      name: 'Paper Cups 150ml',
      category: 'PACKAGING',
      unit: 'PIECES',
      openingStock: 2000.0,
      currentStock: 2000.0,
      unitCost: 0.85,
      minStock: 400.0,
      reorderLevel: 600.0,
      targetStock: 3000.0,
      supplierId: 'sup-003',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'item-008',
      shopId: defaultShop.id,
      name: 'Wooden Stirrers (Pack of 100)',
      category: 'PACKAGING',
      unit: 'PACKETS',
      openingStock: 20.0,
      currentStock: 20.0,
      unitCost: 35.0,
      minStock: 5.0,
      reorderLevel: 7.0,
      targetStock: 25.0,
      supplierId: 'sup-003',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const defaultTransactions = defaultItems.map((item) => ({
    id: 'tx-seed-' + item.id,
    shopId: defaultShop.id,
    itemId: item.id,
    type: 'PURCHASE',
    quantity: item.openingStock,
    unitCost: item.unitCost,
    totalCost: item.openingStock * item.unitCost,
    supplierId: item.supplierId,
    reference: 'OPENING-STOCK',
    wastageReason: null,
    remarks: 'Initial inventory balance setup',
    idempotencyKey: 'seed-' + item.id,
    createdById: defaultUser.id,
    date: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  return {
    users: [defaultUser],
    shops: [defaultShop],
    suppliers: defaultSuppliers,
    inventoryItems: defaultItems,
    stockTransactions: defaultTransactions,
  };
}

class DevStore {
  public data: DevStoreData;

  constructor() {
    this.data = this.loadData();
  }

  private loadData(): DevStoreData {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed.inventoryItems || parsed.inventoryItems.length === 0) {
          const defaults = getDefaultData();
          parsed.inventoryItems = defaults.inventoryItems;
          parsed.suppliers = defaults.suppliers;
          parsed.stockTransactions = defaults.stockTransactions;
          this.saveData(parsed);
        }
        return parsed;
      }
    } catch (err) {
      console.warn('⚠️ Could not read dev-store.json, creating new default store:', err);
    }
    const defaults = getDefaultData();
    this.saveData(defaults);
    return defaults;
  }

  private saveData(data: DevStoreData) {
    try {
      const dir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save dev-store.json:', err);
    }
  }

  public persist() {
    this.saveData(this.data);
  }

  private attachShop(user: any, includeShop?: boolean) {
    if (!user) return null;
    const cloned = { ...user };
    if (includeShop) {
      cloned.shop = this.data.shops.find((s) => s.id === user.shopId) || null;
    }
    return cloned;
  }

  private attachSupplierToItem(item: any, includeSupplier?: boolean) {
    if (!item) return null;
    const cloned = { ...item };
    if (includeSupplier) {
      cloned.supplier = this.data.suppliers.find((s) => s.id === item.supplierId) || null;
    }
    return cloned;
  }

  private attachRelationsToTransaction(tx: any, include?: any) {
    if (!tx) return null;
    const cloned = { ...tx };
    if (include?.item) {
      const itm = this.data.inventoryItems.find((i) => i.id === tx.itemId);
      cloned.item = itm ? this.attachSupplierToItem(itm, true) : null;
    }
    if (include?.supplier) {
      cloned.supplier = this.data.suppliers.find((s) => s.id === tx.supplierId) || null;
    }
    if (include?.createdByUser) {
      const u = this.data.users.find((user) => user.id === tx.createdById);
      if (u) {
        const { password, verificationTokenHash, ...safe } = u;
        cloned.createdByUser = safe;
      }
    }
    return cloned;
  }

  public user = {
    findFirst: async (args: any) => {
      const { where, include } = args || {};
      let match = null;

      if (where?.OR && Array.isArray(where.OR)) {
        match = this.data.users.find((u) => {
          return where.OR.some((cond: any) => {
            if (cond.username && u.username?.toLowerCase() === cond.username?.toLowerCase()) return true;
            if (cond.email && u.email?.toLowerCase() === cond.email?.toLowerCase()) return true;
            return false;
          });
        });
      } else if (where) {
        match = this.data.users.find((u) => {
          if (where.username && u.username?.toLowerCase() !== where.username?.toLowerCase()) return false;
          if (where.email && u.email?.toLowerCase() !== where.email?.toLowerCase()) return false;
          if (where.id && u.id !== where.id) return false;
          return true;
        });
      }

      return match ? this.attachShop(match, include?.shop) : null;
    },

    findUnique: async (args: any) => {
      const { where, include } = args || {};
      const match = this.data.users.find((u) => {
        if (where.id && u.id === where.id) return true;
        if (where.username && u.username?.toLowerCase() === where.username?.toLowerCase()) return true;
        if (where.email && u.email?.toLowerCase() === where.email?.toLowerCase()) return true;
        return false;
      });
      return match ? this.attachShop(match, include?.shop) : null;
    },

    create: async (args: any) => {
      const { data, include } = args;
      const newUser = {
        id: crypto.randomUUID(),
        username: data.username.toLowerCase(),
        email: data.email.toLowerCase(),
        password: data.password,
        name: data.name || null,
        role: data.role || 'OWNER',
        isEmailVerified: !!data.isEmailVerified,
        verificationTokenHash: data.verificationTokenHash || null,
        verificationTokenExpiresAt: data.verificationTokenExpiresAt
          ? new Date(data.verificationTokenExpiresAt).toISOString()
          : null,
        shopId: data.shopId || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.data.users.push(newUser);
      this.persist();
      return this.attachShop(newUser, include?.shop);
    },

    update: async (args: any) => {
      const { where, data, include } = args;
      const idx = this.data.users.findIndex((u) => {
        if (where.id && u.id === where.id) return true;
        if (where.email && u.email?.toLowerCase() === where.email?.toLowerCase()) return true;
        return false;
      });

      if (idx === -1) throw new Error('User not found to update');

      const current = this.data.users[idx];
      const updated = {
        ...current,
        ...data,
        updatedAt: new Date().toISOString(),
      };

      this.data.users[idx] = updated;
      this.persist();
      return this.attachShop(updated, include?.shop);
    },
  };

  public shop = {
    findFirst: async (args: any) => {
      const { where } = args || {};
      if (!where) return this.data.shops[0] || null;
      return this.data.shops.find((s) => s.id === where.id || s.name === where.name) || null;
    },

    findUnique: async (args: any) => {
      const { where } = args || {};
      return this.data.shops.find((s) => s.id === where.id) || null;
    },

    create: async (args: any) => {
      const { data } = args;
      const newShop = {
        id: crypto.randomUUID(),
        name: data.name,
        ownerName: data.ownerName,
        phone: data.phone,
        address: data.address || null,
        currency: data.currency || 'INR',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.data.shops.push(newShop);

      this.persist();
      return newShop;
    },
  };

  public supplier = {
    findMany: async (args: any) => {
      const { where, orderBy, include } = args || {};
      let list = this.data.suppliers.filter((s) => {
        if (where?.shopId && s.shopId !== where.shopId) return false;
        if (where?.isActive !== undefined && s.isActive !== where.isActive) return false;
        return true;
      });

      if (orderBy?.name === 'asc') {
        list.sort((a, b) => a.name.localeCompare(b.name));
      }

      return list.map((sup) => {
        const cloned = { ...sup };
        if (include?._count) {
          cloned._count = {
            items: this.data.inventoryItems.filter((i) => i.supplierId === sup.id).length,
            transactions: this.data.stockTransactions.filter((t) => t.supplierId === sup.id).length,
          };
        }
        return cloned;
      });
    },

    findFirst: async (args: any) => {
      const { where } = args || {};
      return (
        this.data.suppliers.find((s) => {
          if (where?.id && s.id !== where.id) return false;
          if (where?.shopId && s.shopId !== where.shopId) return false;
          if (where?.name && s.name.toLowerCase() !== where.name.toLowerCase()) return false;
          return true;
        }) || null
      );
    },

    findUnique: async (args: any) => {
      const { where } = args || {};
      return this.data.suppliers.find((s) => s.id === where.id) || null;
    },

    create: async (args: any) => {
      const { data } = args;
      const newSupplier = {
        id: crypto.randomUUID(),
        shopId: data.shopId,
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        address: data.address || null,
        notes: data.notes || null,
        isActive: data.isActive !== undefined ? data.isActive : true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.data.suppliers.push(newSupplier);
      this.persist();
      return newSupplier;
    },

    update: async (args: any) => {
      const { where, data } = args;
      const idx = this.data.suppliers.findIndex((s) => s.id === where.id);
      if (idx === -1) throw new Error('Supplier not found');
      const updated = { ...this.data.suppliers[idx], ...data, updatedAt: new Date().toISOString() };
      this.data.suppliers[idx] = updated;
      this.persist();
      return updated;
    },
  };

  public inventoryItem = {
    findMany: async (args: any) => {
      const { where, orderBy, include } = args || {};
      let list = this.data.inventoryItems.filter((item) => {
        if (where?.shopId && item.shopId !== where.shopId) return false;
        if (where?.isActive !== undefined && item.isActive !== where.isActive) return false;
        if (where?.category && item.category !== where.category) return false;
        if (Object.prototype.hasOwnProperty.call(where || {}, 'supplierId')) {
          if (item.supplierId !== where.supplierId) return false;
        }
        return true;
      });

      if (orderBy?.name === 'asc') {
        list.sort((a, b) => a.name.localeCompare(b.name));
      }
      if (orderBy?.currentStock === 'desc') {
        list.sort((a, b) => Number(b.currentStock) - Number(a.currentStock));
      }

      return list.map((i) => this.attachSupplierToItem(i, include?.supplier));
    },

    findFirst: async (args: any) => {
      const { where, include } = args || {};
      const match = this.data.inventoryItems.find((item) => {
        if (where?.id && item.id !== where.id) return false;
        if (where?.shopId && item.shopId !== where.shopId) return false;
        if (where?.name && item.name.toLowerCase() !== where.name.toLowerCase()) return false;
        if (where?.isActive !== undefined && item.isActive !== where.isActive) return false;
        return true;
      });
      return match ? this.attachSupplierToItem(match, include?.supplier) : null;
    },

    findUnique: async (args: any) => {
      const { where, include } = args || {};
      const match = this.data.inventoryItems.find((item) => item.id === where.id);
      return match ? this.attachSupplierToItem(match, include?.supplier) : null;
    },

    create: async (args: any) => {
      const { data, include } = args;
      const newItem = {
        id: crypto.randomUUID(),
        shopId: data.shopId,
        name: data.name,
        category: data.category,
        unit: data.unit,
        openingStock: Number(data.openingStock || 0),
        currentStock: Number(data.openingStock || 0),
        unitCost: Number(data.unitCost || 0),
        minStock: Number(data.minStock || 0),
        reorderLevel: Number(data.reorderLevel || 0),
        targetStock: Number(data.targetStock || 0),
        supplierId: data.supplierId || null,
        isActive: data.isActive !== undefined ? data.isActive : true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.data.inventoryItems.push(newItem);
      this.persist();
      return this.attachSupplierToItem(newItem, include?.supplier);
    },

    update: async (args: any) => {
      const { where, data, include } = args;
      const idx = this.data.inventoryItems.findIndex((item) => item.id === where.id);
      if (idx === -1) throw new Error('Inventory item not found');
      const updated = {
        ...this.data.inventoryItems[idx],
        ...data,
        currentStock: data.currentStock !== undefined ? Number(data.currentStock) : this.data.inventoryItems[idx].currentStock,
        unitCost: data.unitCost !== undefined ? Number(data.unitCost) : this.data.inventoryItems[idx].unitCost,
        updatedAt: new Date().toISOString(),
      };
      this.data.inventoryItems[idx] = updated;
      this.persist();
      return this.attachSupplierToItem(updated, include?.supplier);
    },
  };

  public stockTransaction = {
    findFirst: async (args: any) => {
      const { where, include } = args || {};
      const match = this.data.stockTransactions.find((tx) => {
        if (where?.id && tx.id !== where.id) return false;
        if (where?.shopId && tx.shopId !== where.shopId) return false;
        if (where?.idempotencyKey && tx.idempotencyKey !== where.idempotencyKey) return false;
        return true;
      });
      return match ? this.attachRelationsToTransaction(match, include) : null;
    },

    findUnique: async (args: any) => {
      const { where, include } = args || {};
      const match = this.data.stockTransactions.find((tx) => tx.id === where.id);
      return match ? this.attachRelationsToTransaction(match, include) : null;
    },

    findMany: async (args: any) => {
      const { where, orderBy, skip = 0, take, include } = args || {};
      let list = this.data.stockTransactions.filter((tx) => {
        if (where?.shopId && tx.shopId !== where.shopId) return false;
        if (where?.itemId && tx.itemId !== where.itemId) return false;
        if (where?.supplierId && tx.supplierId !== where.supplierId) return false;
        if (where?.type?.in && !where.type.in.includes(tx.type)) return false;
        else if (where?.type && typeof where.type === 'string' && tx.type !== where.type) return false;
        if (where?.date?.gte && new Date(tx.date) < new Date(where.date.gte)) return false;
        if (where?.date?.lte && new Date(tx.date) > new Date(where.date.lte)) return false;
        return true;
      });

      if (orderBy?.date === 'asc') {
        list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      } else {
        list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      }

      const sliced = take === undefined ? list.slice(skip) : list.slice(skip, skip + take);
      return sliced.map((tx) => this.attachRelationsToTransaction(tx, include));
    },

    count: async (args: any) => {
      const { where } = args || {};
      const list = this.data.stockTransactions.filter((tx) => {
        if (where?.shopId && tx.shopId !== where.shopId) return false;
        if (where?.itemId && tx.itemId !== where.itemId) return false;
        if (where?.supplierId && tx.supplierId !== where.supplierId) return false;
        if (where?.type?.in && !where.type.in.includes(tx.type)) return false;
        else if (where?.type && typeof where.type === 'string' && tx.type !== where.type) return false;
        if (where?.date?.gte && new Date(tx.date) < new Date(where.date.gte)) return false;
        if (where?.date?.lte && new Date(tx.date) > new Date(where.date.lte)) return false;
        return true;
      });
      return list.length;
    },

    create: async (args: any) => {
      const { data, include } = args;
      const newTx = {
        id: crypto.randomUUID(),
        shopId: data.shopId,
        itemId: data.itemId,
        type: data.type,
        quantity: Number(data.quantity),
        unitCost: data.unitCost !== undefined && data.unitCost !== null ? Number(data.unitCost) : null,
        totalCost: data.totalCost !== undefined && data.totalCost !== null ? Number(data.totalCost) : null,
        supplierId: data.supplierId || null,
        reference: data.reference || null,
        wastageReason: data.wastageReason || null,
        remarks: data.remarks || null,
        idempotencyKey: data.idempotencyKey || null,
        createdById: data.createdById || null,
        date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.data.stockTransactions.push(newTx);
      this.persist();
      return this.attachRelationsToTransaction(newTx, include);
    },
  };

  public $transaction = async (callback: (tx: any) => Promise<any>) => {
    return await callback({
      user: this.user,
      shop: this.shop,
      supplier: this.supplier,
      inventoryItem: this.inventoryItem,
      stockTransaction: this.stockTransaction,
    });
  };
}

export const devStore = new DevStore();
