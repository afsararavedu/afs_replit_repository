import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import type { DailySale } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";

const upload = multer({ storage: multer.memoryStorage() });

const EMPTY_ORDER = {
  brandNumber: "",
  brandName: "",
  productType: "",
  packType: "",
  packSize: "",
  qtyCasesDelivered: 0,
  qtyBottlesDelivered: 0,
  ratePerCase: "0",
  unitRatePerBottle: "0",
  totalAmount: "0",
  breakageBottleQty: 0,
  remarks: "",
  invoiceDate: "",
  icdcNumber: "",
};

const COLUMN_MAP: Record<string, keyof typeof EMPTY_ORDER> = {
  "brand number": "brandNumber",
  brandnumber: "brandNumber",
  brand_number: "brandNumber",
  "brand no": "brandNumber",
  "brand no.": "brandNumber",
  "brand name": "brandName",
  brandname: "brandName",
  brand_name: "brandName",
  "product type": "productType",
  producttype: "productType",
  product_type: "productType",
  type: "productType",
  "pack type": "packType",
  packtype: "packType",
  pack_type: "packType",
  "pack size": "packSize",
  packsize: "packSize",
  pack_size: "packSize",
  "pack qty / size (ml)": "packSize",
  "pack qty": "packSize",
  "qty cases delivered": "qtyCasesDelivered",
  "qty cases": "qtyCasesDelivered",
  "cases delivered": "qtyCasesDelivered",
  cases: "qtyCasesDelivered",
  qty_cases_delivered: "qtyCasesDelivered",
  "qty bottles delivered": "qtyBottlesDelivered",
  "qty bottles": "qtyBottlesDelivered",
  "bottles delivered": "qtyBottlesDelivered",
  bottles: "qtyBottlesDelivered",
  qty_bottles_delivered: "qtyBottlesDelivered",
  "rate per case": "ratePerCase",
  "rate/case": "ratePerCase",
  rate_per_case: "ratePerCase",
  "unit rate per bottle": "unitRatePerBottle",
  "unit rate": "unitRatePerBottle",
  "rate/bottle": "unitRatePerBottle",
  unit_rate_per_bottle: "unitRatePerBottle",
  "total amount": "totalAmount",
  totalamount: "totalAmount",
  total_amount: "totalAmount",
  amount: "totalAmount",
  total: "totalAmount",
  "breakage bottle qty": "breakageBottleQty",
  breakage: "breakageBottleQty",
  breakage_bottle_qty: "breakageBottleQty",
  "breakage btl qty": "breakageBottleQty",
  remarks: "remarks",
  remark: "remarks",
  "invoice date": "invoiceDate",
  invoice_date: "invoiceDate",
  invoicedate: "invoiceDate",
  "icdc number": "icdcNumber",
  icdc_number: "icdcNumber",
  icdcnumber: "icdcNumber",
  "icdc no": "icdcNumber",
};

function mapHeaderToField(header: string): keyof typeof EMPTY_ORDER | null {
  // Strip colons and normalize so "Invoice Date:" matches "invoice date"
  const normalized = header.trim().toLowerCase().replace(/:/g, "").trim();
  return COLUMN_MAP[normalized] || null;
}

function rowToOrder(
  row: Record<string, any>,
  headerMap: Record<string, keyof typeof EMPTY_ORDER>,
): typeof EMPTY_ORDER {
  const order = { ...EMPTY_ORDER };
  for (const [col, field] of Object.entries(headerMap)) {
    const val = row[col];
    if (val === undefined || val === null || val === "") continue;
    if (
      field === "qtyCasesDelivered" ||
      field === "qtyBottlesDelivered" ||
      field === "breakageBottleQty"
    ) {
      (order as any)[field] = parseInt(String(val)) || 0;
    } else if (
      field === "ratePerCase" ||
      field === "unitRatePerBottle" ||
      field === "totalAmount"
    ) {
      (order as any)[field] = String(val);
    } else if (field === "invoiceDate") {
      // Excel stores dates as serial numbers — convert to readable string
      if (typeof val === "number" && val > 1000) {
        (order as any)[field] = excelSerialToDateStr(val);
      } else {
        (order as any)[field] = String(val).trim();
      }
    } else {
      (order as any)[field] = String(val);
    }
  }
  return order;
}

function excelSerialToDateStr(serial: number): string {
  // Excel stores dates as days since 1899-12-30
  const date = new Date((serial - 25569) * 86400 * 1000);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const month = months[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

function parseSpreadsheet(buffer: Buffer, filename: string) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const jsonRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: true,
  });

  if (jsonRows.length === 0) {
    throw new Error("The file appears to be empty or has no data rows.");
  }

  const headers = Object.keys(jsonRows[0]);
  const headerMap: Record<string, keyof typeof EMPTY_ORDER> = {};
  for (const h of headers) {
    const field = mapHeaderToField(h);
    if (field) {
      headerMap[h] = field;
    }
  }

  if (Object.keys(headerMap).length === 0) {
    const orders: (typeof EMPTY_ORDER)[] = [];
    for (const row of jsonRows) {
      const vals = Object.values(row)
        .map((v) => String(v).trim())
        .filter(Boolean);
      if (vals.length >= 2) {
        orders.push({
          ...EMPTY_ORDER,
          brandNumber: vals[0] || "",
          brandName: vals[1] || "",
          productType: vals[2] || "",
          packType: vals[3] || "",
          packSize: vals[4] || "",
          qtyCasesDelivered: parseInt(vals[5]) || 0,
          qtyBottlesDelivered: parseInt(vals[6]) || 0,
          ratePerCase: vals[7] || "0",
          unitRatePerBottle: vals[8] || "0",
          totalAmount: vals[9] || "0",
          breakageBottleQty: parseInt(vals[10]) || 0,
          remarks: vals[11] || "",
        });
      }
    }
    return orders;
  }

  return jsonRows.map((row) => rowToOrder(row, headerMap));
}

