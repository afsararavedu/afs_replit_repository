import { useQuery } from "@tanstack/react-query";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  Legend
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DailySale, StockDetail } from "@shared/schema";
import { format, startOfWeek, endOfWeek, isWithinInterval, parseISO } from "date-fns";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

export default function Reports() {
  const { data: sales = [] } = useQuery<DailySale[]>({ queryKey: ["/api/sales"] });
  const { data: stock = [] } = useQuery<StockDetail[]>({ queryKey: ["/api/stock"] });
  const [selectedData, setSelectedData] = useState<any[] | null>(null);
  const [modalTitle, setModalTitle] = useState("");

  // Weekly Sales — current week only
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday start
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const weeklySales = sales.filter(sale => {
    if (!sale.date) return false;
    const d = parseISO(sale.date.toString());
    return isWithinInterval(d, { start: weekStart, end: weekEnd });
  });

  const weeklyTotal = weeklySales.reduce((sum, s) => sum + Number(s.saleValue || 0), 0);

  // Build salesData with all 7 weekdays (Mon–Sun), zero-filled for missing days
  const DAYS_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weeklySalesByDay = weeklySales.reduce((acc: any, sale) => {
    const day = sale.date ? format(parseISO(sale.date.toString()), "EEE") : "N/A";
    if (!acc[day]) acc[day] = { name: day, value: 0, items: [] };
    acc[day].value = parseFloat((acc[day].value + Number(sale.saleValue || 0)).toFixed(2));
    acc[day].items.push(sale);
    return acc;
  }, {});

  const salesData = DAYS_ORDER.map(day => weeklySalesByDay[day] || { name: day, value: 0, items: [] });

  // Stock Distribution
  const stockByCategory = stock.reduce((acc: any, item) => {
    const category = item.brandName.split(' ')[0];
    if (!acc[category]) acc[category] = { name: category, value: 0, items: [] };
    acc[category].value += Number(item.totalStockValue || 0);
    acc[category].items.push(item);
    return acc;
  }, {});

  const stockData = Object.values(stockByCategory);

  const handleBarClick = (data: any) => {
    setSelectedData(data.items);
    setModalTitle(`${data.name} Sales Breakdown`);
  };

  const handlePieClick = (data: any) => {
    setSelectedData(data.payload.items);
    setModalTitle(`${data.payload.name} Stock Breakdown`);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics & Reports</h1>
          <p className="text-muted-foreground mt-1">Visualize your business performance and inventory.</p>
        </div>
      </div>

      <Tabs defaultValue="daily" className="w-full">
        <TabsList>
          <TabsTrigger value="daily">Daily Reports</TabsTrigger>
          <TabsTrigger value="weekly">Weekly Summary</TabsTrigger>
          <TabsTrigger value="stock">Stock Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card>
              <CardHeader>
                <CardTitle>Daily Sales Performance</CardTitle>
                <CardDescription>Sales value across the current week. Click bars for details.</CardDescription>
              </CardHeader>
              <CardContent className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesData} onClick={(data) => data && handleBarClick(data.activePayload?.[0]?.payload)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `₹${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                    <Tooltip cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }} formatter={(val: any) => [`₹${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Sales"]} />
                    <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sales Distribution</CardTitle>
                <CardDescription>Proportion of sales by brand. Click sectors for details.</CardDescription>
              </CardHeader>
              <CardContent className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={salesData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={120}
                      label={({ name, value }) => `${name}: ₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      onClick={handlePieClick}
                    >
                      {salesData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: any) => [`₹${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Sales"]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="weekly" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Weekly Summary</CardTitle>
              <CardDescription>
                Week of {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="p-6 bg-primary/5 rounded-2xl border border-primary/10">
                  <p className="text-sm font-medium text-primary uppercase tracking-wider">Total Weekly Sales</p>
                  <p className="text-3xl font-bold mt-2">₹ {weeklyTotal.toLocaleString()}</p>
                </div>
                <div className="p-6 bg-green-50 rounded-2xl border border-green-100">
                  <p className="text-sm font-medium text-green-600 uppercase tracking-wider">Average Daily Sale</p>
                  <p className="text-3xl font-bold mt-2">₹ {(weeklyTotal / 7).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100">
                  <p className="text-sm font-medium text-blue-600 uppercase tracking-wider">Top Brand</p>
                  <p className="text-3xl font-bold mt-2">{sales.length > 0 ? "Ultra Lager" : "N/A"}</p>
                </div>
              </div>
              
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Brand</TableHead>
                    <TableHead className="text-right">Sold (Btls)</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklySales.map((sale, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{sale.brandName}</TableCell>
                      <TableCell className="text-right">{sale.soldBottles}</TableCell>
                      <TableCell className="text-right">₹{sale.saleValue}</TableCell>
                    </TableRow>
                  ))}
                  {weeklySales.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No sales recorded for this week</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stock" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Inventory Value Distribution</CardTitle>
              <CardDescription>Total value of stock grouped by brand category.</CardDescription>
            </CardHeader>
            <CardContent className="h-[500px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stockData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={150}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    onClick={handlePieClick}
                  >
                    {stockData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val) => `₹${Number(val).toLocaleString()}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedData} onOpenChange={() => setSelectedData(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{modalTitle}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brand Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedData?.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{item.brandName}</TableCell>
                    <TableCell>{item.size}</TableCell>
                    <TableCell className="text-right">{item.soldBottles || item.totalStockBottles}</TableCell>
                    <TableCell className="text-right">₹{item.saleValue || item.totalStockValue}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
