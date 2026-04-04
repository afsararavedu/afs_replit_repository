
import { 
  dailySales, orders, stockDetails, users, shopDetails, salesSubmitStatus, dailyStock, salesMrpDetails,
  type DailySale, type InsertDailySale,
  type Order, type InsertOrder,
  type StockDetail, type InsertStockDetail,
  type User, type InsertUser,
  type ShopDetail, type InsertShopDetail,
  type SalesSubmitStatus,
  type DailyStock,
  type SalesMrpDetail, type InsertSalesMrpDetail,
} from "@shared/schema";
import { eq, and, sql, desc, asc, inArray, lt } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db } from "./db";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<User>): Promise<User>;
  
  // Sales
  getDailySales(): Promise<DailySale[]>;
  getDailySalesByDate(date: string): Promise<DailySale[]>;
  getEarliestInvoiceDate(): Promise<string | null>;
  bulkUpdateDailySales(sales: InsertDailySale[]): Promise<DailySale[]>;
  bulkUpdateDailySalesForDate(sales: InsertDailySale[], date: string): Promise<DailySale[]>;
  submitSalesForDate(date: string): Promise<number>;
  isSalesSubmittedForDate(date: string): Promise<boolean>;
  getSubmitStatus(date: string): Promise<SalesSubmitStatus | undefined>;
  
  // Orders
  getOrders(): Promise<Order[]>;
  bulkCreateOrders(orders: InsertOrder[]): Promise<Order[]>;

  // Stock
  getStockDetails(): Promise<StockDetail[]>;
  bulkUpdateStockDetails(stock: InsertStockDetail[]): Promise<StockDetail[]>;
  syncOrdersToStock(): Promise<{ syncedOrderIds: number[]; updatedStockCount: number }>;
  syncStockToDailySales(): Promise<{ updatedSalesCount: number; createdSalesCount: number }>;
  syncDailySalesToStock(date?: string): Promise<{ updatedStockCount: number }>;

  // Daily Stock Snapshots
  getDailyStockByDate(date: string): Promise<DailyStock[]>;
  getMostRecentDailyStockBefore(date: string): Promise<DailyStock[]>;
  upsertDailyStockSnapshot(date: string): Promise<void>;

  // Sales MRP Overrides
  getSalesMrpDetails(): Promise<SalesMrpDetail[]>;
  upsertSalesMrpDetail(data: InsertSalesMrpDetail): Promise<SalesMrpDetail>;

  // Shop Details
  createShopDetail(shop: InsertShopDetail): Promise<ShopDetail>;
  getShopDetails(): Promise<ShopDetail[]>;
  getShopDetailByLicenseNo(licenseNo: string): Promise<ShopDetail | undefined>;
  getShopDetailByIcdcNumber(icdcNumber: string): Promise<ShopDetail | undefined>;

  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      conObject: {
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false,
        },
      },
      createTableIfMissing: true,
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: number, partialUser: Partial<User>): Promise<User> {
    const [user] = await db.update(users).set(partialUser).where(eq(users.id, id)).returning();
    return user;
  }

  // Sales
  async getDailySales(): Promise<DailySale[]> {
    return await db.select().from(dailySales);
  }

  async getDailySalesByDate(date: string): Promise<DailySale[]> {
    return await db.select().from(dailySales).where(eq(dailySales.saleDate, date));
  }

  async getEarliestInvoiceDate(): Promise<string | null> {
    const result = await db
      .select({ invoiceDate: dailySales.invoiceDate })
      .from(dailySales)
      .where(sql`${dailySales.invoiceDate} IS NOT NULL`)
      .orderBy(asc(dailySales.invoiceDate))
      .limit(1);
    return result[0]?.invoiceDate ?? null;
  }

  async bulkUpdateDailySales(salesData: InsertDailySale[]): Promise<DailySale[]> {
    const results: DailySale[] = [];
    const today = new Date().toISOString().split('T')[0];
    
    for (const sale of salesData) {
      const [updated] = await db.insert(dailySales)
        .values({ ...sale, saleDate: today })
        .onConflictDoUpdate({
          target: [dailySales.brandNumber, dailySales.size, dailySales.saleDate],
          set: {
            ...sale,
            saleDate: today,
          }
        })
        .returning();
      results.push(updated);
    }
    return results;
  }

  async bulkUpdateDailySalesForDate(salesData: InsertDailySale[], date: string): Promise<DailySale[]> {
    const results: DailySale[] = [];
    
    for (const sale of salesData) {
      const [updated] = await db.insert(dailySales)
        .values({ ...sale, saleDate: date, isSubmitted: false })
        .onConflictDoUpdate({
          target: [dailySales.brandNumber, dailySales.size, dailySales.saleDate],
          set: {
            closingBalanceCases: sale.closingBalanceCases,
            closingBalanceBottles: sale.closingBalanceBottles,
            soldBottles: sale.soldBottles,
            saleValue: sale.saleValue,
            totalSaleValue: sale.totalSaleValue,
            breakageBottles: sale.breakageBottles,
            totalClosingStock: sale.totalClosingStock,
            finalClosingBalance: sale.finalClosingBalance,
            mrp: sale.mrp,
          }
        })
        .returning();
      results.push(updated);
    }
    return results;
  }

  async submitSalesForDate(date: string): Promise<number> {
    // Mark all daily_sales rows for this date as submitted
    const result = await db.update(dailySales)
      .set({ isSubmitted: true })
      .where(eq(dailySales.saleDate, date))
      .returning();
    
    // Upsert into authoritative submit_status table
    await db.insert(salesSubmitStatus)
      .values({ date, isSubmitted: true, submittedAt: new Date() })
      .onConflictDoUpdate({
        target: [salesSubmitStatus.date],
        set: { isSubmitted: true, submittedAt: new Date() },
      });

    return result.length;
  }

  async isSalesSubmittedForDate(date: string): Promise<boolean> {
    // Check the authoritative submit_status table first
    const [status] = await db.select()
      .from(salesSubmitStatus)
      .where(and(eq(salesSubmitStatus.date, date), eq(salesSubmitStatus.isSubmitted, true)))
      .limit(1);
    return !!status;
  }

  async getSubmitStatus(date: string): Promise<SalesSubmitStatus | undefined> {
    const [status] = await db.select().from(salesSubmitStatus).where(eq(salesSubmitStatus.date, date)).limit(1);
    return status;
  }

  // Orders
  async getOrders(): Promise<Order[]> {
    return await db.select().from(orders).orderBy(desc(orders.id));
  }

  async bulkCreateOrders(ordersData: InsertOrder[]): Promise<Order[]> {
    if (ordersData.length === 0) return [];
    const withTotalBottles = ordersData.map(order => {
      const packParts = order.packSize.split("/").map((s: string) => s.trim());
      const qtyPerCase = packParts.length > 0 ? parseInt(packParts[0], 10) : 0;
      const totalBottles = (isNaN(qtyPerCase) ? 0 : qtyPerCase) * (order.qtyCasesDelivered ?? 0) + (order.qtyBottlesDelivered ?? 0);
      return { ...order, totalBottles };
    });
    return await db.insert(orders).values(withTotalBottles).returning();
  }

  // Stock
  async getStockDetails(): Promise<StockDetail[]> {
    return await db.select().from(stockDetails);
  }

  async bulkUpdateStockDetails(stockData: InsertStockDetail[]): Promise<StockDetail[]> {
    const results: StockDetail[] = [];
    const today = new Date().toISOString().split('T')[0];

    for (const item of stockData) {
      const [created] = await db.insert(stockDetails)
        .values({ ...item, invoiceDate: item.invoiceDate ?? today })
        .returning();
      results.push(created);
    }
    return results;
  }

  async syncOrdersToStock(): Promise<{ syncedOrderIds: number[]; updatedStockCount: number }> {
    const unsyncedOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.dataUpdated, "NO"));

    if (unsyncedOrders.length === 0) {
      return { syncedOrderIds: [], updatedStockCount: 0 };
    }

    const allStock = await db.select().from(stockDetails);

    const normalizeBrand = (b: string) => b.replace(/^0+/, '') || '0';
    const normalizeName = (n: string) => n.trim().toLowerCase().replace(/\s+/g, "");

    const extractSizeFromPackSize = (packSize: string): string => {
      const parts = packSize.split("/");
      if (parts.length >= 2) return parts[1].trim();
      return packSize.trim();
    };

    const extractQtyPerCaseFromPackSize = (packSize: string): number => {
      const parts = packSize.split("/");
      if (parts.length >= 1) {
        const num = parseInt(parts[0].trim(), 10);
        return isNaN(num) ? 0 : num;
      }
      return 0;
    };

    type AggValue = {
      stockId: number | null;
      brandNumber: string;
      brandName: string;
      size: string;
      quantityPerCase: number;
      mrpPerBottle: number;
      casesDelivered: number;
      bottlesDelivered: number;
      totalBottles: number;
      orderIds: number[];
      invoiceDate: string | null;
    };

    const updateAgg = new Map<string, AggValue>();
    const createAgg = new Map<string, AggValue>();

    for (const order of unsyncedOrders) {
      const orderBrandNorm = normalizeBrand(order.brandNumber);
      const orderNameNorm = normalizeName(order.brandName);
      const orderSize = extractSizeFromPackSize(order.packSize);
      const orderSizeNorm = orderSize.toLowerCase().replace(/\s+/g, "");

      const matchedStock = allStock.find(s => {
        if (normalizeBrand(s.brandNumber) !== orderBrandNorm) return false;
        if (normalizeName(s.brandName) !== orderNameNorm) return false;
        const stockSizeNorm = s.size.trim().toLowerCase().replace(/\s+/g, "");
        return stockSizeNorm === orderSizeNorm;
      });

      const compositeKey = `${orderBrandNorm}|${orderNameNorm}|${orderSizeNorm}`;
      const aggMap = matchedStock ? updateAgg : createAgg;

      const existing = aggMap.get(compositeKey);
      if (existing) {
        existing.casesDelivered += order.qtyCasesDelivered ?? 0;
        existing.bottlesDelivered += order.qtyBottlesDelivered ?? 0;
        existing.totalBottles += order.totalBottles ?? 0;
        existing.orderIds.push(order.id);
        // Keep the most recent invoice date
        if (order.invoiceDate && (!existing.invoiceDate || order.invoiceDate > existing.invoiceDate)) {
          existing.invoiceDate = order.invoiceDate;
        }
      } else {
        aggMap.set(compositeKey, {
          stockId: matchedStock ? matchedStock.id : null,
          brandNumber: order.brandNumber,
          brandName: order.brandName,
          size: orderSize,
          quantityPerCase: extractQtyPerCaseFromPackSize(order.packSize),
          mrpPerBottle: parseFloat(order.unitRatePerBottle ?? '0'),
          casesDelivered: order.qtyCasesDelivered ?? 0,
          bottlesDelivered: order.qtyBottlesDelivered ?? 0,
          totalBottles: order.totalBottles ?? 0,
          orderIds: [order.id],
          invoiceDate: order.invoiceDate ?? null,
        });
      }
    }

    let updatedStockCount = 0;
    const today = new Date().toISOString().split('T')[0];
    const syncedOrderIds: number[] = [];

    for (const agg of Array.from(updateAgg.values())) {
      const matchedStock = allStock.find(s => s.id === agg.stockId)!;

      const newCases = (matchedStock.stockInCases ?? 0) + agg.casesDelivered;
      const newBottles = (matchedStock.stockInBottles ?? 0) + agg.bottlesDelivered;
      const newTotalBottles = (matchedStock.totalStockBottles ?? 0) + agg.totalBottles;
      const mrpNum = parseFloat(matchedStock.mrp) || 0;
      const newTotalValue = (newTotalBottles * mrpNum).toFixed(2);

      await db.update(stockDetails)
        .set({
          stockInCases: newCases,
          stockInBottles: newBottles,
          totalStockBottles: newTotalBottles,
          totalStockValue: newTotalValue,
          invoiceDate: agg.invoiceDate ?? today,
          updatedAt: new Date(),
        })
        .where(eq(stockDetails.id, matchedStock.id));

      updatedStockCount++;
      syncedOrderIds.push(...agg.orderIds);
    }

    for (const agg of Array.from(createAgg.values())) {
      const mrpEstimate = agg.mrpPerBottle > 0 ? agg.mrpPerBottle : 0;
      const totalValue = (agg.totalBottles * mrpEstimate).toFixed(2);

      await db.insert(stockDetails).values({
        brandNumber: agg.brandNumber,
        brandName: agg.brandName,
        size: agg.size,
        quantityPerCase: agg.quantityPerCase,
        stockInCases: agg.casesDelivered,
        stockInBottles: agg.bottlesDelivered,
        totalStockBottles: agg.totalBottles,
        mrp: String(mrpEstimate),
        totalStockValue: totalValue,
        breakage: 0,
        invoiceDate: agg.invoiceDate ?? today,
      });

      updatedStockCount++;
      syncedOrderIds.push(...agg.orderIds);
    }

    for (const orderId of syncedOrderIds) {
      await db.update(orders)
        .set({ dataUpdated: "YES" })
        .where(eq(orders.id, orderId));
    }

    return { syncedOrderIds, updatedStockCount };
  }

  async syncStockToDailySales(): Promise<{ updatedSalesCount: number; createdSalesCount: number }> {
    const allStock = await db.select().from(stockDetails);
    const today = new Date().toISOString().split('T')[0];

    if (allStock.length === 0) {
      return { updatedSalesCount: 0, createdSalesCount: 0 };
    }

    // Only operate on today's date; skip if today is already submitted
    const todaySubmitted = await this.isSalesSubmittedForDate(today);
    if (todaySubmitted) {
      console.log(`syncStockToDailySales: today (${today}) is already submitted, skipping.`);
      return { updatedSalesCount: 0, createdSalesCount: 0 };
    }

    // Only load today's non-submitted sales records
    let todaySales = await db.select().from(dailySales)
      .where(and(eq(dailySales.saleDate, today), eq(dailySales.isSubmitted, false)));

    let updatedSalesCount = 0;
    let createdSalesCount = 0;
    const processedSaleIds = new Set<number>();

    for (const stock of allStock) {
      const normalizedStockSize = stock.size.trim().toLowerCase().replace(/\s+/g, "");

      const matchedSale = todaySales.find(sale => {
        if (processedSaleIds.has(sale.id)) return false;
        if (sale.brandNumber !== stock.brandNumber) return false;
        const saleSize = sale.size.trim().toLowerCase().replace(/\s+/g, "");
        if (normalizedStockSize !== saleSize && !normalizedStockSize.includes(saleSize) && !saleSize.includes(normalizedStockSize)) return false;
        return true;
      });

      if (matchedSale) {
        await db.update(dailySales)
          .set({
            openingBalanceBottles: stock.totalStockBottles ?? 0,
            newStockCases: stock.stockInCases ?? 0,
            newStockBottles: stock.stockInBottles ?? 0,
            invoiceDate: stock.invoiceDate ?? null,
          })
          .where(and(eq(dailySales.id, matchedSale.id), eq(dailySales.isSubmitted, false)));

        processedSaleIds.add(matchedSale.id);
        updatedSalesCount++;
      } else {
        try {
          const [created] = await db.insert(dailySales).values({
            brandNumber: stock.brandNumber,
            brandName: stock.brandName,
            size: stock.size,
            quantityPerCase: stock.quantityPerCase,
            openingBalanceBottles: stock.totalStockBottles ?? 0,
            newStockCases: stock.stockInCases ?? 0,
            newStockBottles: stock.stockInBottles ?? 0,
            closingBalanceCases: 0,
            closingBalanceBottles: 0,
            mrp: stock.mrp || '0',
            totalSaleValue: '0',
            soldBottles: 0,
            saleValue: '0',
            breakageBottles: 0,
            totalClosingStock: 0,
            finalClosingBalance: '0',
            saleDate: today,
            invoiceDate: stock.invoiceDate ?? null,
          }).onConflictDoUpdate({
            target: [dailySales.brandNumber, dailySales.size, dailySales.saleDate],
            set: {
              openingBalanceBottles: stock.totalStockBottles ?? 0,
              newStockCases: stock.stockInCases ?? 0,
              newStockBottles: stock.stockInBottles ?? 0,
              invoiceDate: stock.invoiceDate ?? null,
            },
          }).returning();
          if (created) {
            createdSalesCount++;
            todaySales.push(created);
          }
        } catch (e: any) {
          console.log(`Skipping daily_sales insert for brand ${stock.brandNumber} size ${stock.size}: ${e.message}`);
        }
      }
    }

    return { updatedSalesCount, createdSalesCount };
  }

  async syncDailySalesToStock(date?: string): Promise<{ updatedStockCount: number }> {
    // Sync any date's saved sales to stock_details.
    // Logic: DECREASE stock_in_cases and stock_in_bottles by the daily_sales closing
    // balance values (closing_balance_cases / closing_balance_bottles).
    // Matching criteria: brand_number + brand_name + size + quantity_per_case
    const targetDate = date || new Date().toISOString().split('T')[0];

    // Select ALL sales for this date (submitted or not — the route handles auth)
    const dateSales = await db.select().from(dailySales)
      .where(eq(dailySales.saleDate, targetDate));
    const allStock = await db.select().from(stockDetails);

    if (dateSales.length === 0 || allStock.length === 0) {
      return { updatedStockCount: 0 };
    }

    const normStr = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");

    let updatedStockCount = 0;

    for (const stock of allStock) {
      const matchedSale = dateSales.find(sale => {
        if (sale.brandNumber !== stock.brandNumber) return false;
        if (normStr(sale.brandName) !== normStr(stock.brandName)) return false;
        const saleSize = normStr(sale.size);
        const stockSize = normStr(stock.size);
        if (stockSize !== saleSize && !stockSize.includes(saleSize) && !saleSize.includes(stockSize)) return false;
        // Also match quantity per case
        if ((sale.quantityPerCase ?? 0) !== (stock.quantityPerCase ?? 0)) return false;
        return true;
      });

      if (matchedSale) {
        const closingCases = matchedSale.closingBalanceCases ?? 0;
        const closingBottles = matchedSale.closingBalanceBottles ?? 0;

        // Decrease stock by the closing balance values (cannot go below 0)
        const newStockInCases = Math.max(0, (stock.stockInCases ?? 0) - closingCases);
        const newStockInBottles = Math.max(0, (stock.stockInBottles ?? 0) - closingBottles);
        const qtyPerCase = stock.quantityPerCase ?? 1;
        const newTotalBottles = newStockInCases * qtyPerCase + newStockInBottles;
        const mrpVal = parseFloat(String(stock.mrp ?? '0')) || 0;
        const newTotalValue = newTotalBottles * mrpVal;

        await db.update(stockDetails)
          .set({
            stockInCases: newStockInCases,
            stockInBottles: newStockInBottles,
            totalStockBottles: newTotalBottles,
            totalStockValue: newTotalValue.toFixed(2),
          })
          .where(eq(stockDetails.id, stock.id));

        updatedStockCount++;
      }
    }

    return { updatedStockCount };
  }

  async getDailyStockByDate(date: string): Promise<DailyStock[]> {
    return await db.select().from(dailyStock).where(eq(dailyStock.date, date));
  }

  async getMostRecentDailyStockBefore(date: string): Promise<DailyStock[]> {
    const rows = await db
      .select()
      .from(dailyStock)
      .where(lt(dailyStock.date, date))
      .orderBy(desc(dailyStock.date))
      .limit(200);
    if (rows.length === 0) return [];
    const mostRecentDate = rows[0].date;
    return rows.filter((r) => r.date === mostRecentDate);
  }

  async upsertDailyStockSnapshot(date: string): Promise<void> {
    const dateSales = await db.select().from(dailySales).where(eq(dailySales.saleDate, date));
    for (const sale of dateSales) {
      const totalValue = (sale.totalClosingStock ?? 0) * parseFloat(sale.mrp as string);
      await db.insert(dailyStock).values({
        brandNumber: sale.brandNumber,
        brandName: sale.brandName,
        size: sale.size,
        quantityPerCase: sale.quantityPerCase,
        stockInCases: sale.closingBalanceCases ?? 0,
        stockInBottles: sale.closingBalanceBottles ?? 0,
        totalStockBottles: sale.totalClosingStock ?? 0,
        mrp: sale.mrp || '0',
        totalStockValue: totalValue.toFixed(2),
        breakage: sale.breakageBottles ?? 0,
        date: date,
      }).onConflictDoUpdate({
        target: [dailyStock.brandNumber, dailyStock.size, dailyStock.date],
        set: {
          stockInCases: sale.closingBalanceCases ?? 0,
          stockInBottles: sale.closingBalanceBottles ?? 0,
          totalStockBottles: sale.totalClosingStock ?? 0,
          mrp: sale.mrp || '0',
          totalStockValue: totalValue.toFixed(2),
          breakage: sale.breakageBottles ?? 0,
        },
      });
    }
  }

  async getSalesMrpDetails(): Promise<SalesMrpDetail[]> {
    return await db.select().from(salesMrpDetails).orderBy(salesMrpDetails.brandNumber);
  }

  async upsertSalesMrpDetail(data: InsertSalesMrpDetail): Promise<SalesMrpDetail> {
    const [result] = await db.insert(salesMrpDetails).values(data).onConflictDoUpdate({
      target: [salesMrpDetails.brandNumber, salesMrpDetails.brandName, salesMrpDetails.size, salesMrpDetails.quantityPerCase],
      set: {
        salesMrp: data.salesMrp,
        updatedAt: new Date(),
      },
    }).returning();
    return result;
  }

  async createShopDetail(shop: InsertShopDetail): Promise<ShopDetail> {
    const [created] = await db.insert(shopDetails).values(shop).returning();
    return created;
  }

  async getShopDetails(): Promise<ShopDetail[]> {
    return await db.select().from(shopDetails).orderBy(desc(shopDetails.id));
  }

  async getShopDetailByLicenseNo(licenseNo: string): Promise<ShopDetail | undefined> {
    const [detail] = await db.select().from(shopDetails).where(eq(shopDetails.licenseNo, licenseNo)).limit(1);
    return detail;
  }

  async getShopDetailByIcdcNumber(icdcNumber: string): Promise<ShopDetail | undefined> {
    const [detail] = await db.select().from(shopDetails).where(eq(shopDetails.icdcNumber, icdcNumber)).limit(1);
    return detail;
  }
}

export const storage = new DatabaseStorage();