async function parsePdfInvoice(
  buffer: Buffer,
): Promise<{ orders: (typeof EMPTY_ORDER)[]; shopDetail: Record<string, string> | null }> {
  const { PDFParse } = await import("pdf-parse");
  const uint8 = new Uint8Array(buffer);
  const parser = new PDFParse(uint8);
  await (parser as any).load();
  const result = await (parser as any).getText();
  const allText: string = result.pages.map((p: any) => p.text).join("\n");
  const lines = allText
    .split("\n")
    .map((l: string) => l.replace(/\t/g, " ").trim())
    .filter(Boolean);

  let invoiceDate = "";
  let icdcNumber = "";
  let shopName = "";
  let shopAddress = "";
  let retailShopExciseTax = "";
  let licenseNo = "";
  let panNumber = "";
  let namePhone = "";
  let gazetteCodeLicenseeIssueDate = "";

  for (const line of lines) {
    const dateMatch = line.match(/Invoice\s*Date\s*:\s*(.+?)(?:\s{2,}|$)/i);
    if (dateMatch && !invoiceDate) {
      invoiceDate = dateMatch[1].trim();
    }
    const icdcMatch = line.match(/ICDC\s*Number\s*[:\s]\s*(ICDC\S+)/i);
    if (icdcMatch && !icdcNumber) {
      icdcNumber = icdcMatch[1].trim();
    }
    if (!icdcNumber) {
      const standaloneIcdc = line.match(/^(ICDC\d{10,})$/);
      if (standaloneIcdc) {
        icdcNumber = standaloneIcdc[1].trim();
      }
    }

    const licMatch = line.match(/License\s*No\s*[:.]\s*(.+)/i);
    if (licMatch && !licenseNo) {
      licenseNo = licMatch[1].trim();
    }

    const panMatch = line.match(/PAN\s*(Number|No)?\s*[:.]\s*(.+)/i);
    if (panMatch && !panNumber) {
      panNumber = panMatch[2].trim();
    }

    const exciseMatch = line.match(/Retail\s*Shop\s*Excise\s*Tax\s*[:.]\s*(.+)/i);
    if (exciseMatch && !retailShopExciseTax) {
      retailShopExciseTax = exciseMatch[1].trim();
    }

    if (!retailShopExciseTax && line.match(/Retail\s*Shop\s*Excise\s*Tax/i)) {
      const addressLine = line.trim();
      const exciseParts = addressLine.split(/Retail\s*Shop\s*Excise\s*Tax\s*/i);
      if (exciseParts.length > 1) {
        retailShopExciseTax = exciseParts[1].replace(/^[:.]\s*/, "").trim();
        if (exciseParts[0]) {
          shopAddress = exciseParts[0].trim();
        }
      }
    }

    const phoneMatch = line.match(/(?:Name|Phone|Mobile|Contact)\s*[&\/,]\s*(?:Phone|Name|Mobile|Contact)\s*[:.]\s*(.+)/i);
    if (phoneMatch && !namePhone) {
      namePhone = phoneMatch[1].trim();
    }

    const gazetteMatch = line.match(/Gazette\s*Code\s*[&,]\s*Licensee\s*Issue\s*Date\s*[:.]\s*(.+)/i);
    if (gazetteMatch && !gazetteCodeLicenseeIssueDate) {
      gazetteCodeLicenseeIssueDate = gazetteMatch[1].trim();
    }
    if (!gazetteCodeLicenseeIssueDate) {
      const altGazette = line.match(/Gazette\s*Code.*?[:.]\s*(.+)/i);
      if (altGazette) {
        gazetteCodeLicenseeIssueDate = altGazette[1].trim();
      }
    }
  }

  if (lines.length > 0 && !shopName) {
    for (let idx = 0; idx < Math.min(5, lines.length); idx++) {
      const l = lines[idx];
      if (l.match(/^(Duplicate|Original|Tax\s*Invoice|Invoice\s*No|Sl\.?\s*No|ICDC|Invoice\s*Date)/i)) continue;
      if (l.match(/License\s*No|PAN|Gazette|Retail\s*Shop/i)) continue;
      if (!shopName) {
        shopName = l;
        continue;
      }
      if (!shopAddress && !l.match(/License\s*No|PAN|Gazette|Retail\s*Shop|Invoice/i)) {
        shopAddress = l;
        break;
      }
    }
  }

  const shopDetail: Record<string, string> = {
    name: shopName,
    address: shopAddress,
    retailShopExciseTax,
    licenseNo,
    panNumber,
    namePhone,
    invoiceDate,
    gazetteCodeLicenseeIssueDate,
    icdcNumber,
  };

  const hasShopData = Object.values(shopDetail).some(v => v && v.length > 0);
  

  const parsedOrders: (typeof EMPTY_ORDER)[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const slNoMatch = line.match(/^(\d+)\s+(\d{3,5})\s+(.+)/);
    if (!slNoMatch) {
      i++;
      continue;
    }

    const brandNumber = slNoMatch[2];
    let rest = slNoMatch[3];

    i++;
    while (
      i < lines.length &&
      !lines[i].match(/^\d+\s+\d{3,5}\s+/) &&
      !lines[i].match(
        /^(Duplicate|Original|Total|Grand|Sub|Breakage|Particulars|Sl\.No)/i,
      )
    ) {
      rest += " " + lines[i];
      i++;
    }

    const sizeMatch = rest.match(/(\d+\s*\/\s*\d+\s*ml)/i);
    if (!sizeMatch) continue;

    const packSize = sizeMatch[1].replace(/\s+/g, " ").trim();
    const beforeSize = rest.substring(0, rest.indexOf(sizeMatch[0])).trim();
    const afterSize = rest
      .substring(rest.indexOf(sizeMatch[0]) + sizeMatch[0].length)
      .trim();

    const typeMatch = beforeSize.match(
      /^(.+?)\s+(Beer|IML|IMFL|Wine|RTD)\s+([A-Z])\s*$/i,
    );
    let brandName = "",
      productType = "",
      packType = "";
    if (typeMatch) {
      brandName = typeMatch[1].trim();
      productType = typeMatch[2].trim();
      packType = typeMatch[3].trim();
    } else {
      const altMatch = beforeSize.match(/^(.+?)\s+([A-Z])\s*$/);
      if (altMatch) {
        brandName = altMatch[1].trim();
        packType = altMatch[2].trim();
      } else {
        brandName = beforeSize;
      }
    }

    const cleanNum = (s: string | undefined) =>
      (s || "0").replace(/,/g, "").trim();
    const nums = afterSize.match(/[\d,]+\.?\d*/g) || [];

    let qtyCases = 0,
      qtyBottles = 0,
      ratePerCase = "0",
      unitRate = "0",
      totalAmt = "0";
    if (nums.length >= 4) {
      qtyCases = parseInt(cleanNum(nums[0])) || 0;
      qtyBottles = parseInt(cleanNum(nums[1])) || 0;
      ratePerCase = cleanNum(nums[2]);
      unitRate = cleanNum(nums[nums.length - 2]);
      totalAmt = cleanNum(nums[nums.length - 1]);
    } else if (nums.length === 3) {
      qtyCases = parseInt(cleanNum(nums[0])) || 0;
      qtyBottles = 0;
      ratePerCase = cleanNum(nums[1]);
      totalAmt = cleanNum(nums[2]);
    }

    parsedOrders.push({
      ...EMPTY_ORDER,
      brandNumber,
      brandName: brandName.replace(/\s+/g, " ").trim(),
      productType,
      packType,
      packSize,
      qtyCasesDelivered: qtyCases,
      qtyBottlesDelivered: qtyBottles,
      ratePerCase,
      unitRatePerBottle: unitRate,
      totalAmount: totalAmt,
      invoiceDate,
      icdcNumber,
    });
  }

  if (parsedOrders.length === 0) {
    throw new Error(
      "Could not extract any order data from the PDF. Please ensure it follows the invoice format.",
    );
  }

  return { orders: parsedOrders, shopDetail: hasShopData ? shopDetail : null };
}

