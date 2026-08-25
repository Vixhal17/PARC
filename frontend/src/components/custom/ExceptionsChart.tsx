import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';
import type { ChartData } from '../../types';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface ExceptionsChartProps {
  data: ChartData[];
}

const PROBLEM_COLORS: Record<string, { bg: string; text: string; hex: string }> = {
  AMOUNT_MISMATCH: { hex: "#f59e0b", bg: "bg-amber-50 dark:bg-amber-950/50", text: "text-amber-700 dark:text-amber-300" },
  DUPLICATE_UTR: { hex: "#3b82f6", bg: "bg-blue-50 dark:bg-blue-950/50", text: "text-blue-700 dark:text-blue-300" },
  MISSING_PAYMENT: { hex: "#8b5cf6", bg: "bg-purple-50 dark:bg-purple-950/50", text: "text-purple-700 dark:text-purple-300" },
  MISSING_SETTLEMENT: { hex: "#ec4899", bg: "bg-pink-50 dark:bg-pink-950/50", text: "text-pink-700 dark:text-pink-300" },
  TIMING_DELAY: { hex: "#10b981", bg: "bg-emerald-50 dark:bg-emerald-950/50", text: "text-emerald-700 dark:text-emerald-300" },
  UNRESOLVED: { hex: "#ef4444", bg: "bg-rose-50 dark:bg-rose-950/50", text: "text-rose-700 dark:text-rose-300" }
};

const FALLBACK_PALETTE = ["#f59e0b", "#3b82f6", "#8b5cf6", "#ec4899", "#10b981", "#ef4444"];

export function ExceptionsChart({ data }: ExceptionsChartProps) {
  const totalExceptions = data.reduce((acc, curr) => acc + curr.Count, 0);

  if (!data || data.length === 0 || totalExceptions === 0) {
    return (
      <Card className="h-full border border-[#e3e8ee] dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 shadow-xs">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/60">
              <PieChartIcon className="w-4 h-4" />
            </div>
            <CardTitle className="text-base font-normal tracking-tight text-[#0d253d] dark:text-white">
              Exceptions Breakdown
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64 text-emerald-600 font-medium text-xs">
          ✓ Clean dataset — 0 exceptions detected!
        </CardContent>
      </Card>
    );
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const entry = payload[0];
      const percent = ((entry.value / totalExceptions) * 100).toFixed(1);
      return (
        <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-lg text-xs space-y-1">
          <p className="font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.payload.fill }} />
            {entry.name}
          </p>
          <p className="text-[#64748d] dark:text-zinc-400 font-mono">
            Count: <b className="text-slate-900 dark:text-white">{entry.value}</b> ({percent}%)
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="h-full border border-[#e3e8ee] dark:border-zinc-800/80 shadow-xs bg-white dark:bg-zinc-900/90 flex flex-col justify-between">
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/60">
              <PieChartIcon className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base font-normal tracking-tight text-[#0d253d] dark:text-white">
                Exceptions by Category
              </CardTitle>
              <p className="text-[11px] text-[#64748d] dark:text-zinc-400">
                Categorized anomaly distribution across reconciliation rules
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-semibold text-xs border border-amber-200/60 dark:border-amber-900/60">
            {totalExceptions} Issues
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-2 pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
          {/* Donut Chart */}
          <div className="h-56 relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="Count"
                  nameKey="Reason"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={3}
                  stroke="none"
                >
                  {data.map((entry, index) => {
                    const color = PROBLEM_COLORS[entry.Reason]?.hex || FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
                    return <Cell key={`cell-${index}`} fill={color} />;
                  })}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            {/* Inner Center Metric */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-light text-[#0d253d] dark:text-white tnum tracking-tight">
                {totalExceptions}
              </span>
              <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                Exceptions
              </span>
            </div>
          </div>

          {/* Category Chips List */}
          <div className="space-y-1.5">
            {data.map((entry, idx) => {
              const info = PROBLEM_COLORS[entry.Reason] || { hex: FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length], bg: "bg-slate-100 dark:bg-zinc-800", text: "text-slate-800 dark:text-zinc-200" };
              const percent = ((entry.Count / totalExceptions) * 100).toFixed(0);

              return (
                <div key={entry.Reason} className="flex items-center justify-between text-xs p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: info.hex }} />
                    <span className="font-medium text-slate-700 dark:text-zinc-300 truncate">
                      {entry.Reason}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{entry.Count}</span>
                    <span className="text-[10px] text-slate-400 font-mono">({percent}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
