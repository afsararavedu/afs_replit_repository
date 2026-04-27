import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { useSales, useBulkUpdateSales, useSubmitSales, useSalesIsSubmitted } from "@/hooks/use-sales";
import {
  Search,
  Save,
  Loader2,
  Download,
  Upload,
  FileSpreadsheet,
  Store,
  Lock,
  CheckCircle,
  Send,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Check,
  X,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { type DailySale, type ShopDetail, type Order } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { PaginationCustom } from "@/components/ui/pagination-custom";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, parse, subDays } from "date-fns";
import { useAuth } from "@/hooks/use-auth";

interface SalesSummary {
  openingBalanceValue: number;
  newStockValue: number;
  soldStockValue: number;
  closingBalanceValue: number;
  categories: Record<string, { opening: number; newStock: number; sold: number; closing: number }>;
}

function getTodayLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Parses a "YYYY-MM-DD" string as LOCAL midnight (not UTC).
// new Date("YYYY-MM-DD") is UTC midnight — wrong in any timezone behind UTC.
function parseDateLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Formats a local Date back to "YYYY-MM-DD" string.
function formatDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function Sales() {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayLocal());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [exportDate, setExportDate] = useState<string>(getTodayLocal());
  const [exportDatePickerOpen, setExportDatePickerOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const { data: sales, isLoading } = useSales(selectedDate);
  const { mutate: updateSales, isPending: isSaving } = useBulkUpdateSales();
  const { mutate: submitSales, isPending: isSubmitting } = useSubmitSales();
  const { data: submissionStatus } = useSalesIsSubmitted(selectedDate);
  const isSubmitted = submissionStatus?.isSubmitted ?? false;

  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // Admin: any date up to today. Employee: last 7 days only.
  const isDateAllowedForAction = (() => {
    const today = getTodayLocal();
    if (selectedDate > today) return false;
    if (isAdmin) return true;
    const sevenDaysAgo = format(subDays(new Date(), 6), "yyyy-MM-dd");
    return selectedDate >= sevenDaysAgo;
  })();

  const { toast } = useToast();
  const [localSales, setLocalSales] = useState<DailySale[]>([]);

  const { data: shopDetails } = useQuery<ShopDetail[]>({
    queryKey: ["/api/shop-details"],
  });

  // Orders — needed to map brand → product type for category breakdown
  const { data: orders } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });
  const orderTypeMap = useMemo(() => {
    const map: Record<string, string> = {};
    (orders || []).forEach((o) => { map[o.brandNumber] = o.productType; });
    return map;
  }, [orders]);

  // Previous day's saved sales — used to calculate Opening Balance Value
  const prevDateStr = useMemo(() => {
    const d = parseDateLocal(selectedDate);
    d.setDate(d.getDate() - 1);
    return formatDateLocal(d);
  }, [selectedDate]);

  const { data: prevDaySales } = useQuery<DailySale[]>({
    queryKey: ["/api/sales/prevday", selectedDate],
    queryFn: async () => {
      const res = await fetch(`/api/sales?date=${prevDateStr}`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 0,  // Always fetch fresh previous day data
    gcTime: 0,
  });

  // Earliest order invoice date — used to floor the date picker (disable dates before first delivery)
  const { data: earliestOrderDateData } = useQuery<{ invoiceDate: string | null }>({
    queryKey: ["/api/orders/earliest-invoice-date"],
  });
  const earliestOrderDate = earliestOrderDateData?.invoiceDate
    ? parse(earliestOrderDateData.invoiceDate, "yyyy-MM-dd", new Date())
    : new Date(2020, 0, 1);
  const earliestOrderDateStr = earliestOrderDateData?.invoiceDate ?? "2020-01-01";

  // Keep this query for other consumers that still need the latest date
  const { data: latestOrderDateData } = useQuery<{ invoiceDate: string | null }>({
    queryKey: ["/api/orders/latest-invoice-date"],
  });
  const latestOrderDateStr = latestOrderDateData?.invoiceDate ?? format(new Date(), "yyyy-MM-dd");

  // No auto-switch needed: the selectable range is [earliestOrderDate, today]
  // so any date with orders is always a valid selection

  // Compute summary client-side from localSales so it updates in real-time
  const summary = useMemo<SalesSummary>(() => {
    // Opening Balance Value = sum of D-1's (finalClosingBalance bottles × MRP)
    // finalClosingBalance is in bottles; multiplying by MRP gives the stock value
    const openingBalanceValue = (prevDaySales || []).reduce(
      (acc, s) => {
        const bottles = (s.finalClosingBalance as number) || 0;
        const mrp = parseFloat(s.mrp as string) || 0;
        return acc + bottles * mrp;
      },
      0
    );

    // Opening Stock in bottles per type = previous day's totalClosingStock per type
    const categories: Record<string, { opening: number; newStock: number; sold: number; closing: number }> = {};
    for (const s of (prevDaySales || [])) {
      const pType = orderTypeMap[s.brandNumber] || "Other";
      if (!categories[pType]) {
        categories[pType] = { opening: 0, newStock: 0, sold: 0, closing: 0 };
      }
      categories[pType].opening += (s.totalClosingStock || 0);
    }

    let newStockValue = 0;
    let soldStockValue = 0;

    for (const s of localSales) {
      const mrp = parseFloat(s.mrp as string) || 0;
      const qtyPerCase = s.quantityPerCase || 0;
      const newCs = s.newStockCases || 0;
      const newBtls = s.newStockBottles || 0;
      const soldBtls = s.soldBottles || 0;

      // New Stock bottles = (New Stk Cs × Qty/Cs) + New Stk Btls
      const newStockBottlesCalc = (newCs * qtyPerCase) + newBtls;

      newStockValue += newStockBottlesCalc * mrp;
      soldStockValue += soldBtls * mrp;

      const pType = orderTypeMap[s.brandNumber] || "Other";
      if (!categories[pType]) {
        categories[pType] = { opening: 0, newStock: 0, sold: 0, closing: 0 };
      }
      categories[pType].newStock += newStockBottlesCalc;
      categories[pType].sold += soldBtls;
    }

    // Closing Stock per type = Opening + New Stock - Sold (formula-based)
    for (const pType of Object.keys(categories)) {
      categories[pType].closing = categories[pType].opening + categories[pType].newStock - categories[pType].sold;
    }

    const closingBalanceValue = openingBalanceValue + newStockValue - soldStockValue;
    return { openingBalanceValue, newStockValue, soldStockValue, closingBalanceValue, categories };
  }, [localSales, prevDaySales, orderTypeMap]);

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [salesSortField, setSalesSortField] = useState<'brandNumber' | 'mrp' | 'soldBottles' | null>(null);
  const [salesSortDir, setSalesSortDir] = useState<'asc' | 'desc'>('asc');

  // Bulk Excel upload state
  const excelFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadResult, setUploadResult] = useState<{ updated: number; skipped: number; notFound: number } | null>(null);

  // Tracks which item IDs the user has explicitly typed into a closing field this session.
  // Not touched = no sales (closing stays as total stock).
  // Touched with 0 = all sold. Touched with >0 = partial sale.
  const [touchedClosingIds, setTouchedClosingIds] = useState<Set<number>>(new Set());

  // Edit / Delete row state
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [editRowData, setEditRowData] = useState<Partial<DailySale>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  // Rows pending deletion — applied when Save Sales is clicked (not immediately)
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());

  const generateCSV = useCallback((data: DailySale[], date: string) => {
    const headers = [
      "SNo", "Brand No", "Brand Name", "Size", "Qty/Case", 
      "Opening Bal (Btls)", "New Stock (Cs)", "New Stock (Btls)", 
      "Total Stock", "Closing Bal (Cs)", "Closing Bal (Btls)", 
      "Sold Bottles", "MRP", "Sale Value", "Breakage", 
      "Total Closing Stock", "Final Closing Bal"
    ];

    const csvContent = [
      headers.join(","),
      ...data.map((item, idx) => {
        const totalStock = (item.openingBalanceBottles || 0) + ((item.quantityPerCase || 0) * (item.newStockCases || 0)) + (item.newStockBottles || 0);
        return [
          idx + 1,
          `"${item.brandNumber}"`,
          `"${item.brandName}"`,
          `"${item.size}"`,
          item.quantityPerCase,
          item.openingBalanceBottles,
          item.newStockCases,
          item.newStockBottles,
          totalStock,
          item.closingBalanceCases,
          item.closingBalanceBottles,
          item.soldBottles,
          item.mrp,
          item.saleValue,
          item.breakageBottles,
          item.totalClosingStock,
          item.finalClosingBalance
        ].join(",");
      })
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `sales_report_${date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  const handleExportCSV = useCallback(async () => {
    try {
      if (exportDate === selectedDate) {
        if (!localSales || localSales.length === 0) {
          toast({
            title: "No Data",
            description: `No sales data found for ${exportDate}.`,
            variant: "destructive",
          });
          return;
        }
        generateCSV(localSales, exportDate);
      } else {
        setIsExporting(true);
        const res = await fetch(`/api/sales?date=${encodeURIComponent(exportDate)}`);
        setIsExporting(false);
        if (!res.ok) {
          toast({
            title: "Export Failed",
            description: `Failed to fetch sales data for ${exportDate}.`,
            variant: "destructive",
          });
          return;
        }
        const data: DailySale[] = await res.json();
        if (!data || data.length === 0) {
          toast({
            title: "No Data",
            description: `No sales data found for ${exportDate}.`,
            variant: "destructive",
          });
          return;
        }
        generateCSV(data, exportDate);
      }
      toast({
        title: "Export Successful",
        description: `Sales data for ${exportDate} has been exported to CSV.`,
      });
    } catch (error) {
      setIsExporting(false);
      toast({
        title: "Export Failed",
        description: "There was an error exporting the data.",
        variant: "destructive",
      });
    }
  }, [localSales, toast, selectedDate, exportDate, generateCSV]);

  // Download Excel template pre-populated with current sales data
  const handleDownloadTemplate = useCallback(() => {
    if (!localSales || localSales.length === 0) {
      toast({ title: "No Data", description: "No sales data available for the selected date.", variant: "destructive" });
      return;
    }
    const wsData = [
      ["Brand No", "Brand Name", "Size", "Qty/Case", "Opening Bal (Btls)", "New Stock (Cs)", "New Stock (Btls)", "Total Stock", "Cls Bal (Cs)", "Cls Bal (Btls)", "Breakage"],
      ...localSales.map(s => {
        const qtyPerCase = s.quantityPerCase || 0;
        const opBal = s.openingBalanceBottles || 0;
        const newCs = s.newStockCases || 0;
        const newBtls = s.newStockBottles || 0;
        const totalStock = opBal + (qtyPerCase * newCs) + newBtls;
        return [
          s.brandNumber,
          s.brandName,
          s.size,
          qtyPerCase,
          opBal,
          newCs,
          newBtls,
          totalStock,
          s.closingBalanceCases ?? 0,
          s.closingBalanceBottles ?? 0,
          s.breakageBottles ?? "",
        ];
      }),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [
      { wch: 12 }, { wch: 40 }, { wch: 12 },
      { wch: 10 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 14 },
      { wch: 14 }, { wch: 16 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales Template");
    XLSX.writeFile(wb, `sales_template_${selectedDate}.xlsx`);
  }, [localSales, selectedDate, toast]);

  // Upload Excel and apply values into localSales (same calculation as handleInputChange)
  const handleUploadExcel = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate that the uploaded file matches the currently selected date
    if (!file.name.includes(selectedDate)) {
      toast({
        title: "Wrong Template File",
        description: `This file doesn't match the selected date (${selectedDate}). Please download the template for the correct date and upload that file.`,
        variant: "destructive",
        duration: 6000,
      });
      if (excelFileInputRef.current) excelFileInputRef.current.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
        if (rows.length < 2) {
          toast({ title: "Invalid File", description: "The file has no data rows.", variant: "destructive" });
          return;
        }
        const header = (rows[0] as string[]).map(h => String(h || "").trim().toLowerCase());
        const col = {
          brandNo:  header.findIndex(h => h.includes("brand no")),
          size:     header.findIndex(h => h.includes("size")),
          clsCs:    header.findIndex(h => h.includes("cls bal (cs)")),
          clsBtls:  header.findIndex(h => h.includes("cls bal (btls)")),
          breakage: header.findIndex(h => h.includes("breakage")),
        };
        if (col.brandNo === -1 || col.size === -1) {
          toast({ title: "Invalid Template", description: "Could not find Brand No or Size columns. Please use the downloaded template.", variant: "destructive" });
          return;
        }

        let updated = 0, skipped = 0, notFound = 0;
        const uploadedTouchedIds: number[] = [];

        setLocalSales(prev => {
          const next = [...prev];
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i] as any[];
            if (!row || row.length === 0) continue;
            const brandNo = String(row[col.brandNo] ?? "").trim();
            const size = String(row[col.size] ?? "").trim();
            if (!brandNo || !size) { skipped++; continue; }

            const clsCsRaw   = col.clsCs   >= 0 ? row[col.clsCs]   : undefined;
            const clsBtlsRaw = col.clsBtls >= 0 ? row[col.clsBtls] : undefined;
            const brkRaw     = col.breakage >= 0 ? row[col.breakage] : undefined;

            const clsEmpty  = clsCsRaw  === undefined || clsCsRaw  === null || clsCsRaw  === "";
            const btlsEmpty = clsBtlsRaw === undefined || clsBtlsRaw === null || clsBtlsRaw === "";

            // Both empty → no sale → skip (closing stays as opening)
            if (clsEmpty && btlsEmpty) { skipped++; continue; }

            const clsCs   = clsEmpty  ? 0 : (parseInt(String(clsCsRaw),   10) || 0);
            const clsBtls = btlsEmpty ? 0 : (parseInt(String(clsBtlsRaw), 10) || 0);
            const breakage = (brkRaw === undefined || brkRaw === null || brkRaw === "") ? 0 : (parseInt(String(brkRaw), 10) || 0);

            const idx = next.findIndex(s => s.brandNumber === brandNo && s.size === size);
            if (idx === -1) { notFound++; continue; }

            // Apply identical calculation to handleInputChange
            const item = next[idx];
            const opBalBtls  = item.openingBalanceBottles || 0;
            const qtyPerCase = item.quantityPerCase || 0;
            const newStockCs = item.newStockCases || 0;
            const newStockBtls = item.newStockBottles || 0;
            const mrp = parseFloat(item.mrp as string) || 0;

            const totalStock      = opBalBtls + (qtyPerCase * newStockCs) + newStockBtls;
            const closingTotal    = clsBtls + (clsCs * qtyPerCase);
            const soldBottles     = totalStock - closingTotal;
            const saleValue       = soldBottles * mrp;

            next[idx] = {
              ...item,
              closingBalanceCases: clsCs,
              closingBalanceBottles: clsBtls,
              breakageBottles: breakage,
              soldBottles,
              saleValue: saleValue.toFixed(2),
              totalSaleValue: saleValue.toFixed(2),
              totalClosingStock: closingTotal,
              finalClosingBalance: Math.round(closingTotal - breakage),
            };
            // Only mark as touched when actual sales or breakage occurred;
            // rows where closing equals total stock (no change) stay untouched so DB stays clean
            if (soldBottles !== 0 || breakage > 0) {
              uploadedTouchedIds.push(item.id);
            }
            updated++;
          }
          setUploadResult({ updated, skipped, notFound });
          return next;
        });

        // Mark Excel-uploaded items as touched so they display their closing values
        if (uploadedTouchedIds.length > 0) {
          setTouchedClosingIds(prev => new Set([...Array.from(prev), ...uploadedTouchedIds]));
        }

        if (excelFileInputRef.current) excelFileInputRef.current.value = "";
        toast({
          title: "Upload Complete",
          description: `${updated} row(s) updated · ${skipped} skipped (blank) · ${notFound} not matched`,
          className: updated > 0 ? "bg-green-50 border-green-200 text-green-800" : undefined,
        });
      } catch {
        toast({ title: "Upload Failed", description: "Could not read the file. Please use the downloaded template.", variant: "destructive" });
      }
    };
    reader.readAsBinaryString(file);
  }, [toast, selectedDate]);

  // Sync local state when data loads or date changes
  useEffect(() => {
    if (sales) {
      // Determine which rows were previously saved with explicit closing data
      const newTouched = new Set<number>();
      for (const s of sales) {
        // Row was explicitly saved if: closing > 0 (partial sale) OR soldBottles > 0 (all sold)
        if ((s.closingBalanceCases || 0) > 0 || (s.closingBalanceBottles || 0) > 0 || (s.soldBottles || 0) > 0) {
          newTouched.add(s.id);
        }
      }
      setTouchedClosingIds(newTouched);

      const recalculated = sales.map((s) => {
        const opBalBtls    = s.openingBalanceBottles ?? 0;
        const qtyPerCase   = s.quantityPerCase ?? 0;
        const newStockCs   = s.newStockCases ?? 0;
        const newStockBtls = s.newStockBottles ?? 0;
        const closingCs    = s.closingBalanceCases ?? 0;
        const closingBtls  = s.closingBalanceBottles ?? 0;
        const breakage     = s.breakageBottles ?? 0;
        const mrp          = parseFloat(s.mrp as string) || 0;
        const totalStock   = opBalBtls + (qtyPerCase * newStockCs) + newStockBtls;

        // Rows not previously touched: no sales — pre-fill closing with actual stock
        const isTouched = newTouched.has(s.id);
        if (!isTouched) {
          const defaultCs   = qtyPerCase > 0 ? Math.floor(totalStock / qtyPerCase) : 0;
          const defaultBtls = qtyPerCase > 0 ? totalStock % qtyPerCase : totalStock;
          return {
            ...s,
            closingBalanceCases: defaultCs,
            closingBalanceBottles: defaultBtls,
            soldBottles: 0,
            saleValue: "0.00",
            totalSaleValue: "0.00",
            totalClosingStock: totalStock,
            finalClosingBalance: Math.round(totalStock - breakage),
          };
        }

        // Rows with explicit closing data: recalculate fully
        const closingTotal = closingBtls + (closingCs * qtyPerCase);
        const soldBottles  = totalStock - closingTotal;
        const saleValue    = soldBottles * mrp;

        return {
          ...s,
          soldBottles,
          saleValue: saleValue.toFixed(2),
          totalSaleValue: saleValue.toFixed(2),
          totalClosingStock: closingTotal,
          finalClosingBalance: Math.round(closingTotal - breakage),
        };
      });
      setLocalSales(recalculated);
    }
  }, [sales]);

  // Reset page on date change
  useEffect(() => {
    setCurrentPage(1);
    setSearchTerm("");
    setUploadResult(null);
    setTouchedClosingIds(new Set());
    setPendingDeleteIds(new Set());
    setEditingRowId(null);
    setEditRowData({});
    setDeleteConfirmId(null);
  }, [selectedDate]);

  const handleInputChange = (
    id: number,
    field: keyof DailySale,
    value: string,
  ) => {
    if (isSubmitted && !isAdmin) return;

    const isClosingField = field === "closingBalanceCases" || field === "closingBalanceBottles";

    // Mark as touched when user explicitly types into a closing field
    if (isClosingField) {
      setTouchedClosingIds((prev) => new Set([...Array.from(prev), id]));
    }

    const numValue =
      field === "mrp" ? value : value === "" ? 0 : parseInt(value, 10);

    setLocalSales((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        const updatedItem = { ...item, [field]: numValue };

        const opBalBtls  = updatedItem.openingBalanceBottles || 0;
        const qtyPerCase = updatedItem.quantityPerCase || 0;
        const newStockCs = updatedItem.newStockCases || 0;
        const newStockBtls = updatedItem.newStockBottles || 0;
        const closingCs  = updatedItem.closingBalanceCases || 0;
        const closingBtls = updatedItem.closingBalanceBottles || 0;
        const mrp        = parseFloat(updatedItem.mrp as string) || 0;
        const breakage   = updatedItem.breakageBottles || 0;
        const totalStock = opBalBtls + (qtyPerCase * newStockCs) + newStockBtls;

        // "Touched" means the user has explicitly typed into a closing field for this item.
        // touchedClosingIds state is stale here but isClosingField covers the current call.
        const isTouched = isClosingField || touchedClosingIds.has(id);

        if (!isTouched) {
          // Non-closing field changed, item never touched → keep "no sales" mode
          return {
            ...updatedItem,
            soldBottles: 0,
            saleValue: "0.00",
            totalSaleValue: "0.00",
            totalClosingStock: totalStock,
            finalClosingBalance: Math.round(totalStock - breakage),
          };
        }

        // Item is touched: use actual closing values (0 = all sold, >0 = partial)
        const closingTotal = closingBtls + (closingCs * qtyPerCase);
        const soldBottles  = totalStock - closingTotal;
        const saleValue    = soldBottles * mrp;

        return {
          ...updatedItem,
          soldBottles,
          saleValue: saleValue.toFixed(2),
          totalSaleValue: saleValue.toFixed(2),
          totalClosingStock: closingTotal,
          finalClosingBalance: Math.round(closingTotal - breakage),
        };
      }),
    );
  };

  const handleSave = () => {
    if (isSubmitted && !isAdmin) return;
    const negativeItems = localSales.filter((item) => (item.soldBottles || 0) < 0);
    if (negativeItems.length > 0) {
      const names = negativeItems.map((item) => `${item.brandName} (${item.size})`).join(", ");
      toast({
        title: "Warning: Negative Sold Bottles",
        description: `The following items have negative sold bottles: ${names}. Please check closing balance values before saving.`,
        variant: "destructive",
        duration: 8000,
      });
      return;
    }

    // Untouched items → no sales: send 0s to server so DB stays clean
    const serverData = localSales.map((item) => {
      if (!touchedClosingIds.has(item.id)) {
        const totalStk =
          (item.openingBalanceBottles || 0) +
          (item.quantityPerCase || 0) * (item.newStockCases || 0) +
          (item.newStockBottles || 0);
        return {
          ...item,
          closingBalanceCases: 0,
          closingBalanceBottles: 0,
          soldBottles: 0,
          saleValue: "0.00",
          totalSaleValue: "0.00",
          totalClosingStock: totalStk,
          finalClosingBalance: Math.round(totalStk - (item.breakageBottles || 0)),
        };
      }
      return item;
    });

    // Only update touched rows in the UI — keep pre-filled defaults for untouched rows (no flash)
    setLocalSales(prev => prev.map(item => {
      if (!touchedClosingIds.has(item.id)) return item;
      return serverData.find(s => s.id === item.id) ?? item;
    }));

    const deleteIdsArray = Array.from(pendingDeleteIds);
    updateSales({ data: serverData, date: selectedDate, deleteIds: deleteIdsArray }, {
      onSuccess: () => {
        setPendingDeleteIds(new Set());
        toast({
          title: "Sales Saved",
          description: `Sales data for ${selectedDate} has been successfully saved${deleteIdsArray.length > 0 ? ` (${deleteIdsArray.length} row${deleteIdsArray.length > 1 ? "s" : ""} deleted)` : ""}.`,
          className: "bg-green-50 border-green-200 text-green-800",
        });
      },
      onError: (err) => {
        toast({
          title: "Error",
          description: err.message,
          variant: "destructive",
        });
      },
    });
  };

  const handleSubmit = () => {
    if (isSubmitted && !isAdmin) return;
    if (!localSales || localSales.length === 0) {
      toast({
        title: "No Data",
        description: "There is no sales data to submit for this date.",
        variant: "destructive",
      });
      return;
    }

    submitSales(selectedDate, {
      onSuccess: () => {
        toast({
          title: isSubmitted ? "Sales Re-Submitted" : "Sales Submitted",
          description: isSubmitted
            ? `Sales for ${selectedDate} have been re-submitted successfully.`
            : `Sales for ${selectedDate} have been finalized and locked.`,
          className: "bg-green-50 border-green-200 text-green-800",
        });
      },
      onError: (err) => {
        toast({
          title: "Submit Failed",
          description: err.message,
          variant: "destructive",
        });
      },
    });
  };

  // --- Edit row handlers ---
  const handleEditStart = (item: DailySale) => {
    setEditingRowId(item.id);
    setEditRowData({ ...item });
    setDeleteConfirmId(null);
  };

  const handleEditFieldChange = (field: keyof DailySale, value: string) => {
    setEditRowData((prev) => ({ ...prev, [field]: value === "" ? 0 : Number(value) }));
  };

  const handleEditConfirm = () => {
    if (editingRowId === null) return;
    const d = editRowData;
    const qtyPerCase = Number(d.quantityPerCase ?? 0);
    const opBal = Number(d.openingBalanceBottles ?? 0);
    const newCs = Number(d.newStockCases ?? 0);
    const newBtls = Number(d.newStockBottles ?? 0);
    const clsCs = Number(d.closingBalanceCases ?? 0);
    const clsBtls = Number(d.closingBalanceBottles ?? 0);
    const breakage = Number(d.breakageBottles ?? 0);
    const mrp = Number(d.mrp ?? 0);

    const totalStock = opBal + (qtyPerCase * newCs) + newBtls;
    const closingTotal = clsBtls + (clsCs * qtyPerCase);
    const soldBottles = totalStock - closingTotal;
    const saleValue = (soldBottles * mrp).toFixed(2);
    const totalClosingStock = closingTotal;
    const finalClosingBalance = Math.round(totalClosingStock - breakage);

    setLocalSales((prev) =>
      prev.map((row) =>
        row.id === editingRowId
          ? {
              ...row,
              openingBalanceBottles: opBal,
              newStockCases: newCs,
              newStockBottles: newBtls,
              closingBalanceCases: clsCs,
              closingBalanceBottles: clsBtls,
              breakageBottles: breakage,
              soldBottles,
              saleValue,
              totalClosingStock,
              finalClosingBalance,
            }
          : row,
      ),
    );
    // Mark as touched so Save Sales uses the edited values
    setTouchedClosingIds((prev) => new Set(prev).add(editingRowId));
    setEditingRowId(null);
    setEditRowData({});
  };

  const handleEditCancel = () => {
    setEditingRowId(null);
    setEditRowData({});
  };

  // --- Delete row handlers ---
  // Deletion is deferred to Save Sales — we just hide the row locally and track IDs
  const handleDeleteConfirm = (id: number) => {
    setPendingDeleteIds((prev) => new Set(prev).add(id));
    setLocalSales((prev) => prev.filter((row) => row.id !== id));
    setTouchedClosingIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    setDeleteConfirmId(null);
    toast({
      title: "Row Removed",
      description: "Row marked for deletion. Click 'Save Sales' to apply all changes to the database.",
      className: "bg-amber-50 border-amber-200 text-amber-800",
      duration: 5000,
    });
  };

  const handleSalesSortToggle = (field: 'brandNumber' | 'mrp' | 'soldBottles') => {
    if (salesSortField === field) {
      setSalesSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSalesSortField(field);
      setSalesSortDir('asc');
    }
    setCurrentPage(1);
  };

  const filteredSales = useMemo(() => {
    let rows = localSales.filter(
      (item) =>
        item.brandName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.brandNumber.toLowerCase().includes(searchTerm.toLowerCase()),
    );
    if (salesSortField) {
      rows = [...rows].sort((a, b) => {
        let av: number | string = 0, bv: number | string = 0;
        if (salesSortField === 'brandNumber') { av = a.brandNumber; bv = b.brandNumber; }
        else if (salesSortField === 'mrp') { av = parseFloat(a.mrp as string) || 0; bv = parseFloat(b.mrp as string) || 0; }
        else if (salesSortField === 'soldBottles') { av = a.soldBottles ?? 0; bv = b.soldBottles ?? 0; }
        if (av < bv) return salesSortDir === 'asc' ? -1 : 1;
        if (av > bv) return salesSortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return rows;
  }, [localSales, searchTerm, salesSortField, salesSortDir]);

  const totalPages = Math.ceil(filteredSales.length / pageSize);
  const paginatedSales = filteredSales.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const formatCurrency = (val: number) => {
    return `₹${val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const shopName = shopDetails?.[0]?.name || "Shop Name";

  const cats = summary?.categories || {};
  const imlCount = (field: keyof typeof cats[string]) =>
    (cats["IML"]?.[field] || 0) + (cats["IMFL"]?.[field] || 0);
  const beerCount = (field: keyof typeof cats[string]) =>
    cats["Beer"]?.[field] || 0;

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* Shop Name & Date Picker */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3" data-testid="text-shop-name">
          <Store className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold text-foreground">{shopName}</h2>
        </div>
        <div className="flex items-center gap-1">
          {/* Previous Day Button */}
          <button
            data-testid="button-prev-date"
            onClick={() => {
              const d = parseDateLocal(selectedDate);
              d.setDate(d.getDate() - 1);
              const prev = formatDateLocal(d);
              if (prev >= earliestOrderDateStr) setSelectedDate(prev);
            }}
            disabled={selectedDate <= earliestOrderDateStr}
            className="p-2 rounded-lg border border-border bg-card hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Previous day"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <button
                data-testid="input-date-picker"
                className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 shadow-sm cursor-pointer hover:bg-accent transition-colors"
              >
                <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Select Date:</span>
                <span className="text-sm font-semibold text-foreground">
                  {format(parse(selectedDate, "yyyy-MM-dd", new Date()), "MM/dd/yyyy")}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={parse(selectedDate, "yyyy-MM-dd", new Date())}
                onSelect={(date) => {
                  if (date) {
                    const y = date.getFullYear();
                    const m = String(date.getMonth() + 1).padStart(2, "0");
                    const d = String(date.getDate()).padStart(2, "0");
                    setSelectedDate(`${y}-${m}-${d}`);
                    setDatePickerOpen(false);
                  }
                }}
                fromDate={earliestOrderDate}
                toDate={new Date()}
                disabled={(date) => {
                  const floor = new Date(earliestOrderDate);
                  floor.setHours(0, 0, 0, 0);
                  if (date < floor) return true;
                  const today = new Date();
                  today.setHours(23, 59, 59, 999);
                  if (date > today) return true;
                  if (isAdmin) return false;
                  const sevenDaysAgo = subDays(new Date(), 6);
                  sevenDaysAgo.setHours(0, 0, 0, 0);
                  return date < sevenDaysAgo;
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {/* Next Day Button */}
          <button
            data-testid="button-next-date"
            onClick={() => {
              const d = parseDateLocal(selectedDate);
              d.setDate(d.getDate() + 1);
              const next = formatDateLocal(d);
              const today = getTodayLocal();
              if (next <= today) setSelectedDate(next);
            }}
            disabled={selectedDate >= format(new Date(), "yyyy-MM-dd")}
            className="p-2 rounded-lg border border-border bg-card hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Next day"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {isSubmitted && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm font-medium dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-400" data-testid="status-submitted">
              <Lock className="w-4 h-4" />
              Submitted & Locked
            </div>
          )}
        </div>
      </div>

      {/* Value Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card rounded-xl p-4 border border-border shadow-sm" data-testid="card-opening-balance-value">
          <p className="text-xs font-medium text-muted-foreground mb-1">Opening Balance Value</p>
          <p className="text-lg font-bold text-foreground">{formatCurrency(summary?.openingBalanceValue || 0)}</p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border shadow-sm" data-testid="card-new-stock-value">
          <p className="text-xs font-medium text-muted-foreground mb-1">New Stock Value</p>
          <p className="text-lg font-bold text-foreground">{formatCurrency(summary?.newStockValue || 0)}</p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border shadow-sm" data-testid="card-sold-stock-value">
          <p className="text-xs font-medium text-muted-foreground mb-1">Sold Stock Value</p>
          <div className="flex items-center gap-3">
            <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded dark:bg-blue-900/30 dark:text-blue-300">IML</span>
            <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded dark:bg-amber-900/30 dark:text-amber-300">Beer</span>
          </div>
          <p className="text-lg font-bold text-foreground mt-1">{formatCurrency(summary?.soldStockValue || 0)}</p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border shadow-sm" data-testid="card-closing-balance-value">
          <p className="text-xs font-medium text-muted-foreground mb-1">Closing Balance Value</p>
          <p className="text-lg font-bold text-foreground">{formatCurrency(summary?.closingBalanceValue || 0)}</p>
        </div>
      </div>

      {/* Stock Count Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card rounded-xl p-4 border border-border shadow-sm" data-testid="card-opening-stock">
          <p className="text-xs font-medium text-muted-foreground mb-2">opening Stock in bottles</p>
          <div className="space-y-1 text-sm font-semibold text-foreground">
            <p>IML - {imlCount("opening").toLocaleString()}</p>
            <p>Beer - {beerCount("opening").toLocaleString()}</p>
          </div>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border shadow-sm" data-testid="card-new-stock">
          <p className="text-xs font-medium text-muted-foreground mb-2">New Stock in bottles</p>
          <div className="space-y-1 text-sm font-semibold text-foreground">
            <p>IML - {imlCount("newStock")}</p>
            <p>Beer - {beerCount("newStock")}</p>
          </div>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border shadow-sm" data-testid="card-sold-stock">
          <p className="text-xs font-medium text-muted-foreground mb-2">Sold Stock in bottles</p>
          <div className="space-y-1 text-sm font-semibold text-foreground">
            <p>IML - {imlCount("sold").toLocaleString()}</p>
            <p>Beer - {beerCount("sold").toLocaleString()}</p>
          </div>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border shadow-sm" data-testid="card-closing-stock">
          <p className="text-xs font-medium text-muted-foreground mb-2">Closing Stock in bottles</p>
          <div className="space-y-1 text-sm font-semibold text-foreground">
            <p>IML - {imlCount("closing")}</p>
            <p>Beer - {beerCount("closing")}</p>
          </div>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col">

        {/* Bulk Update Bar */}
        <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bulk Sales Update via Excel</span>
          <button
            onClick={handleDownloadTemplate}
            disabled={!localSales || localSales.length === 0}
            data-testid="button-download-template"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-card border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-green-600" />
            Download Template
          </button>
          <button
            onClick={() => { setUploadResult(null); excelFileInputRef.current?.click(); }}
            disabled={!localSales || localSales.length === 0 || (isSubmitted && !isAdmin)}
            data-testid="button-upload-excel"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-card border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="w-3.5 h-3.5 text-blue-600" />
            Upload Excel
          </button>
          <input
            ref={excelFileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleUploadExcel}
            data-testid="input-upload-excel"
          />
          {uploadResult && (
            <span className="text-xs font-medium text-muted-foreground bg-card border border-border rounded-lg px-3 py-1.5 flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              <span className="text-green-700 font-semibold">{uploadResult.updated} updated</span>
              {uploadResult.skipped > 0 && <span>· {uploadResult.skipped} skipped</span>}
              {uploadResult.notFound > 0 && <span className="text-amber-600">· {uploadResult.notFound} not matched</span>}
              <span className="text-muted-foreground/60">— review & click Save Sales</span>
            </span>
          )}
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 justify-between items-center bg-card">
          <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                placeholder="Search by brand name or code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search-sales"
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-input bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap justify-end">
            <div className="flex items-center gap-2">
              <Popover open={exportDatePickerOpen} onOpenChange={setExportDatePickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    data-testid="input-export-date-picker"
                    className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-2 shadow-sm cursor-pointer hover:bg-accent transition-colors"
                  >
                    <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">
                      {format(parse(exportDate, "yyyy-MM-dd", new Date()), "MM/dd/yyyy")}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={parse(exportDate, "yyyy-MM-dd", new Date())}
                    onSelect={(date) => {
                      if (date) {
                        const y = date.getFullYear();
                        const m = String(date.getMonth() + 1).padStart(2, "0");
                        const d = String(date.getDate()).padStart(2, "0");
                        setExportDate(`${y}-${m}-${d}`);
                        setExportDatePickerOpen(false);
                      }
                    }}
                    disabled={(date) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      return date > today;
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <button
                onClick={handleExportCSV}
                disabled={isExporting}
                data-testid="button-export-csv"
                className="flex items-center gap-2 px-6 py-2 bg-secondary text-secondary-foreground rounded-xl font-medium border border-border hover:bg-secondary/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Export CSV
              </button>
            </div>

            {isSubmitted && !isAdmin ? (
              <div className="flex items-center gap-2 px-6 py-2 bg-emerald-100 text-emerald-700 rounded-xl font-medium border border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-400" data-testid="status-locked-buttons">
                <Lock className="w-4 h-4" />
                Locked
              </div>
            ) : !isDateAllowedForAction ? (
              <div className="flex items-center gap-2 px-6 py-2 bg-amber-50 text-amber-700 rounded-xl font-medium border border-amber-200 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-400" data-testid="status-date-restricted">
                <Lock className="w-4 h-4" />
                Date outside allowed range
              </div>
            ) : (
              <>
                {isAdmin && isSubmitted && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-xs font-medium dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-400" data-testid="status-already-submitted-info">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Sales already submitted
                  </div>
                )}
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  data-testid="button-save-sales"
                  className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-xl font-medium shadow-lg shadow-primary/25 hover:bg-primary/90 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save Sales
                </button>

                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || localSales.length === 0}
                  data-testid="button-submit-sales"
                  className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-xl font-medium shadow-lg hover:bg-emerald-700 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Submit Sales
                </button>
              </>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto max-h-[calc(100vh-240px)] table-typography rounded-b-lg border border-border">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-secondary shadow-sm">
              <tr className="bg-secondary border-b-2 border-border">
                <th className="table-header w-8 border-r border-border sticky left-0 z-20 bg-secondary">SNo</th>
                <th className="table-header w-14 border-r border-border sticky left-8 z-20 bg-secondary">
                  <button onClick={() => handleSalesSortToggle('brandNumber')} className="flex items-center gap-1 hover:text-foreground w-full">
                    Brand No {salesSortField === 'brandNumber' ? (salesSortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                  </button>
                </th>
                <th className="table-header w-24 border-r border-border sticky left-[88px] z-20 bg-secondary">Brand Name</th>
                <th className="table-header w-12 border-r border-border sticky left-[184px] z-20 bg-secondary shadow-[2px_0_6px_rgba(0,0,0,0.08)]">Size</th>
                <th className="table-header w-10 border-r border-border">Qty/Cs</th>
                <th className="table-header w-14 border-r border-border">Op. Bal (Btls)</th>
                <th className="table-header w-16 text-right bg-green-50/50 border-r border-border">New Stk (Cs)</th>
                <th className="table-header w-16 text-right bg-green-50/50 border-r border-border">New Stk (Btls)</th>
                <th className="table-header w-14 text-right border-r border-border">Total Stk</th>
                <th className="table-header w-20 text-center bg-orange-50/80 border-l border-orange-100 font-bold text-orange-900 border-r border-border">
                  Cls Bal (Cs)
                </th>
                <th className="table-header w-20 text-center bg-orange-50/80 font-bold text-orange-900 border-r border-border">
                  Cls Bal (Btls)
                </th>
                <th className="table-header w-14 text-center border-r border-border">
                  <button onClick={() => handleSalesSortToggle('soldBottles')} className="flex items-center gap-1 hover:text-foreground mx-auto">
                    Sold Btls {salesSortField === 'soldBottles' ? (salesSortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                  </button>
                </th>
                <th className="table-header w-14 text-center border-r border-border">
                  <button onClick={() => handleSalesSortToggle('mrp')} className="flex items-center gap-1 hover:text-foreground mx-auto">
                    MRP {salesSortField === 'mrp' ? (salesSortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                  </button>
                </th>
                <th className="table-header w-20 text-right font-bold text-primary border-r border-border">Sale Value</th>
                <th className="table-header w-16 text-center border-r border-border">Tot Cls Stk</th>
                <th className="table-header w-14 text-center border-r border-border">Breakage</th>
                <th className="table-header w-20 text-center border-r border-border">Final Cls Stk Bal</th>
              </tr>
            </thead>
            <tbody>
              {paginatedSales.length === 0 ? (
                <tr>
                  <td
                    colSpan={17}
                    className="py-12 text-center text-muted-foreground"
                  >
                    {searchTerm ? `No sales records found matching "${searchTerm}"` : `No sales data for ${selectedDate}`}
                  </td>
                </tr>
              ) : (
                paginatedSales.map((item, idx) => {
                  const globalIdx = (currentPage - 1) * pageSize + idx;
                  const opBal = item.openingBalanceBottles || 0;
                  const newCs = item.newStockCases || 0;
                  const newBtls = item.newStockBottles || 0;
                  const qtyPerCase = item.quantityPerCase || 0;
                  const editMrp = Number(item.mrp || 0);
                  const totalStock = opBal + (qtyPerCase * newCs) + newBtls;
                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors group ${idx % 2 === 1 ? "bg-muted/10" : "bg-white"} hover:bg-primary/5 ${isSubmitted ? "opacity-90" : ""}`}
                    >
                      <td className={`table-cell font-mono text-xs text-muted-foreground border-r border-border sticky left-0 z-10 ${idx % 2 === 1 ? "bg-gray-50" : "bg-white"}`}>
                        {globalIdx + 1}
                      </td>
                      <td className={`table-cell font-mono text-xs text-muted-foreground border-r border-border sticky left-8 z-10 ${idx % 2 === 1 ? "bg-gray-50" : "bg-white"}`}>
                        {item.brandNumber}
                      </td>
                      <td className={`table-cell font-medium border-r border-border sticky left-[88px] z-10 ${idx % 2 === 1 ? "bg-gray-50" : "bg-white"}`}>{item.brandName}</td>
                      <td className={`table-cell text-muted-foreground border-r border-border sticky left-[184px] z-10 shadow-[2px_0_6px_rgba(0,0,0,0.06)] ${idx % 2 === 1 ? "bg-gray-50" : "bg-white"}`}>
                        {item.size}
                      </td>
                      <td className="table-cell text-muted-foreground border-r border-border">
                        {item.quantityPerCase}
                      </td>
                      {/* Op Bal */}
                      <td className="table-cell p-1 bg-blue-50/10 group-hover:bg-blue-50/30 border-r border-border">
                        <span className="block text-right font-mono text-muted-foreground">{item.openingBalanceBottles}</span>
                      </td>
                      {/* New Stk Cs */}
                      <td className="table-cell p-1 bg-green-50/10 group-hover:bg-green-50/30 border-r border-border">
                        <span className="block text-right font-mono text-muted-foreground">{item.newStockCases}</span>
                      </td>
                      {/* New Stk Btls */}
                      <td className="table-cell p-1 bg-green-50/10 group-hover:bg-green-50/30 border-r border-border">
                        <span className="block text-right font-mono text-muted-foreground">{item.newStockBottles}</span>
                      </td>
                      <td className="table-cell text-right font-mono text-muted-foreground border-r border-border">
                        {totalStock}
                      </td>
                      {/* Cls Bal Cs */}
                      <td className="table-cell p-1 bg-orange-50/30 border-r border-border">
                        {isSubmitted && !isAdmin ? (
                          <span className="block w-full text-center font-bold text-foreground py-1">{item.closingBalanceCases || 0}</span>
                        ) : (
                          <input
                            type="number" min="0"
                            value={item.closingBalanceCases ?? 0}
                            onChange={(e) => handleInputChange(item.id, "closingBalanceCases", e.target.value)}
                            data-testid={`input-closing-cases-${item.id}`}
                            className="w-full text-center p-1 rounded-md border border-orange-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-bold text-foreground bg-white shadow-sm"
                          />
                        )}
                      </td>
                      {/* Cls Bal Btls */}
                      <td className="table-cell p-1 bg-orange-50/30 border-r border-border">
                        {isSubmitted && !isAdmin ? (
                          <span className="block w-full text-center font-bold text-foreground py-1">{item.closingBalanceBottles || 0}</span>
                        ) : (
                          <input
                            type="number" min="0"
                            value={item.closingBalanceBottles ?? 0}
                            onChange={(e) => handleInputChange(item.id, "closingBalanceBottles", e.target.value)}
                            data-testid={`input-closing-bottles-${item.id}`}
                            className="w-full text-center p-1 rounded-md border border-orange-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-bold text-foreground bg-white shadow-sm"
                          />
                        )}
                      </td>
                      <td className={`table-cell text-center font-mono border-r border-border ${(item.soldBottles || 0) < 0 ? 'bg-red-100 text-red-700 font-bold dark:bg-red-900/30 dark:text-red-400' : ''}`}>
                        {item.soldBottles}
                        {(item.soldBottles || 0) < 0 && <span className="block text-[9px] text-red-500">⚠ negative</span>}
                      </td>
                      <td className="table-cell text-center font-mono bg-blue-50/10 group-hover:bg-blue-50/30 border-r border-border">
                        {editMrp}
                      </td>
                      <td className={`table-cell text-right font-bold font-mono border-r border-border ${parseFloat(String(item.saleValue)) < 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' : 'text-primary'}`}>
                        {parseFloat(String(item.saleValue)) < 0 && <span className="mr-1">⚠</span>}
                        ₹{item.saleValue}
                      </td>
                      <td className="table-cell text-center font-mono border-r border-border">
                        {item.totalClosingStock}
                      </td>
                      {/* Breakage */}
                      <td className="table-cell p-1 border-r border-border">
                        {isSubmitted && !isAdmin ? (
                          <span className="block w-full text-center py-1">{item.breakageBottles || 0}</span>
                        ) : (
                          <input
                            type="number" min="0"
                            value={item.breakageBottles || 0}
                            onChange={(e) => handleInputChange(item.id, "breakageBottles", e.target.value)}
                            data-testid={`input-breakage-${item.id}`}
                            className="w-full text-center p-1 rounded-md border border-input focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                          />
                        )}
                      </td>
                      <td className="table-cell text-center font-mono border-r border-border">
                        {Math.round(Number(item.finalClosingBalance) || 0)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <PaginationCustom
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setCurrentPage(1);
          }}
          totalItems={filteredSales.length}
        />

        <div className="p-4 border-t border-border bg-secondary/20 flex justify-end gap-3">
          {isSubmitted && (
            <div className="flex items-center gap-2 px-8 py-3 bg-emerald-100 text-emerald-700 rounded-xl font-bold border border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-400" data-testid="status-locked-footer">
              <CheckCircle className="w-5 h-5" />
              Sales Submitted & Locked
            </div>
          )}
          {!isSubmitted && !isDateAllowedForAction && (
            <div className="flex items-center gap-2 px-8 py-3 bg-amber-50 text-amber-700 rounded-xl font-bold border border-amber-200 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-400" data-testid="status-date-restricted-footer">
              <Lock className="w-5 h-5" />
              Date outside allowed range
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