async function parseUploadedFile(buffer: Buffer, filename: string): Promise<{ orders: (typeof EMPTY_ORDER)[]; shopDetail: Record<string, string> | null }> {
  const ext = filename.toLowerCase().split(".").pop() || "";

  if (ext === "csv" || ext === "xls" || ext === "xlsx") {
    return { orders: parseSpreadsheet(buffer, filename), shopDetail: null };
  } else if (ext === "pdf") {
    return parsePdfInvoice(buffer);
  } else {
    throw new Error(
      `Unsupported file type: .${ext}. Please upload .csv, .xls, .xlsx, or .pdf files.`,
    );
  }
}

import { setupAuth } from "./auth";
import bcrypt from "bcryptjs";

/** Convert various invoice date formats to YYYY-MM-DD for comparison */
function normalizeInvoiceDate(invDate: string): string | null {
  if (!invDate) return null;
  // Already ISO: "2025-12-30"
  if (/^\d{4}-\d{2}-\d{2}$/.test(invDate)) return invDate;
  // "30-Dec-2025" or "30-Jan-2026"
  const MONTHS: Record<string, string> = {
    jan:"01", feb:"02", mar:"03", apr:"04", may:"05", jun:"06",
    jul:"07", aug:"08", sep:"09", oct:"10", nov:"11", dec:"12",
  };
  const m1 = invDate.match(/^(\d{1,2})-([A-Za-z]+)-(\d{4})$/);
  if (m1) {
    const monthNum = MONTHS[m1[2].toLowerCase()];
    if (monthNum) return `${m1[3]}-${monthNum}-${m1[1].padStart(2, "0")}`;
  }
  // "30/12/2025" or "30-12-2025"
  const m2 = invDate.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m2) return `${m2[3]}-${m2[2].padStart(2,"0")}-${m2[1].padStart(2,"0")}`;
  return null;
}

