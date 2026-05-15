
import { pgTable, text, serial, integer, numeric, date, timestamp, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TABLE DEFINITIONS ===

// Table for the "Sales" page (matching figmascreen.png)
export const dailySales = pgTable("daily_sales", {
  id: serial("id").primaryKey(),
  brandNumber: text("brand_number").notNull(),
  brandName: text("brand_name").notNull(),
  size: text("size").notNull(),
  quantityPerCase: integer("quantity_per_case").notNull(),
  openingBalanceBottles: integer("opening_balance_bottles").default(0),
  newStockCases: integer("new_stock_cases").default(0),
  newStockBottles: integer("new_stock_bottles").default(0),
  // Editable fields
  closingBalanceCases: integer("closing_balance_cases").default(0),
  closingBalanceBottles: integer("closing_balance_bottles").default(0),
  mrp: numeric("mrp").notNull(),
  totalSaleValue: numeric("total_sale_value").default('0'), // Renamed from saleValue
  soldBottles: integer("sold_bottles").default(0),
  saleValue: numeric("sale_value").default('0'),
  breakageBottles: integer("breakage_bottles").default(0),
  totalClosingStock: integer("total_closing_stock").default(0),
  finalClosingBalance: integer("final_closing_balance").default(0),
  saleDate: date("sale_date", { mode: "string" }).defaultNow(),
  invoiceDate: date("invoice_date", { mode: "string" }),
  isSubmitted: boolean("is_submitted").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("daily_sales_brand_size_date_idx").on(table.brandNumber, table.size, table.saleDate),
  index("daily_sales_sale_date_idx").on(table.saleDate),
]);

// Table for the "Other Data" -> Order Form (matching Image 1)
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  brandNumber: text("brand_number").notNull(),
  brandName: text("brand_name").notNull(),
  productType: text("product_type").notNull(),
  packType: text("pack_type").notNull(),
  packSize: text("pack_size").notNull(),
  qtyCasesDelivered: integer("qty_cases_delivered").default(0),
  qtyBottlesDelivered: integer("qty_bottles_delivered").default(0),
  ratePerCase: numeric("rate_per_case").default('0'),
  unitRatePerBottle: numeric("unit_rate_per_bottle").default('0'),
  totalAmount: numeric("total_amount").default('0'),
  breakageBottleQty: integer("breakage_bottle_qty").default(0),
  totalBottles: integer("total_bottles").default(0),
  remarks: text("remarks"),
  invoiceDate: date("invoice_date", { mode: "string" }),
  icdcNumber: text("icdc_number"),
  dataUpdated: text("data_updated").default("NO").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Table for the "Stock" page (matching image_1768795267421.png)
export const stockDetails = pgTable("stock_details", {
  id: serial("id").primaryKey(),
  brandNumber: text("brand_number").notNull(),
  brandName: text("brand_name").notNull(),
  size: text("size").notNull(),
  quantityPerCase: integer("quantity_per_case").notNull(),
  stockInCases: integer("stock_in_cases").default(0),
  stockInBottles: integer("stock_in_bottles").default(0),
  totalStockBottles: integer("total_stock_bottles").default(0),
  mrp: numeric("mrp").notNull(),
  totalStockValue: numeric("total_stock_value").default('0'),
  breakage: integer("breakage").default(0),
  remarks: text("remarks"),
  invoiceDate: date("invoice_date", { mode: "string" }).defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Daily stock snapshot — closing stock per date (derived from daily_sales closing values)
export const dailyStock = pgTable("daily_stock", {
  id: serial("id").primaryKey(),
  brandNumber: text("brand_number").notNull(),
  brandName: text("brand_name").notNull(),
  size: text("size").notNull(),
  quantityPerCase: integer("quantity_per_case").notNull(),
  stockInCases: integer("stock_in_cases").default(0),
  stockInBottles: integer("stock_in_bottles").default(0),
  totalStockBottles: integer("total_stock_bottles").default(0),
  mrp: numeric("mrp").notNull(),
  totalStockValue: numeric("total_stock_value").default('0'),
  breakage: integer("breakage").default(0),
  remarks: text("remarks"),
  date: date("date", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("daily_stock_brand_size_date_idx").on(table.brandNumber, table.size, table.date),
]);

export const insertDailyStockSchema = createInsertSchema(dailyStock).omit({ id: true, createdAt: true });
export type DailyStock = typeof dailyStock.$inferSelect;
export type InsertDailyStock = z.infer<typeof insertDailyStockSchema>;

// Table to track per-date submission status (authoritative lock per date)
export const salesSubmitStatus = pgTable("sales_submit_status", {
  id: serial("id").primaryKey(),
  date: date("date", { mode: "string" }).notNull().unique(),
  isSubmitted: boolean("is_submitted").default(false).notNull(),
  submittedAt: timestamp("submitted_at"),
});

export const insertSalesSubmitStatusSchema = createInsertSchema(salesSubmitStatus).omit({
  id: true,
});

export type SalesSubmitStatus = typeof salesSubmitStatus.$inferSelect;
export type InsertSalesSubmitStatus = z.infer<typeof insertSalesSubmitStatusSchema>;

// === SCHEMAS ===

export const insertDailySaleSchema = createInsertSchema(dailySales).omit({ 
  id: true, 
  createdAt: true 
});

export const insertOrderSchema = createInsertSchema(orders).omit({ 
  id: true, 
  createdAt: true,
  dataUpdated: true,
  totalBottles: true
});

export const insertStockDetailSchema = createInsertSchema(stockDetails).omit({
  id: true,
  updatedAt: true
});

// === TYPES ===

export type DailySale = typeof dailySales.$inferSelect;
export type InsertDailySale = z.infer<typeof insertDailySaleSchema>;

export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;

export type StockDetail = typeof stockDetails.$inferSelect;
export type InsertStockDetail = z.infer<typeof insertStockDetailSchema>;

// User table for authentication and roles
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role", { enum: ["admin", "employee"] }).notNull().default("employee"),
  tempPassword: text("temp_password"),
  mustResetPassword: boolean("must_reset_password").default(false),
  passwordChangedAt: timestamp("password_changed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ 
  id: true, 
  createdAt: true 
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

// Shop details table - extracted from PDF invoice headers
export const shopDetails = pgTable("shop_details", {
  id: serial("id").primaryKey(),
  name: text("name"),
  address: text("address"),
  retailShopExciseTax: text("retail_shop_excise_tax"),
  licenseNo: text("license_no"),
  panNumber: text("pan_number"),
  namePhone: text("name_phone"),
  invoiceDate: text("invoice_date"),
  gazetteCodeLicenseeIssueDate: text("gazette_code_licensee_issue_date"),
  icdcNumber: text("icdc_number"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertShopDetailSchema = createInsertSchema(shopDetails).omit({
  id: true,
  createdAt: true,
});

export type ShopDetail = typeof shopDetails.$inferSelect;
export type InsertShopDetail = z.infer<typeof insertShopDetailSchema>;

// Sales MRP overrides — per-brand MRP used in sales calculations instead of stock MRP
export const salesMrpDetails = pgTable("sales_mrp_details", {
  id: serial("id").primaryKey(),
  brandNumber: text("brand_number").notNull(),
  brandName: text("brand_name").notNull(),
  size: text("size").notNull(),
  productType: text("product_type").notNull().default(""),
  salesMrp: numeric("sales_mrp").notNull().default('0'),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("sales_mrp_brand_size_idx").on(table.brandNumber, table.brandName, table.size, table.productType),
]);

export const insertSalesMrpDetailSchema = createInsertSchema(salesMrpDetails).omit({ id: true, updatedAt: true });
export type SalesMrpDetail = typeof salesMrpDetails.$inferSelect;
export type InsertSalesMrpDetail = z.infer<typeof insertSalesMrpDetailSchema>;

// Expense categories — configurable list of expense/income types managed by Admin
export const expenseCategories = pgTable("expense_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // "expense" | "income"
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertExpenseCategorySchema = createInsertSchema(expenseCategories).omit({ id: true, createdAt: true });
export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type InsertExpenseCategory = z.infer<typeof insertExpenseCategorySchema>;

// Daily expenses — actual expense/income entries per day
export const dailyExpenses = pgTable("daily_expenses", {
  id: serial("id").primaryKey(),
  date: date("date", { mode: "string" }).notNull(),
  type: text("type").notNull(), // "expense" | "income"
  category: text("category").notNull(),
  amount: numeric("amount").notNull().default('0'),
  description: text("description"),
  paymentMode: text("payment_mode").notNull().default("Cash"), // "Cash" | "UPI" | "Bank"
  submittedBy: text("submitted_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDailyExpenseSchema = createInsertSchema(dailyExpenses).omit({ id: true, createdAt: true });
export type DailyExpense = typeof dailyExpenses.$inferSelect;
export type InsertDailyExpense = z.infer<typeof insertDailyExpenseSchema>;

// Request types
export type BulkCreateDailySalesRequest = InsertDailySale[];
export type BulkCreateOrdersRequest = InsertOrder[];
export type BulkUpdateStockRequest = InsertStockDetail[];
