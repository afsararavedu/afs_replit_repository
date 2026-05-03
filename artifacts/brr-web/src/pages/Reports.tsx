import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, TrendingDown, ShoppingCart, Package, Calendar,
  BarChart2, Award, Loader2, AlertCircle, CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SalesKpi {
  total_revenue: string | null;
  total_bottles_sold: number | null;
  total_days: number | null;
  latest_date: string | null;
  best_day_revenue: string | null;
  best_day_date: string | null;
}

interface TrendRow {
  date: string;
  total_bottles_sold: number;
  total_revenue: string;
  brands_count: number;
  is_submitted: boolean;
}

interface BrandRow {
  brand_number: string;
  brand_name: string;
  size: string;
  sold?: number;
  bottles?: number;
  value: string;
}

interface SalesReport {
  kpi: SalesKpi;
  trend: TrendRow[];
  topBrandsByBottles: BrandRow[];
  topBrandsByValue: BrandRow[];
}

interface StockKpi {
  latest_total_value: string | null;
  latest_total_bottles: number | null;
  total_dates: number | null;
  latest_date: string | null;
  earliest_date: string | null;
}

interface StockTrendRow {
  date: string;
  total_bottles: number;
  total_value: string;
}

interface StockBrandRow {
  brand_number: string;
  brand_name: string;
  size: string;
  bottles: number;
  value: string;
}

interface StockReport {
  kpi: StockKpi;
  trend: StockTrendRow[];
  topBrandsByValue: StockBrandRow[];
  topBrandsByBottles: StockBrandRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number | string | null | undefined) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try {
    // Parse as local midnight — parseISO/new Date("YYYY-MM-DD") use UTC which
    // shifts the displayed date by -1 day for users behind UTC (e.g. US timezones).
    const [y, mo, da] = d.substring(0, 10).split("-").map(Number);
    return format(new Date(y, mo - 1, da), "dd-MM-yyyy");
  } catch { return d; }
};

const BRAND_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#10b981",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#6366f1", "#84cc16",
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  title, value, sub, icon: Icon, color = "primary",
}: {
  title: string; value: string; sub?: string;
  icon: React.ElementType; color?: string;
}) {
  const colorMap: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    green:   "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400",
    blue:    "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
    amber:   "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400",
    purple:  "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
  };
  return (
    <Card className="border border-border shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">{title}</p>
            <p className="text-2xl font-bold text-foreground mt-1 truncate">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1 truncate">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-xl shrink-0 ${colorMap[color] || colorMap.primary}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
      <AlertCircle className="w-10 h-10 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-1">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function RevenueTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-xl p-3 shadow-lg text-xs">
      <p className="font-semibold mb-2 text-foreground">{fmtDate(label)}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.name.includes("Revenue") || p.name.includes("Value")
            ? fmt(p.value) : Number(p.value).toLocaleString("en-IN")}
        </p>
      ))}
    </div>
  );
}

function BrandTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-popover border border-border rounded-xl p-3 shadow-lg text-xs max-w-[220px]">
      <p className="font-semibold text-foreground truncate">{d.payload.brand_name}</p>
      <p className="text-muted-foreground">{d.payload.size}</p>
      <p style={{ color: d.color }} className="mt-1">
        {d.name}: {d.name.includes("Value") ? fmt(d.value) : Number(d.value).toLocaleString("en-IN")}
      </p>
    </div>
  );
}

// ─── Sales Tab ────────────────────────────────────────────────────────────────