/** Extract size string from packSize like "48 / 180 ml" → "180 ml" */
function extractSizeFromPackSize(packSize: string): string {
  const parts = packSize.split("/");
  return parts.length >= 2 ? parts[1].trim() : packSize.trim();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  setupAuth(app);

  // Sales
  app.get(api.sales.list.path, async (req, res) => {
    const date = req.query.date as string | undefined;
    if (date) {
      const sales = await storage.getDailySalesByDate(date);

      // Opening balance priority chain for date D:
      //   1. daily_stock[D-1].totalStockBottles  (saved snapshot — most accurate)
      //      If D-1 has no snapshot, use the most recent daily_stock before D
      //      (handles gaps where a day was skipped without saving)
      //   2. daily_sales[D-1].totalClosingStock   (saved records but no snapshot)
      //   3. stock_details.totalStockBottles       (current stock — covers "new stock
      //      received but no sales entered yet" scenario)
      const prevDate = new Date(date);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split("T")[0];

      const [rawPrevDayStock, prevDaySales, allStock] = await Promise.all([
        storage.getDailyStockByDate(prevDateStr),
        storage.getDailySalesByDate(prevDateStr),
        storage.getStockDetails(),
      ]);

      // If no snapshot for D-1, fall back to the most recent available snapshot before D
      const prevDayStock =
        rawPrevDayStock.length > 0
          ? rawPrevDayStock
          : await storage.getMostRecentDailyStockBefore(date);

      // Build normalised helpers
      const normSize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");
      const normStr  = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");

      // 4-field key: Brand No | Brand Name | Size | Qty/Cs
      // Used for opening balance matching across daily_stock, daily_sales, stock_details
      const normKey4 = (brandNo: string, brandName: string, size: string, qtyPerCase: number) =>
        `${brandNo}|${normStr(brandName)}|${normSize(size)}|${qtyPerCase}`;

      // 2-field key: Brand No | Size (used for order aggregation only — orders lack brandName/qty reliably)
      const normKey2 = (brandNo: string, size: string) =>
        `${brandNo}|${normSize(size)}`;

      // Step 1: Build orderNewStk first (needed for opening balance calculation below)
      // New Stock (Cs/Btls): aggregate from orders whose invoice_date matches selected date
      const allOrders = await storage.getOrders();
      const matchingOrders = allOrders.filter((o) => {
        const norm = normalizeInvoiceDate(o.invoiceDate || "");
        return norm === date;
      });

      type OrderAgg = { cases: number; bottles: number };
      const orderNewStk = new Map<string, OrderAgg>();
      for (const o of matchingOrders) {
        const size = extractSizeFromPackSize(o.packSize);
        const key = normKey2(o.brandNumber, size);
        const existing = orderNewStk.get(key) || { cases: 0, bottles: 0 };
        existing.cases += o.qtyCasesDelivered ?? 0;
        existing.bottles += o.qtyBottlesDelivered ?? 0;
        orderNewStk.set(key, existing);
      }

      // Step 2: Build TWO opening balance maps keyed on all 4 fields
      // (Brand No + Brand Name + Size + Qty/Cs) to match exactly what the
      // Stock page shows for D-1 ("Tot Stk (Btls)").
      //
      // openingBalMapStrict: EXISTING saved records — only confirmed historical
      //   sources (daily_stock[D-1] → daily_sales[D-1]).  No stock_details fallback.
      //
      // openingBalMapFull: VIRTUAL rows — adds stock_details as final fallback so
      //   new dates always show something before the user saves any sales.

      const openingBalMapStrict = new Map<string, number>();
      // Level 2: previous day's daily_sales closing stock
      for (const s of prevDaySales) {
        const key = normKey4(s.brandNumber, s.brandName, s.size, s.quantityPerCase ?? 0);
        openingBalMapStrict.set(key, s.totalClosingStock ?? 0);
      }
      // Level 1 (highest): previous day's daily_stock snapshot — "Tot Stk (Btls)"
      for (const s of prevDayStock) {
        const key = normKey4(s.brandNumber, s.brandName, s.size, s.quantityPerCase ?? 0);
        openingBalMapStrict.set(key, s.totalStockBottles ?? 0);
      }

      // Full map: openingBalMapStrict + stock_details fallback (minus today's orders)
      const openingBalMapFull = new Map<string, number>(openingBalMapStrict);
      for (const s of allStock) {
        const key4 = normKey4(s.brandNumber, s.brandName ?? "", s.size, s.quantityPerCase ?? 0);
        if (!openingBalMapFull.has(key4)) {
          const qtyPerCase = s.quantityPerCase ?? 12;
          const orderKey = normKey2(s.brandNumber, s.size);
          const todayOrders = orderNewStk.get(orderKey);
          const todayOrderBottles = todayOrders
            ? todayOrders.cases * qtyPerCase + todayOrders.bottles
            : 0;
          const openingBalance = Math.max(0, (s.totalStockBottles ?? 0) - todayOrderBottles);
          openingBalMapFull.set(key4, openingBalance);
        }
      }

      // Fetch sales MRP overrides
      const salesMrpList = await storage.getSalesMrpDetails();

      const findMrpOverride = (brandNumber: string, size: string) => {
        return salesMrpList.find((m) => {
          if (m.brandNumber !== brandNumber) return false;
          const sNorm = normSize(m.size);
          const dNorm = normSize(size);
          return sNorm === dNorm || sNorm.includes(dNorm) || dNorm.includes(sNorm);
        });
      };

      // If no daily_sales exist for this date yet, generate virtual rows.
      // CASE 2: Orders exist for this date → orders = new stock; prev day daily_sales = opening balance
      //   • Match orders vs prev day daily_sales by Brand No + Brand Name + Size
      //   • Unmatched prev day rows carry forward (opening balance, no new stock)
      // CASE 1: No orders for this date → use prev day daily_sales as carry-forward rows
      // FALLBACK: neither → use stock_details (legacy behaviour)
      if (sales.length === 0) {
        // 3-field key for prev-day matching: Brand No | Brand Name | Size
        const normKey3 = (brandNo: string, brandName: string, size: string) =>
          `${brandNo}|${normStr(brandName)}|${normSize(size)}`;

        // Build prev-day map by Brand No + Brand Name + Size
        const prevDayMap = new Map<string, typeof prevDaySales[0]>();
        for (const s of prevDaySales) {
          prevDayMap.set(normKey3(s.brandNumber, s.brandName, s.size), s);
        }

        // Helper to build a virtual row from base fields
        const makeVirtualRow = (
          idx: number,
          brandNumber: string,
          brandName: string,
          size: string,
          quantityPerCase: number,
          openingBalanceBottles: number,
          newStockCases: number,
          newStockBottles: number,
          mrpVal: string,
        ) => ({
          id: -(idx + 1),
          brandNumber,
          brandName,
          size,
          quantityPerCase,
          openingBalanceBottles,
          newStockCases,
          newStockBottles,
          closingBalanceCases: 0,
          closingBalanceBottles: 0,
          soldBottles: 0,
          mrp: mrpVal,
          saleValue: "0",
          totalSaleValue: "0",
          breakageBottles: 0,
          totalClosingStock: 0,
          finalClosingBalance: 0,
          saleDate: date,
          invoiceDate: null,
          isSubmitted: false,
          createdAt: null,
        });

        if (matchingOrders.length > 0) {
          // ── CASE 2: orders exist ──
          // Aggregate matching orders by Brand No + Size
          type OrderRowAgg = { brandNumber: string; brandName: string; size: string; cases: number; bottles: number };
          const orderRowMap = new Map<string, OrderRowAgg>();
          for (const o of matchingOrders) {
            const size = extractSizeFromPackSize(o.packSize);
            const key = normKey2(o.brandNumber, size);
            const existing = orderRowMap.get(key);
            if (existing) {
              existing.cases += o.qtyCasesDelivered ?? 0;
              existing.bottles += o.qtyBottlesDelivered ?? 0;
            } else {
              orderRowMap.set(key, { brandNumber: o.brandNumber, brandName: o.brandName, size, cases: o.qtyCasesDelivered ?? 0, bottles: o.qtyBottlesDelivered ?? 0 });
            }
          }

          const virtualRows: ReturnType<typeof makeVirtualRow>[] = [];
          const matchedPrevKeys = new Set<string>();

          for (const [, ord] of Array.from(orderRowMap.entries())) {
            // Try to find prev-day sale by Brand No + Brand Name + Size
            const key3 = normKey3(ord.brandNumber, ord.brandName, ord.size);
            const prevSale = prevDayMap.get(key3);
            if (prevSale) matchedPrevKeys.add(key3);

            const openingBalance = prevSale ? (prevSale.totalClosingStock ?? 0) : 0;
            const stockMatch = allStock.find((s) => normKey2(s.brandNumber, s.size) === normKey2(ord.brandNumber, ord.size));
            const qtyPerCase = prevSale?.quantityPerCase ?? stockMatch?.quantityPerCase ?? 12;
            const mrpOverride = findMrpOverride(ord.brandNumber, ord.size);
            const mrpVal = mrpOverride ? mrpOverride.salesMrp : (prevSale?.mrp ?? stockMatch?.mrp ?? "0");

            virtualRows.push(makeVirtualRow(virtualRows.length, ord.brandNumber, ord.brandName, ord.size, qtyPerCase, openingBalance, ord.cases, ord.bottles, mrpVal));
          }

          // Carry-forward: prev day rows that had no matching order
          for (const [key3, prevSale] of Array.from(prevDayMap.entries())) {
            if (!matchedPrevKeys.has(key3)) {
              const mrpOverride = findMrpOverride(prevSale.brandNumber, prevSale.size);
              const mrpVal = mrpOverride ? mrpOverride.salesMrp : (prevSale.mrp ?? "0");
              virtualRows.push(makeVirtualRow(virtualRows.length, prevSale.brandNumber, prevSale.brandName, prevSale.size, prevSale.quantityPerCase ?? 12, prevSale.totalClosingStock ?? 0, 0, 0, mrpVal));
            }
          }

          return res.json(virtualRows);
        }

        // ── CASE 1: No orders → carry prev day daily_sales forward ──
        if (prevDaySales.length > 0) {
          const virtualRows = prevDaySales.map((sale, idx) => {
            const mrpOverride = findMrpOverride(sale.brandNumber, sale.size);
            const mrpVal = mrpOverride ? mrpOverride.salesMrp : (sale.mrp ?? "0");
            return makeVirtualRow(idx, sale.brandNumber, sale.brandName, sale.size, sale.quantityPerCase ?? 12, sale.totalClosingStock ?? 0, 0, 0, mrpVal);
          });
          return res.json(virtualRows);
        }

        // ── FALLBACK: no orders, no prev day sales → use stock_details ──
        if (allStock.length > 0) {
          const virtualRows = allStock.map((stock, idx) => {
            const key4 = normKey4(stock.brandNumber, stock.brandName ?? "", stock.size, stock.quantityPerCase ?? 0);
            const orderKey = normKey2(stock.brandNumber, stock.size);
            const openingBalance = openingBalMapFull.get(key4) ?? 0;
            const orderAgg = orderNewStk.get(orderKey);
            const mrpOverride = findMrpOverride(stock.brandNumber, stock.size);
            const qtyPerCase = stock.quantityPerCase ?? 12;
            const newStockCases = orderAgg ? orderAgg.cases : 0;
            const newStockBottles = orderAgg ? orderAgg.bottles : 0;
            const mrpVal = mrpOverride ? mrpOverride.salesMrp : (stock.mrp || "0");
            return {
              id: -(idx + 1),
              brandNumber: stock.brandNumber,
              brandName: stock.brandName,
              size: stock.size,
              quantityPerCase: qtyPerCase,
              openingBalanceBottles: openingBalance,
              newStockCases,
              newStockBottles,
              closingBalanceCases: 0,
              closingBalanceBottles: 0,
              soldBottles: 0,
              mrp: mrpVal,
              saleValue: "0",
              totalSaleValue: "0",
              breakageBottles: 0,
              totalClosingStock: 0,
              finalClosingBalance: 0,
              saleDate: date,
              invoiceDate: stock.invoiceDate ?? null,
              isSubmitted: false,
              createdAt: null,
            };
          });
          return res.json(virtualRows);
        }
      }

      // Existing records — override opening balance (from historical sources only),
      // new stock, and MRP from live sources.
      // If no historical source found (no daily_stock/daily_sales for D-1),
      // keep the value already stored in the DB record.
      const salesWithOverrides = sales.map((sale) => {
        const key4 = normKey4(sale.brandNumber, sale.brandName, sale.size, sale.quantityPerCase ?? 0);
        const orderKey = normKey2(sale.brandNumber, sale.size);
        const openingBalance = openingBalMapStrict.has(key4)
          ? openingBalMapStrict.get(key4)!
          : (sale.openingBalanceBottles ?? 0);
        const orderAgg = orderNewStk.get(orderKey);
        const mrpOverride = findMrpOverride(sale.brandNumber, sale.size);

        return {
          ...sale,
          openingBalanceBottles: openingBalance,
          newStockCases: orderAgg ? orderAgg.cases : 0,
          newStockBottles: orderAgg ? orderAgg.bottles : 0,
          mrp: mrpOverride ? mrpOverride.salesMrp : sale.mrp,
        };
      });
      return res.json(salesWithOverrides);
    }
    const sales = await storage.getDailySales();
    res.json(sales);
  });

  // Sales MRP overrides
  app.get("/api/sales-mrp", async (_req, res) => {
    const data = await storage.getSalesMrpDetails();
    res.json(data);
  });

  app.post("/api/sales-mrp", async (req, res) => {
    try {
      const { brandNumber, brandName, size, productType, salesMrp } = req.body;
      if (!brandNumber || !brandName || !size || !productType) {
        return res.status(400).json({ message: "brandNumber, brandName, size, and productType are required" });
      }
      if (parseFloat(salesMrp) < 0) {
        return res.status(400).json({ message: "salesMrp must not be less than 0" });
      }
      const result = await storage.upsertSalesMrpDetail({ brandNumber, brandName, size, productType, salesMrp: String(salesMrp) });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get(api.sales.isSubmitted.path, async (req, res) => {
    const date = req.query.date as string | undefined;
    if (!date) {
      return res.status(400).json({ message: "date query parameter is required" });
    }
    const isSubmitted = await storage.isSalesSubmittedForDate(date);
    res.json({ isSubmitted });
  });

  app.post(api.sales.submit.path, async (req, res) => {
    try {
      const { date } = api.sales.submit.input.parse(req.body);
      const isAdmin = (req.user as any)?.role === "admin";
      const alreadySubmitted = await storage.isSalesSubmittedForDate(date);
      // Employee: block re-submission. Admin: allow re-submission (just re-marks as submitted)
      if (alreadySubmitted && !isAdmin) {
        return res.status(400).json({ message: "Sales for this date are already submitted." });
      }
      const submittedCount = await storage.submitSalesForDate(date);
      res.json({ submittedCount, alreadySubmitted });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.post(api.sales.bulkUpdate.path, async (req, res) => {
    try {
      const input = api.sales.bulkUpdate.input.parse(req.body);
      const date = req.query.date as string | undefined;
      const isAdminUser = (req.user as any)?.role === "admin";

      // Resolve effective date: use provided date or default to today
      const effectiveDate = date || new Date().toISOString().split('T')[0];

      let result: DailySale[];
      if (date) {
        const isSubmitted = await storage.isSalesSubmittedForDate(date);
        // Only employees are blocked by submission lock; admin can always re-save
        if (isSubmitted && !isAdminUser) {
          return res.status(400).json({ message: "Sales for this date are already submitted and cannot be edited." });
        }
        result = await storage.bulkUpdateDailySalesForDate(input, date);
      } else {
        const todaySubmitted = await storage.isSalesSubmittedForDate(effectiveDate);
        if (todaySubmitted && !isAdminUser) {
          return res.status(400).json({ message: "Sales for today are already submitted and cannot be edited." });
        }
        result = await storage.bulkUpdateDailySales(input);
      }

      // Sync stock for the saved date: decrease stock_in_cases / stock_in_bottles
      // by the closing balance values from this date's daily_sales.
      const stockSync = await storage.syncDailySalesToStock(effectiveDate);
      console.log(
        `Stock sync from sales save (${effectiveDate}): ${stockSync.updatedStockCount} stock rows updated`,
      );

      // Always snapshot closing stock to daily_stock for the saved date
      await storage.upsertDailyStockSnapshot(effectiveDate);
      console.log(`Daily stock snapshot saved for date ${effectiveDate}`);

      res.status(201).json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });


  // Daily stock by date
  app.get("/api/daily-stock", async (req, res) => {
    const date = req.query.date as string | undefined;
    if (!date) return res.status(400).json({ message: "date query parameter is required" });
    const result = await storage.getDailyStockByDate(date);
    res.json(result);
  });

  // Check if invoice already exists by invoice_date + icdc_number
  app.get("/api/orders/check-invoice", async (req, res) => {
    const invoiceDate = req.query.invoice_date as string | undefined;
    const icdcNumber = req.query.icdc_number as string | undefined;
    if (!invoiceDate && !icdcNumber) {
      return res.json({ exists: false });
    }
    const allOrders = await storage.getOrders();
    const exists = allOrders.some((o) => {
      if (invoiceDate && icdcNumber) {
        return o.invoiceDate === invoiceDate && o.icdcNumber === icdcNumber;
      }
      if (invoiceDate) return o.invoiceDate === invoiceDate;
      if (icdcNumber) return o.icdcNumber === icdcNumber;
      return false;
    });
    res.json({ exists, invoiceDate, icdcNumber });
  });

  // Orders
  app.get(api.orders.list.path, async (req, res) => {
    const invoiceDate = req.query.invoice_date as string | undefined;
    const icdcNumber = req.query.icdc_number as string | undefined;
    const allOrders = await storage.getOrders();
    let filtered = allOrders;
    if (invoiceDate) {
      filtered = filtered.filter((o) => o.invoiceDate === invoiceDate);
    }
    if (icdcNumber) {
      filtered = filtered.filter((o) => o.icdcNumber === icdcNumber);
    }
    res.json(filtered);
  });

  app.post(api.orders.bulkCreate.path, async (req, res) => {
    try {
      const input = api.orders.bulkCreate.input.parse(req.body);
      const result = await storage.bulkCreateOrders(input);
      // Orders are stored only — stock is updated exclusively from "Save Sales"
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });

  // Stock
  app.get(api.stock.list.path, async (req, res) => {
    const stock = await storage.getStockDetails();
    res.json(stock);
  });

  app.post(api.stock.bulkUpdate.path, async (req, res) => {
    try {
      const input = api.stock.bulkUpdate.input.parse(req.body);
      const result = await storage.bulkUpdateStockDetails(input);

      const salesSync = await storage.syncStockToDailySales();
      console.log(
        `Sales sync (from stock update): ${salesSync.updatedSalesCount} updated, ${salesSync.createdSalesCount} created in daily sales`,
      );

      res.status(201).json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });


  app.get("/api/sales/earliest-invoice-date", async (_req, res) => {
    try {
      const date = await storage.getEarliestInvoiceDate();
      res.json({ invoiceDate: date });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch earliest invoice date" });
    }
  });

  // Returns the latest distinct invoice_date from the orders table (YYYY-MM-DD)
  app.get("/api/orders/latest-invoice-date", async (_req, res) => {
    try {
      const date = await storage.getLatestOrderInvoiceDate();
      res.json({ invoiceDate: date });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch latest order invoice date" });
    }
  });

  app.get("/api/sales/summary", async (req, res) => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().split("T")[0];

      // Today's sales for the requested date
      const todaySales = await storage.getDailySalesByDate(date);

      // Previous day's sales — for Opening Balance Value
      const prevDate = new Date(date);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split("T")[0];
      const prevSales = await storage.getDailySalesByDate(prevDateStr);

      // Opening Balance Value = sum of D-1's (finalClosingBalance bottles × MRP)
      const openingBalanceValue = prevSales.reduce(
        (acc, s) => {
          const bottles = (s.finalClosingBalance as number) || 0;
          const mrp = parseFloat(s.mrp as string) || 0;
          return acc + bottles * mrp;
        },
        0
      );

      const allOrders = await storage.getOrders();
      const orderTypeMap: Record<string, string> = {};
      for (const o of allOrders) {
        orderTypeMap[o.brandNumber] = o.productType;
      }

      let newStockValue = 0;
      let soldStockValue = 0;

      const categories: Record<string, { opening: number; newStock: number; sold: number; closing: number }> = {};

      for (const s of todaySales) {
        const mrp = parseFloat(s.mrp as string) || 0;
        const qtyPerCase = s.quantityPerCase || 0;
        const opBal = s.openingBalanceBottles || 0;
        const newCs = s.newStockCases || 0;
        const newBtls = s.newStockBottles || 0;
        const soldBtls = s.soldBottles || 0;
        const totalClosing = s.totalClosingStock || 0;

        // New Stock in bottles = Total Stk - Op. Bal (Btls) = newStockCases * qty + newStockBottles
        const newStockBottlesCalc = (newCs * qtyPerCase) + newBtls;

        // New Stock Value = MRP × (Total Stk − Op. Bal Btls)
        newStockValue += newStockBottlesCalc * mrp;
        soldStockValue += soldBtls * mrp;

        const pType = orderTypeMap[s.brandNumber] || "Other";
        if (!categories[pType]) {
          categories[pType] = { opening: 0, newStock: 0, sold: 0, closing: 0 };
        }
        categories[pType].opening += opBal;
        categories[pType].newStock += newStockBottlesCalc;
        categories[pType].sold += soldBtls;
        categories[pType].closing += totalClosing;
      }

      // Closing Balance Value = Opening + New Stock - Sold Stock
      const closingBalanceValue = openingBalanceValue + newStockValue - soldStockValue;

      res.json({
        openingBalanceValue,
        newStockValue,
        soldStockValue,
        closingBalanceValue,
        categories,
      });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to compute sales summary: " + err.message });
    }
  });

  app.get("/api/shop-details", async (_req, res) => {
    try {
      const details = await storage.getShopDetails();
      res.json(details);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch shop details: " + err.message });
    }
  });

  app.get("/api/shop-details/by-license/:licenseNo", async (req, res) => {
    try {
      const detail = await storage.getShopDetailByLicenseNo(req.params.licenseNo);
      if (!detail) {
        return res.status(404).json({ message: "No shop details found for this license number" });
      }
      res.json(detail);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch shop details: " + err.message });
    }
  });

  app.get("/api/shop-details/by-icdc/:icdcNumber", async (req, res) => {
    try {
      const detail = await storage.getShopDetailByIcdcNumber(req.params.icdcNumber);
      if (!detail) {
        return res.status(404).json({ message: "No shop details found for this ICDC number" });
      }
      res.json(detail);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch shop details: " + err.message });
    }
  });

  app.get("/api/template/download", (req, res) => {
    const format = (req.query.format as string) || "pdf";

    if (format === "pdf") {
      const pdfPath = path.resolve(
        "attached_assets/sample_Invoice_Templates_1770376466401.pdf",
      );
      if (!fs.existsSync(pdfPath)) {
        return res.status(404).json({ message: "Template PDF not found" });
      }
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=Invoice_Template_Sample.pdf",
      );
      res.setHeader("Content-Type", "application/pdf");
      fs.createReadStream(pdfPath).pipe(res);
      return;
    }

    const xlsxPath = path.resolve(
      "attached_assets/Invoice_Template_1775231757722.xlsx",
    );
    if (!fs.existsSync(xlsxPath)) {
      return res.status(404).json({ message: "Template Excel file not found" });
    }
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=Invoice_Template.xlsx",
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    fs.createReadStream(xlsxPath).pipe(res);
  });

  // Upload
  app.post(api.upload.create.path, upload.single("file"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const allowedExts = [".csv", ".xls", ".xlsx", ".pdf"];
    const ext =
      "." + (req.file.originalname.toLowerCase().split(".").pop() || "");
    if (!allowedExts.includes(ext)) {
      return res
        .status(400)
        .json({ message: "Please upload a .csv, .xls, .xlsx, or .pdf file." });
    }

    try {
      const result = await parseUploadedFile(
        req.file.buffer,
        req.file.originalname,
      );

      if (result.shopDetail) {
        try {
          await storage.createShopDetail(result.shopDetail as any);
        } catch (shopErr: any) {
          console.error("Failed to save shop details:", shopErr.message);
        }
      }

      res.json({
        message: `Successfully parsed ${result.orders.length} orders from file. Please review and confirm before saving.`,
        filename: req.file.originalname,
        orders: result.orders,
        ordersCount: result.orders.length,
        shopDetail: result.shopDetail,
      });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to parse file: " + err.message });
    }
  });

  // Seed Data - retry on DB cold start
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await seedDatabase();
      break;
    } catch (err: any) {
      console.error(
        `Seed attempt ${attempt}/${maxRetries} failed: ${err.message}`,
      );
      if (attempt === maxRetries) {
        console.error(
          "Seeding failed after retries, continuing without seed data",
        );
      } else {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  return httpServer;
}

async function seedDatabase() {
  // Create admin and employee users if they don't exist
  const adminUser = await storage.getUserByUsername("admin");
  if (!adminUser) {
    const hashedPassword = await bcrypt.hash("admin123", 10);
    await storage.createUser({
      username: "admin",
      password: hashedPassword,
      role: "admin",
      tempPassword: null,
      mustResetPassword: false,
    });
  }

  const employeeUser = await storage.getUserByUsername("employee");
  if (!employeeUser) {
    const hashedPassword = await bcrypt.hash("employee123", 10);
    await storage.createUser({
      username: "employee",
      password: hashedPassword,
      role: "employee",
      tempPassword: null,
      mustResetPassword: false,
    });
  }

}
