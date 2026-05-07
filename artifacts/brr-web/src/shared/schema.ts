// Frontend type definitions for BRR Liquor Soft
// These are plain TypeScript types (no drizzle/db imports)

export type DailySale = {
  id: number;
  brandNumber: string;
  brandName: string;
  size: string;
  quantityPerCase: number;
  openingBalanceBottles: number | null;
  newStockCases: number | null;
  newStockBottles: number | null;
  closingBalanceCases: number | null;
  closingBalanceBottles: number | null;
  mrp: string;
  totalSaleValue: string | null;
  soldBottles: number | null;
  saleValue: string | null;
  breakageBottles: number | null;
  totalClosingStock: number | null;
  finalClosingBalance: number | null;
  saleDate: string | null;
  invoiceDate: string | null;
  isSubmitted: boolean | null;
  createdAt: Date | null;
};
export type InsertDailySale = Omit<DailySale, 'id' | 'createdAt'>;

export type Order = {
  id: number;
  brandNumber: string;
  brandName: string;
  productType: string;
  packType: string;
  packSize: string;
  qtyCasesDelivered: number | null;
  qtyBottlesDelivered: number | null;
  ratePerCase: string | null;
  unitRatePerBottle: string | null;
  totalAmount: string | null;
  breakageBottleQty: number | null;
  totalBottles: number | null;
  remarks: string | null;
  invoiceDate: string | null;
  icdcNumber: string | null;
  dataUpdated: string;
  createdAt: Date | null;
};
export type InsertOrder = Omit<Order, 'id' | 'createdAt'>;

export type StockDetail = {
  id: number;
  brandNumber: string;
  brandName: string;
  size: string;
  quantityPerCase: number;
  stockInCases: number | null;
  stockInBottles: number | null;
  totalStockBottles: number | null;
  mrp: string;
  totalStockValue: string | null;
  breakage: number | null;
  remarks: string | null;
  invoiceDate: string | null;
  updatedAt: Date | null;
};
export type InsertStockDetail = Omit<StockDetail, 'id' | 'updatedAt'>;

export type DailyStock = {
  id: number;
  brandNumber: string;
  brandName: string;
  size: string;
  quantityPerCase: number;
  stockInCases: number | null;
  stockInBottles: number | null;
  totalStockBottles: number | null;
  mrp: string;
  totalStockValue: string | null;
  breakage: number | null;
  remarks: string | null;
  date: string;
  createdAt: Date | null;
};

export type User = {
  id: number;
  username: string;
  role: string;
  passwordChangedAt: string | Date | null;
};
export type InsertUser = Omit<User, 'id'>;

export type ShopDetail = {
  id: number;
  shopName: string | null;
  licenseNo: string | null;
  address: string | null;
  proprietorName: string | null;
  contactNo: string | null;
  icdcNumber: string | null;
  createdAt: Date | null;
};
export type InsertShopDetail = Omit<ShopDetail, 'id' | 'createdAt'>;

export type SalesMrpDetail = {
  id: number;
  brandNumber: string;
  brandName: string;
  size: string;
  productType: string | null;
  salesMrp: string | null;
  updatedAt: Date | null;
};
export type InsertSalesMrpDetail = Omit<SalesMrpDetail, 'id' | 'updatedAt'>;

export type SalesSubmitStatus = {
  id: number;
  saleDate: string;
  isSubmitted: boolean | null;
  submittedAt: Date | null;
  submittedBy: string | null;
};

export type ExpenseCategory = {
  id: number;
  name: string;
  type: string;
  createdAt: Date | null;
};
export type InsertExpenseCategory = Omit<ExpenseCategory, 'id' | 'createdAt'>;

export type DailyExpense = {
  id: number;
  date: string;
  type: string;
  category: string;
  amount: string;
  description: string | null;
  paymentMode: string;
  submittedBy: string;
  createdAt: Date | null;
};
export type InsertDailyExpense = Omit<DailyExpense, 'id' | 'createdAt'>;
