export type Role = 'OWNER' | 'STAFF';

export type ItemCategory =
  | 'TEA_LEAVES'
  | 'DAIRY'
  | 'SPICES'
  | 'SWEETENERS'
  | 'PACKAGING'
  | 'SNACKS'
  | 'OTHER';

export type ItemUnit = 'KG' | 'G' | 'LITRES' | 'ML' | 'PACKETS' | 'PIECES';

export type TransactionType = 'PURCHASE' | 'USAGE' | 'WASTAGE' | 'ADJUSTMENT' | 'REVERSAL';

export type TransactionStatus = 'ACTIVE' | 'CANCELLED';

export type ShopType = 'TEA_SHOP' | 'CAFE' | 'RESTAURANT' | 'OTHER';

export interface ShopSettings {
  lowStockAlerts: boolean;
  weekStartsOn: 0 | 1;
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY';
}

export interface Shop {
  id: string;
  name: string;
  ownerName: string;
  phone: string;
  address?: string | null;
  currency: string;
  type: ShopType;
  timezone: string;
  settings: ShopSettings;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  name?: string | null;
  role: Role;
  shopId?: string | null;
  shop?: Shop | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Supplier {
  id: string;
  shopId: string;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  shopId: string;
  name: string;
  description?: string | null;
  category: ItemCategory;
  unit: ItemUnit;
  leadTimeDays: number;
  openingStock: number;
  currentStock: number;
  unitCost: number;
  minStock: number;
  reorderLevel: number;
  targetStock: number;
  supplierId?: string | null;
  supplier?: Supplier | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RecordUser = Pick<User, 'id' | 'username' | 'name' | 'role'>;

export interface StockTransaction {
  id: string;
  shopId: string;
  itemId: string;
  item?: InventoryItem;
  type: TransactionType;
  status?: TransactionStatus;
  quantity: number;
  unitCost?: number | null;
  totalCost?: number | null;
  supplierId?: string | null;
  supplier?: Supplier | null;
  reference?: string | null;
  remarks?: string | null;
  inputUnit?: ItemUnit | null;
  inputQuantity?: number | null;
  inputUnitCost?: number | null;
  reversalOfId?: string | null;
  reversal?: StockTransaction | null;
  reversalOf?: StockTransaction | null;
  saleId?: string | null;
  usageRecordId?: string | null;
  auditGroupId?: string | null;
  cancelledAt?: string | null;
  cancelledById?: string | null;
  cancelledByUser?: RecordUser | null;
  createdByUser?: RecordUser | null;
  cancellationReason?: string | null;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export type Purchase = StockTransaction;

export interface RecipeItem {
  id: string;
  menuItemId: string;
  itemId: string;
  quantity: number;
  item: InventoryItem;
}

export interface MenuItem {
  id: string;
  shopId: string;
  name: string;
  description?: string | null;
  category: 'TEA' | 'COFFEE' | 'BEVERAGE' | 'SNACK' | 'OTHER';
  sellingPrice: number;
  isActive: boolean;
  recipeItems: RecipeItem[];
  createdAt: string;
  updatedAt: string;
}

export interface SaleItem {
  id: string;
  saleId: string;
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  menuItem?: MenuItem | null;
}

export interface Sale {
  id: string;
  shopId: string;
  reference?: string | null;
  notes?: string | null;
  total: number;
  status: TransactionStatus;
  idempotencyKey?: string | null;
  auditGroupId?: string | null;
  cancelledAt?: string | null;
  cancelledById?: string | null;
  cancelledByUser?: RecordUser | null;
  cancellationReason?: string | null;
  createdById?: string | null;
  createdByUser?: RecordUser | null;
  date: string;
  items: SaleItem[];
  movements: StockTransaction[];
  createdAt: string;
  updatedAt: string;
}

export interface StockUsageItem {
  id: string;
  usageRecordId: string;
  itemId: string;
  name: string;
  unit: ItemUnit;
  quantity: number;
  unitCost: number;
  totalCost: number;
  item?: InventoryItem | null;
}

export interface StockUsage {
  id: string;
  shopId: string;
  reference?: string | null;
  notes?: string | null;
  totalCost: number;
  status: TransactionStatus;
  idempotencyKey?: string | null;
  auditGroupId?: string | null;
  cancelledAt?: string | null;
  cancelledById?: string | null;
  cancelledByUser?: RecordUser | null;
  cancellationReason?: string | null;
  createdById?: string | null;
  createdByUser?: RecordUser | null;
  date: string;
  items: StockUsageItem[];
  movements: StockTransaction[];
  createdAt: string;
  updatedAt: string;
}

export type StockAlertType = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'NEEDS_REORDER';
export type StockAlertStatus = 'ACTIVE' | 'RESOLVED';

export interface StockAlert {
  id: string;
  shopId: string;
  itemId: string;
  type: StockAlertType;
  status: StockAlertStatus;
  activeKey?: string | null;
  title: string;
  message: string;
  currentStock: number;
  minStock: number;
  reorderLevel: number;
  targetStock: number;
  suggestedQty: number;
  triggeredAt: string;
  resolvedAt?: string | null;
  resolutionReason?: string | null;
  readAt?: string | null;
  item?: InventoryItem | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockAlertSummary {
  activeCount: number;
  unreadCount: number;
  outOfStockCount: number;
  lowStockCount: number;
  needsReorderCount: number;
}
