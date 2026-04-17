import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { TrendingUp, PieChart as PieIcon, BarChart3 } from "lucide-react";
import { getInvoices, getExpenses, getCustomersWithDebt } from "@/lib/store";
import { getSuppliersWithDebt } from "@/lib/suppliers";

const PIE_COLORS = [
  "hsl(200, 85%, 48%)",
  "hsl(142, 76%, 45%)",
  "hsl(38, 92%, 55%)",
  "hsl(0, 72%, 55%)",
  "hsl(280, 65%, 60%)",
  "hsl(180, 60%, 50%)",
  "hsl(330, 80%, 60%)",
  "hsl(45, 90%, 55%)",
];

export default function DashboardCharts({ refreshKey }: { refreshKey: number }) {
  // === 1) Sales last 30 days (line) ===
  const salesData = useMemo(() => {
    const invoices = getInvoices();
    const days: { label: string; date: string; sales: number }[] = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const dateStr = d.toISOString().split("T")[0];
      days.push({
        date: dateStr,
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        sales: 0,
      });
    }
    invoices.forEach((inv) => {
      const dStr = (inv.createdAt || "").split("T")[0];
      const day = days.find((x) => x.date === dStr);
      if (day) day.sales += inv.total || 0;
    });
    return days;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const totalLast30 = salesData.reduce((s, d) => s + d.sales, 0);

  // === 2) Expenses by type (pie) ===
  const expensesData = useMemo(() => {
    const exps = getExpenses();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const inRange = exps.filter((e) => new Date(e.date) >= cutoff);
    const grouped: Record<string, number> = {};
    inRange.forEach((e) => {
      const key = e.type || "أخرى";
      grouped[key] = (grouped[key] || 0) + (e.amount || 0);
    });
    return Object.entries(grouped)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const totalExpenses30 = expensesData.reduce((s, x) => s + x.value, 0);

  // === 3) Debts comparison (bar) ===
  const debtsData = useMemo(() => {
    const debtCustomers = getCustomersWithDebt();
    const debtSuppliers = getSuppliersWithDebt();
    const customerDebt = debtCustomers.reduce((s, c) => s + Math.max(0, c.balance || 0), 0);
    const supplierDebt = debtSuppliers.reduce((s, x) => s + Math.max(0, x.balance || 0), 0);
    return [
      { name: "ديون لك (عملاء)", value: customerDebt, fill: "hsl(38, 92%, 55%)" },
      { name: "ديون عليك (موردين)", value: supplierDebt, fill: "hsl(0, 72%, 55%)" },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const tooltipStyle = {
    contentStyle: {
      backgroundColor: "hsl(var(--background))",
      border: "1px solid hsl(var(--border))",
      borderRadius: "12px",
      fontSize: "12px",
      fontWeight: 700,
      direction: "rtl" as const,
    },
    labelStyle: { color: "hsl(var(--foreground))", fontWeight: 800 },
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
      {/* Sales line chart — full width on top */}
      <div className="stat-card lg:col-span-2 animate-fade-in-up">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <TrendingUp className="text-primary" size={20} />
            </div>
            <h3 className="font-extrabold">مبيعات آخر 30 يوم</h3>
          </div>
          <span className="text-sm font-extrabold text-primary">
            إجمالي: {totalLast30.toLocaleString()} ج.م
          </span>
        </div>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={salesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="label"
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                interval={"preserveStartEnd"}
                tick={{ fontWeight: 700 }}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                tick={{ fontWeight: 700 }}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`}
              />
              <Tooltip
                {...tooltipStyle}
                formatter={(v: number) => [`${v.toLocaleString()} ج.م`, "المبيعات"]}
              />
              <Line
                type="monotone"
                dataKey="sales"
                stroke="hsl(200, 85%, 48%)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "hsl(200, 85%, 48%)" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Expenses pie */}
      <div className="stat-card animate-fade-in-up">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
              <PieIcon className="text-destructive" size={20} />
            </div>
            <h3 className="font-extrabold">توزيع المصاريف (30 يوم)</h3>
          </div>
          <span className="text-sm font-extrabold text-destructive">
            {totalExpenses30.toLocaleString()} ج.م
          </span>
        </div>
        {expensesData.length === 0 ? (
          <div className="h-[260px] flex items-center justify-center">
            <p className="text-sm text-muted-foreground">لا توجد مصاريف في آخر 30 يوم</p>
          </div>
        ) : (
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={expensesData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  nameKey="name"
                  label={(entry: any) => `${entry.name} (${((entry.value / totalExpenses30) * 100).toFixed(0)}%)`}
                  labelLine={false}
                  fontSize={10}
                >
                  {expensesData.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v: number) => [`${v.toLocaleString()} ج.م`, ""]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Debts bar chart */}
      <div className="stat-card animate-fade-in-up">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
            <BarChart3 className="text-warning" size={20} />
          </div>
          <h3 className="font-extrabold">مقارنة المديونيات</h3>
        </div>
        {debtsData.every((d) => d.value === 0) ? (
          <div className="h-[260px] flex items-center justify-center">
            <p className="text-sm text-muted-foreground">لا توجد مديونيات حالياً 👍</p>
          </div>
        ) : (
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={debtsData} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="name"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tick={{ fontWeight: 700 }}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tick={{ fontWeight: 700 }}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v: number) => [`${v.toLocaleString()} ج.م`, ""]}
                  cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
