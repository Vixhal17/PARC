import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity } from 'lucide-react';
import type { TimelineData } from '../../types';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface SettlementTimelineChartProps {
  data: TimelineData[];
}

export function SettlementTimelineChart({ data }: SettlementTimelineChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card className="h-full border border-[#e3e8ee] dark:border-zinc-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <CardTitle className="text-lg font-light tracking-tight">Settlement vs Bank Credit Timeline</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64 text-muted-foreground text-xs">
          No timeline data available.
        </CardContent>
      </Card>
    );
  }

  // Calculate totals
  const totalSettled = data.reduce((sum, d) => sum + (d.settled_amount || 0), 0);
  const totalCredited = data.reduce((sum, d) => sum + (d.credited_amount || 0), 0);

  const formatCurrency = (val: number) => {
    return `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const settled = payload.find((p: any) => p.dataKey === 'settled_amount')?.value || 0;
      const credited = payload.find((p: any) => p.dataKey === 'credited_amount')?.value || 0;
      const dayDiff = settled - credited;

      return (
        <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md p-3 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-lg text-xs space-y-1.5 min-w-[190px]">
          <p className="font-semibold text-slate-800 dark:text-zinc-200 pb-1 border-b border-slate-100 dark:border-zinc-800">
            {label}
          </p>
          <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 font-medium">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span> Settled:
            </span>
            <span className="font-mono">{formatCurrency(settled)}</span>
          </div>
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-medium">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Bank Credited:
            </span>
            <span className="font-mono">{formatCurrency(credited)}</span>
          </div>
          {Math.abs(dayDiff) > 0.01 && (
            <div className="pt-1 border-t border-slate-100 dark:border-zinc-800 text-[10px] text-amber-600 dark:text-amber-400 flex justify-between">
              <span>Variance:</span>
              <span className="font-mono">{formatCurrency(Math.abs(dayDiff))}</span>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="h-full border border-[#e3e8ee] dark:border-zinc-800/80 shadow-xs bg-white dark:bg-zinc-900/90">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-900/60">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base font-normal tracking-tight text-[#0d253d] dark:text-white">
                Settlement & Bank Credit Timeline
              </CardTitle>
              <p className="text-[11px] text-[#64748d] dark:text-zinc-400">
                Daily batch settlements mapped directly against bank statement credits
              </p>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-medium border border-indigo-200/60 dark:border-indigo-900/50">
              Settled: <b className="font-mono">{formatCurrency(totalSettled)}</b>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-medium border border-emerald-200/60 dark:border-emerald-900/50">
              Credited: <b className="font-mono">{formatCurrency(totalCredited)}</b>
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="h-72 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="settledAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#533afd" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#533afd" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="creditedAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(150, 150, 150, 0.12)" />
            <XAxis 
              dataKey="date" 
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#888888' }}
              dy={6}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#888888' }}
              tickFormatter={(val) => `₹${Math.round(val / 1000)}k`}
            />
            <Tooltip content={<CustomTooltip />} />

            <Area 
              type="monotone" 
              dataKey="settled_amount" 
              name="Settled Amount" 
              stroke="#533afd" 
              strokeWidth={2.5}
              fillOpacity={1} 
              fill="url(#settledAreaGrad)" 
            />
            <Area 
              type="monotone" 
              dataKey="credited_amount" 
              name="Bank Credited Amount" 
              stroke="#10b981" 
              strokeWidth={2.5}
              fillOpacity={1} 
              fill="url(#creditedAreaGrad)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