function SalesReportsTab() {
  const { data, isLoading, isError } = useQuery<SalesReport>({
    queryKey: ["/api/reports/sales"],
    queryFn: async () => {
      const res = await fetch("/api/reports/sales");
      if (!res.ok) throw new Error("Failed to load sales report");
      return res.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data) {
    return <EmptyState message="Could not load sales report. Please try again." />;
  }

  const { kpi, trend, topBrandsByBottles, topBrandsByValue } = data;
  const totalRevenue = Number(kpi.total_revenue || 0);
  const avgDaily = kpi.total_days ? totalRevenue / kpi.total_days : 0;

  const trendChartData = trend.map(r => ({
    date: r.date,
    "Daily Revenue": Number(r.total_revenue),
    "Bottles Sold": r.total_bottles_sold,
  }));

  const bottlesChartData = topBrandsByBottles.map(r => ({
    ...r,
    label: `${r.brand_name} (${r.size})`,
    sold: r.sold ?? 0,
    value: Number(r.value),
  }));

  const valueChartData = topBrandsByValue.map(r => ({
    ...r,
    label: `${r.brand_name} (${r.size})`,
    sold: r.sold ?? 0,
    value: Number(r.value),
  }));

  const hasData = trend.length > 0;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Revenue"
          value={fmt(totalRevenue)}
          sub={`Across ${kpi.total_days ?? 0} day(s)`}
          icon={TrendingUp}
          color="primary"
        />
        <KpiCard
          title="Total Bottles Sold"
          value={(kpi.total_bottles_sold ?? 0).toLocaleString("en-IN")}
          sub={`Latest: ${fmtDate(kpi.latest_date)}`}
          icon={ShoppingCart}
          color="blue"
        />
        <KpiCard
          title="Avg Daily Revenue"
          value={fmt(avgDaily)}
          sub="Per sales day"
          icon={BarChart2}
          color="green"
        />
        <KpiCard
          title="Best Day"
          value={fmt(kpi.best_day_revenue)}
          sub={fmtDate(kpi.best_day_date)}
          icon={Award}
          color="amber"
        />
      </div>

      {/* Revenue Trend */}
      <Card className="border border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Daily Revenue Trend</CardTitle>
          <CardDescription>Revenue and bottles sold per day across all saved dates</CardDescription>
        </CardHeader>
        <CardContent>
          {!hasData ? (
            <EmptyState message="No sales data recorded yet." />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="date"
                  axisLine={false} tickLine={false}
                  tickFormatter={fmtDate}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  yAxisId="revenue"
                  axisLine={false} tickLine={false}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  yAxisId="bottles"
                  orientation="right"
                  axisLine={false} tickLine={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip content={<RevenueTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="revenue" type="monotone" dataKey="Daily Revenue"
                  stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line yAxisId="bottles" type="monotone" dataKey="Bottles Sold"
                  stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Top Brands Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top by Bottles */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top 10 by Bottles Sold</CardTitle>
            <CardDescription>Highest volume brands across all dates</CardDescription>
          </CardHeader>
          <CardContent>
            {bottlesChartData.length === 0 ? (
              <EmptyState message="No data" />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={bottlesChartData} layout="vertical"
                  margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" axisLine={false} tickLine={false}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis type="category" dataKey="brand_number" width={44}
                    axisLine={false} tickLine={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip content={<BrandTooltip />} />
                  <Bar dataKey="sold" name="Bottles Sold" radius={[0, 4, 4, 0]}>
                    {bottlesChartData.map((_, i) => (
                      <Cell key={i} fill={BRAND_COLORS[i % BRAND_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top by Value */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top 10 by Sale Value</CardTitle>
            <CardDescription>Highest revenue brands across all dates</CardDescription>
          </CardHeader>
          <CardContent>
            {valueChartData.length === 0 ? (
              <EmptyState message="No data" />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={valueChartData} layout="vertical"
                  margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" axisLine={false} tickLine={false}
                    tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis type="category" dataKey="brand_number" width={44}
                    axisLine={false} tickLine={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip content={<BrandTooltip />} />
                  <Bar dataKey="value" name="Sale Value (₹)" radius={[0, 4, 4, 0]}>
                    {valueChartData.map((_, i) => (
                      <Cell key={i} fill={BRAND_COLORS[i % BRAND_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Date-wise Summary Table */}
      <Card className="border border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Date-wise Sales Summary</CardTitle>
          <CardDescription>Aggregated totals per sales day</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {trend.length === 0 ? (
            <div className="p-6"><EmptyState message="No sales data recorded yet." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/40 border-b border-border">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Brands</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Btls Sold</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Revenue</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...trend].reverse().map((row, i) => (
                    <tr key={row.date}
                      className={`border-b border-border transition-colors hover:bg-muted/30 ${i % 2 === 0 ? "" : "bg-secondary/10"}`}
                    >
                      <td className="px-4 py-2.5 font-medium text-foreground">{fmtDate(row.date)}</td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">{row.brands_count}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{Number(row.total_bottles_sold).toLocaleString("en-IN")}</td>
                      <td className="px-4 py-2.5 text-right font-semibold font-mono text-foreground">{fmt(row.total_revenue)}</td>
                      <td className="px-4 py-2.5 text-center">
                        {row.is_submitted ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
                            <CheckCircle2 className="w-3 h-3" />Submitted
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
                            <Calendar className="w-3 h-3" />Draft
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-secondary/30 border-t-2 border-border font-semibold">
                    <td className="px-4 py-2.5 text-foreground">Total ({trend.length} days)</td>
                    <td className="px-4 py-2.5 text-right">—</td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {trend.reduce((s, r) => s + r.total_bottles_sold, 0).toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-foreground">
                      {fmt(trend.reduce((s, r) => s + Number(r.total_revenue), 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Stock Tab ────────────────────────────────────────────────────────────────

function StockReportsTab() {
  const { data, isLoading, isError } = useQuery<StockReport>({
    queryKey: ["/api/reports/stock"],
    queryFn: async () => {
      const res = await fetch("/api/reports/stock");
      if (!res.ok) throw new Error("Failed to load stock report");
      return res.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data) {
    return <EmptyState message="Could not load stock report. Please try again." />;
  }

  const { kpi, trend, topBrandsByValue, topBrandsByBottles } = data;

  const trendChartData = trend.map(r => ({
    date: r.date,
    "Stock Value": Number(r.total_value),
    "Total Bottles": r.total_bottles,
  }));

  const valueChartData = topBrandsByValue.map(r => ({
    ...r,
    value: Number(r.value),
  }));

  const bottlesChartData = topBrandsByBottles.map(r => ({
    ...r,
    value: Number(r.value),
  }));

  const hasData = trend.length > 0;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Current Stock Value"
          value={fmt(kpi.latest_total_value)}
          sub={`As of ${fmtDate(kpi.latest_date)}`}
          icon={TrendingUp}
          color="primary"
        />
        <KpiCard
          title="Current Bottles"
          value={(kpi.latest_total_bottles ?? 0).toLocaleString("en-IN")}
          sub="In latest snapshot"
          icon={Package}
          color="blue"
        />
        <KpiCard
          title="Snapshots Available"
          value={String(kpi.total_dates ?? 0)}
          sub={`${fmtDate(kpi.earliest_date)} → ${fmtDate(kpi.latest_date)}`}
          icon={Calendar}
          color="green"
        />
        <KpiCard
          title="Avg Stock Value"
          value={fmt(
            kpi.total_dates && hasData
              ? trend.reduce((s, r) => s + Number(r.total_value), 0) / trend.length
              : 0
          )}
          sub="Per snapshot day"
          icon={BarChart2}
          color="amber"
        />
      </div>

      {/* Stock Value Trend */}
      <Card className="border border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Stock Value Trend</CardTitle>
          <CardDescription>Total stock value and bottle count per daily snapshot</CardDescription>
        </CardHeader>
        <CardContent>
          {!hasData ? (
            <EmptyState message="No stock snapshots recorded yet." />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="date"
                  axisLine={false} tickLine={false}
                  tickFormatter={fmtDate}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  yAxisId="value"
                  axisLine={false} tickLine={false}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  yAxisId="bottles"
                  orientation="right"
                  axisLine={false} tickLine={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip content={<RevenueTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="value" type="monotone" dataKey="Stock Value"
                  stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line yAxisId="bottles" type="monotone" dataKey="Total Bottles"
                  stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Top Brands */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top 10 by Stock Value</CardTitle>
            <CardDescription>Highest value brands in latest snapshot</CardDescription>
          </CardHeader>
          <CardContent>
            {valueChartData.length === 0 ? (
              <EmptyState message="No data" />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={valueChartData} layout="vertical"
                  margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" axisLine={false} tickLine={false}
                    tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis type="category" dataKey="brand_number" width={44}
                    axisLine={false} tickLine={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip content={<BrandTooltip />} />
                  <Bar dataKey="value" name="Stock Value (₹)" radius={[0, 4, 4, 0]}>
                    {valueChartData.map((_, i) => (
                      <Cell key={i} fill={BRAND_COLORS[i % BRAND_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top 10 by Bottle Count</CardTitle>
            <CardDescription>Highest volume brands in latest snapshot</CardDescription>
          </CardHeader>
          <CardContent>
            {bottlesChartData.length === 0 ? (
              <EmptyState message="No data" />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={bottlesChartData} layout="vertical"
                  margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" axisLine={false} tickLine={false}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis type="category" dataKey="brand_number" width={44}
                    axisLine={false} tickLine={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip content={<BrandTooltip />} />
                  <Bar dataKey="bottles" name="Bottles" radius={[0, 4, 4, 0]}>
                    {bottlesChartData.map((_, i) => (
                      <Cell key={i} fill={BRAND_COLORS[i % BRAND_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Date-wise Stock Snapshots Table */}
      <Card className="border border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Daily Stock Snapshots</CardTitle>
          <CardDescription>Closing stock totals per recorded date</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {trend.length === 0 ? (
            <div className="p-6"><EmptyState message="No stock snapshots recorded yet." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/40 border-b border-border">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Bottles</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Stock Value</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Change vs Prev</th>
                  </tr>
                </thead>
                <tbody>
                  {[...trend].reverse().map((row, i, arr) => {
                    const prevRow = arr[i + 1];
                    const currVal = Number(row.total_value);
                    const prevVal = prevRow ? Number(prevRow.total_value) : null;
                    const change = prevVal !== null ? currVal - prevVal : null;
                    return (
                      <tr key={row.date}
                        className={`border-b border-border transition-colors hover:bg-muted/30 ${i % 2 === 0 ? "" : "bg-secondary/10"}`}
                      >
                        <td className="px-4 py-2.5 font-medium text-foreground">{fmtDate(row.date)}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{Number(row.total_bottles).toLocaleString("en-IN")}</td>
                        <td className="px-4 py-2.5 text-right font-semibold font-mono text-foreground">{fmt(row.total_value)}</td>
                        <td className="px-4 py-2.5 text-right">
                          {change === null ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : change >= 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                              <TrendingUp className="w-3 h-3" />+{fmt(change)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                              <TrendingDown className="w-3 h-3" />{fmt(change)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Reports() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Analytics & Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Insights from your daily sales and stock snapshots.
        </p>
      </div>

      <Tabs defaultValue="sales" className="w-full">
        <TabsList className="mb-2">
          <TabsTrigger value="sales" className="gap-2">
            <ShoppingCart className="w-4 h-4" />
            Sales Reports
          </TabsTrigger>
          <TabsTrigger value="stock" className="gap-2">
            <Package className="w-4 h-4" />
            Stock Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-4">
          <SalesReportsTab />
        </TabsContent>

        <TabsContent value="stock" className="mt-4">
          <StockReportsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
