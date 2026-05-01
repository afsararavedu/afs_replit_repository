import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { type StockDetail, type InsertStockDetail, type DailyStock } from "@shared/schema";
import { StatCard } from "@/components/StatCard";
import {
  Package,
  Boxes,
  TrendingUp,
  AlertTriangle,
  Search,
  Save,
  Loader2,
  Calendar as CalendarIcon,
  History,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PaginationCustom } from "@/components/ui/pagination-custom";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, parse, subDays } from "date-fns";

function getTodayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function Stock() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [localStock, setLocalStock] = useState<StockDetail[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Date picker state
  const [stockViewDate, setStockViewDate] = useState<string>(getTodayLocal());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const isToday = stockViewDate === getTodayLocal();

  // Earliest invoice date from orders — used as calendar floor (oldest selectable date)
  const { data: earliestOrderDateData } = useQuery<{ invoiceDate: string | null }>({
    queryKey: ["/api/orders/earliest-invoice-date"],
  });
  const earliestOrderDate = earliestOrderDateData?.invoiceDate
    ? parse(earliestOrderDateData.invoiceDate, "yyyy-MM-dd", new Date())
    : new Date("2020-01-01");

  // All dates that have a saved stock snapshot — used to grey-out empty dates in the calendar
  const { data: availableStockDatesData } = useQuery<{ dates: string[] }>({
    queryKey: ["/api/daily-stock/available-dates"],
  });
  const availableStockDateSet = useMemo(
    () => new Set(availableStockDatesData?.dates ?? []),
    [availableStockDatesData],
  );

  // On first load: if today has no snapshot, jump to the most recent one
  const hasAutoSelectedStock = useRef(false);
  useEffect(() => {
    if (!availableStockDatesData || hasAutoSelectedStock.current) return;
    hasAutoSelectedStock.current = true;
    const today = getTodayLocal();
    const dates = availableStockDatesData.dates;
    if (dates.length > 0 && !dates.includes(today)) {
      setStockViewDate(dates[dates.length - 1]);
    }
  }, [availableStockDatesData]);

  // Current stock (editable, always today's live data)
  const { data: stock, isLoading } = useQuery<StockDetail[]>({
    queryKey: [api.stock.list.path],
    queryFn: async () => {
      const res = await fetch(api.stock.list.path);
      if (!res.ok) throw new Error("Failed to fetch stock data");
      return await res.json();
    },
    enabled: isToday,
  });

  // Historical stock (read-only, from daily_stock snapshot)
  const { data: historicalStock, isLoading: isLoadingHistorical } = useQuery<DailyStock[]>({
    queryKey: ["/api/daily-stock", stockViewDate],
    queryFn: async () => {
      const res = await fetch(`/api/daily-stock?date=${stockViewDate}`);
      if (!res.ok) throw new Error("Failed to fetch historical stock");
      return await res.json();
    },
    enabled: !isToday,
    staleTime: 0,        // Always fetch fresh — never serve a cached past result
    gcTime: 0,           // Don't keep old results in memory across date switches
  });


  useEffect(() => {
    if (stock && isToday) setLocalStock(stock);
  }, [stock, isToday]);

  const handleInputChange = (id: number, field: keyof StockDetail, value: string) => {
    setLocalStock((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value === "" ? 0 : value };
          if (["stockInCases", "stockInBottles", "quantityPerCase", "mrp", "breakage"].includes(field)) {
            const cases = Number(updatedItem.stockInCases) || 0;
            const bottles = Number(updatedItem.stockInBottles) || 0;
            const qtyPerCase = Number(updatedItem.quantityPerCase) || 0;
            const mrp = parseFloat(updatedItem.mrp as string) || 0;
            const totalBottles = (cases * qtyPerCase) + bottles;
            const totalValue = totalBottles * mrp;
            return { ...updatedItem, totalStockBottles: totalBottles, totalStockValue: totalValue.toFixed(2) };
          }
          return updatedItem;
        }
        return item;
      })
    );
  };

  // Use either current or historical stock for display
  const displayStock: (StockDetail | DailyStock)[] = isToday ? localStock : (historicalStock || []);

  const filteredStock = displayStock.filter(
    (item) =>
      item.brandName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.brandNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredStock.length / pageSize);
  const paginatedStock = filteredStock.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const totalValue = displayStock.reduce((acc, curr) => acc + parseFloat(curr.totalStockValue || "0"), 0);
  const totalBottles = displayStock.reduce((acc, curr) => acc + (curr.totalStockBottles || 0), 0);
  const totalBreakage = displayStock.reduce((acc, curr) => acc + (curr.breakage || 0), 0);

  const isLoadingAny = (isToday && isLoading) || (!isToday && isLoadingHistorical);

  if (isLoadingAny) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Stock Value" value={`₹${totalValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={TrendingUp} trend="+3.2%" trendUp={true} />
        <StatCard title="Total Bottles" value={totalBottles.toLocaleString()} icon={Package} />
        <StatCard title="Total Cases" value={Math.floor(totalBottles / 12).toLocaleString()} icon={Boxes} />
        <StatCard title="Total Breakage" value={totalBreakage.toString()} icon={AlertTriangle} />
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 justify-between items-center bg-card">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Date Picker */}
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <button
                  data-testid="button-stock-date-picker"
                  className="flex items-center gap-2 px-3 py-2 border border-input rounded-xl bg-background hover:bg-muted transition-all text-sm font-medium"
                >
                  <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                  {isToday ? "Today (Current Stock)" : format(parse(stockViewDate, "yyyy-MM-dd", new Date()), "dd-MMM-yyyy")}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={parse(stockViewDate, "yyyy-MM-dd", new Date())}
                  defaultMonth={parse(stockViewDate, "yyyy-MM-dd", new Date())}
                  onSelect={(date) => {
                    if (date) {
                      const y = date.getFullYear();
                      const m = String(date.getMonth() + 1).padStart(2, "0");
                      const d = String(date.getDate()).padStart(2, "0");
                      setStockViewDate(`${y}-${m}-${d}`);
                      setDatePickerOpen(false);
                      setCurrentPage(1);
                    }
                  }}
                  fromDate={earliestOrderDate}
                  toDate={new Date()}
                  disabled={(date) => {
                    const dateStr = format(date, "yyyy-MM-dd");
                    const todayStr = getTodayLocal();
                    // Always allow today (current stock view)
                    if (dateStr === todayStr) return false;
                    // Block future dates
                    if (dateStr > todayStr) return true;
                    // Only enable past dates that have a saved stock snapshot
                    if (availableStockDateSet.size > 0) {
                      return !availableStockDateSet.has(dateStr);
                    }
                    return false;
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {!isToday && (
              <button
                onClick={() => { setStockViewDate(getTodayLocal()); setCurrentPage(1); }}
                className="text-xs px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-all font-medium"
              >
                Back to Current
              </button>
            )}

            {!isToday && (
              <span className="flex items-center gap-1 text-xs px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg border border-amber-200 font-medium">
                <History className="w-3.5 h-3.5" />
                Historical View — Read Only
              </span>
            )}

            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                placeholder="Search brand..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                data-testid="input-search-stock"
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-input bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
              />
            </div>
          </div>

        </div>

        <div className="overflow-x-auto table-typography">
          <table className="w-full">
            <thead>
              <tr className="bg-secondary/30">
                <th className="table-header w-8">SNo</th>
                <th className="table-header w-14">Brand No</th>
                <th className="table-header w-24">Brand Name</th>
                <th className="table-header w-12">Size</th>
                <th className="table-header w-10">Qty/Cs</th>
                <th className="table-header w-16 bg-blue-50/50">Stk (Cs)</th>
                <th className="table-header w-16 bg-blue-50/50">Stk (Btls)</th>
                <th className="table-header w-16">Tot Stk (Btls)</th>
                <th className="table-header w-14">MRP</th>
                <th className="table-header w-20 font-bold text-primary bg-primary/5">Stk Value</th>
                <th className="table-header w-14">Breakage</th>
                <th className="table-header w-28">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {paginatedStock.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-muted-foreground">
                    {isToday
                      ? "No stock data available. Sync from orders to populate."
                      : `No stock snapshot found for ${format(parse(stockViewDate, "yyyy-MM-dd", new Date()), "dd-MMM-yyyy")}. Save sales for that date to create a snapshot.`}
                  </td>
                </tr>
              ) : paginatedStock.map((item, idx) => {
                const globalIdx = (currentPage - 1) * pageSize + idx;
                return (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="table-cell text-center font-mono text-xs text-muted-foreground">{globalIdx + 1}</td>
                    <td className="table-cell font-mono text-xs text-muted-foreground">{item.brandNumber}</td>
                    <td className="table-cell font-medium">{item.brandName}</td>
                    <td className="table-cell text-muted-foreground">{item.size}</td>
                    <td className="table-cell text-center">{item.quantityPerCase}</td>
                    <td className="table-cell text-right font-mono bg-blue-50/10 group-hover:bg-blue-50/30">{item.stockInCases || 0}</td>
                    <td className="table-cell text-right font-mono bg-blue-50/10 group-hover:bg-blue-50/30">{item.stockInBottles || 0}</td>
                    <td className="table-cell text-right font-mono">{item.totalStockBottles}</td>
                    <td className="table-cell text-right font-mono">₹{item.mrp}</td>
                    <td className="table-cell text-right font-bold text-primary font-mono bg-primary/5">₹{item.totalStockValue}</td>
                    {isToday ? (
                      <>
                        <td className="p-1 border-b border-border">
                          <input
                            type="number"
                            value={(item as StockDetail).breakage || 0}
                            onChange={(e) => handleInputChange((item as StockDetail).id, "breakage", e.target.value)}
                            className="w-full text-right p-1 rounded-md border border-input focus:ring-2 focus:ring-primary/20 outline-none font-mono"
                          />
                        </td>
                        <td className="p-1 border-b border-border">
                          <input
                            type="text"
                            value={(item as StockDetail).remarks || ""}
                            onChange={(e) => handleInputChange((item as StockDetail).id, "remarks", e.target.value)}
                            className="w-full p-1 rounded-md border border-input focus:ring-2 focus:ring-primary/20 outline-none text-sm"
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="table-cell text-right font-mono text-muted-foreground">{item.breakage || 0}</td>
                        <td className="table-cell text-muted-foreground text-sm">{item.remarks || "—"}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/50 font-bold">
                <td colSpan={5} className="table-cell text-right">Total</td>
                <td className="table-cell text-right">{displayStock.reduce((acc, curr) => acc + (curr.stockInCases || 0), 0)}</td>
                <td className="table-cell text-right">{displayStock.reduce((acc, curr) => acc + (curr.stockInBottles || 0), 0)}</td>
                <td className="table-cell text-right">{totalBottles}</td>
                <td className="table-cell"></td>
                <td className="table-cell text-right text-primary">₹{totalValue.toFixed(2)}</td>
                <td className="table-cell text-right">{totalBreakage}</td>
                <td className="table-cell"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <PaginationCustom
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
          totalItems={filteredStock.length}
        />
      </div>
    </div>
  );
}
