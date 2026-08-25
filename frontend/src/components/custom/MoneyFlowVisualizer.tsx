import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowRight, 
  ShoppingCart, 
  CreditCard, 
  Layers, 
  Building2, 
  CheckCircle2, 
  AlertTriangle, 
  Sparkles, 
  DollarSign, 
  ChevronRight,
  TrendingDown
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { apiClient } from '../../api/client';
import { useData } from '../../context/DataContext';
import type { MoneyFlowData } from '../../types';

interface MoneyFlowVisualizerProps {
  generationKey: number;
}

const STAGE_ICONS: Record<string, any> = {
  orders: ShoppingCart,
  payments: CreditCard,
  settlements: Layers,
  bank_statement: Building2,
  clean_cash: CheckCircle2,
};

const STAGE_GRADIENTS: Record<string, string> = {
  orders: 'from-blue-500/10 to-indigo-500/10 border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300',
  payments: 'from-indigo-500/10 to-purple-500/10 border-indigo-200 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300',
  settlements: 'from-purple-500/10 to-pink-500/10 border-purple-200 dark:border-purple-800/60 text-purple-700 dark:text-purple-300',
  bank_statement: 'from-cyan-500/10 to-teal-500/10 border-cyan-200 dark:border-cyan-800/60 text-cyan-700 dark:text-cyan-300',
  clean_cash: 'from-emerald-500/10 to-green-500/10 border-emerald-300 dark:border-emerald-700/60 text-emerald-800 dark:text-emerald-300',
};

const LEAKAGE_DETAILS: Record<string, { label: string; stage: string; action: string }> = {
  MISSING_PAYMENT: { label: 'Unpaid / Dropped Orders', stage: 'orders', action: 'Retry Gateway Webhook' },
  UNRESOLVED: { label: 'Orphaned Gateway Payments', stage: 'payments', action: 'Triage Gateway Batch' },
  MISSING_SETTLEMENT: { label: 'Uncredited Bank Deposits', stage: 'settlements', action: 'Initiate UTR Trace' },
  DUPLICATE_UTR: { label: 'UTR Bank Collisions', stage: 'settlements', action: 'De-duplicate Statement' },
  AMOUNT_MISMATCH: { label: 'Fee / Net Variances', stage: 'bank_statement', action: 'Post Journal Adjustment' },
  TIMING_DELAY: { label: 'SLA Credit Delays (>24h)', stage: 'bank_statement', action: 'Review Bank Delay' },
};

export function MoneyFlowVisualizer({ generationKey }: MoneyFlowVisualizerProps) {
  const { askAgentWithQuestion, setActiveTab } = useData();
  const [data, setData] = useState<MoneyFlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLeakage, setSelectedLeakage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    apiClient.getMoneyFlow()
      .then(res => {
        if (isMounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error("Failed to load money flow:", err);
        if (isMounted) setLoading(false);
      });
    return () => { isMounted = false; };
  }, [generationKey]);

  if (loading || !data) {
    return (
      <Card className="border border-[#e3e8ee] dark:border-zinc-800">
        <CardContent className="p-8 flex items-center justify-center text-slate-400 text-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-4 h-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
            <span>Mapping Multi-Way Money Flow Pipeline...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  };

  const formatLakhs = (amount: number) => {
    if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(2)} Lakhs`;
    }
    return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };

  const leakageEntries = Object.entries(data.leakage);

  return (
    <Card className="border border-[#e3e8ee] dark:border-zinc-800/80 bg-gradient-to-b from-white to-slate-50/50 dark:from-zinc-900 dark:to-zinc-950/80 shadow-xs overflow-hidden rounded-2xl">
      <CardHeader className="pb-3 pt-5 px-6 border-b border-slate-100 dark:border-zinc-800/60">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-[#533afd] dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-900/60">
                <Sparkles className="w-4 h-4" />
              </div>
              <CardTitle className="text-lg font-light tracking-[-0.3px] text-[#0d253d] dark:text-white flex items-center gap-2">
                Interactive Money Flow & Revenue Leakage Pipeline
              </CardTitle>
            </div>
            <CardDescription className="text-xs font-light text-slate-500 dark:text-zinc-400">
              Live multi-way reconciliation tracking gross transaction volume down to net bank credit & exception leakage.
            </CardDescription>
          </div>

          {/* Quick Stats Pill */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="px-3 py-1.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/50 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <div className="text-xs">
                <span className="text-slate-500 dark:text-zinc-400">Reconciled: </span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-300 tnum">
                  {formatLakhs(data.stages[4]?.amount || 0)} ({data.match_rate}%)
                </span>
              </div>
            </div>

            <div className="px-3 py-1.5 rounded-xl bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-800/50 flex items-center gap-2">
              <TrendingDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              <div className="text-xs">
                <span className="text-slate-500 dark:text-zinc-400">At Risk / Leakage: </span>
                <span className="font-semibold text-rose-700 dark:text-rose-300 tnum">
                  {formatLakhs(data.total_leakage_amount)} ({data.total_discrepancies} records)
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 md:p-6 space-y-6">
        {/* Main 5-Stage Sankey Pipeline Flow */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 relative">
          {data.stages.map((stage, idx) => {
            const Icon = STAGE_ICONS[stage.id] || DollarSign;
            const gradientStyle = STAGE_GRADIENTS[stage.id] || '';
            const isLast = idx === data.stages.length - 1;

            return (
              <div key={stage.id} className="relative group">
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.08 }}
                  className={`p-4 rounded-xl border bg-gradient-to-b ${gradientStyle} shadow-2xs hover:shadow-md transition-all duration-200 h-full flex flex-col justify-between`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="p-2 rounded-lg bg-white dark:bg-zinc-800 shadow-2xs border border-slate-200/50 dark:border-zinc-700/50">
                        <Icon className="w-4 h-4" />
                      </div>
                      <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 bg-white/70 dark:bg-zinc-800/70 border-current">
                        Stage {idx + 1}
                      </Badge>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-slate-500 dark:text-zinc-400">{stage.name}</div>
                      <div className="text-base sm:text-lg font-semibold tracking-tight text-slate-900 dark:text-white mt-0.5 tnum">
                        {formatCurrency(stage.amount)}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 mt-3 border-t border-current/10 flex items-center justify-between text-xs text-slate-600 dark:text-zinc-400">
                    <span>Volume</span>
                    <span className="font-semibold font-mono tnum text-slate-800 dark:text-zinc-200">
                      {stage.count} {stage.id === 'settlements' ? 'batches' : 'records'}
                    </span>
                  </div>
                </motion.div>

                {/* Arrow connector between stages for large screens */}
                {!isLast && (
                  <div className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 items-center justify-center text-slate-400 shadow-xs">
                    <ArrowRight className="w-3 h-3" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Leakage & Discrepancy Breakdown Section */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              <span className="text-xs sm:text-sm font-medium text-slate-800 dark:text-zinc-200">
                Revenue Leakage & Exception Points ({leakageEntries.length} Active Anomaly Types)
              </span>
            </div>
            <span className="text-[11px] text-slate-400">Click any anomaly card to inspect root causes</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {leakageEntries.map(([reason, item], idx) => {
              const meta = LEAKAGE_DETAILS[reason] || { label: reason, stage: 'pipeline', action: 'Inspect Exception' };
              const isSelected = selectedLeakage === reason;

              return (
                <motion.div
                  key={reason}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => setSelectedLeakage(isSelected ? null : reason)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-400 dark:border-amber-700 shadow-sm ring-2 ring-amber-400/20'
                      : 'bg-white dark:bg-zinc-900/80 border-slate-200 dark:border-zinc-800 hover:border-amber-300 dark:hover:border-amber-800 hover:bg-amber-50/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs font-semibold text-amber-800 dark:text-amber-300">
                          {reason}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-100/60 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300/60">
                          {item.count} orders
                        </Badge>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-zinc-400 font-light line-clamp-1">
                        {meta.label}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs sm:text-sm font-semibold text-rose-600 dark:text-rose-400 font-mono tnum">
                        {formatCurrency(item.amount)}
                      </div>
                      <div className="text-[10px] text-slate-400">Leakage</div>
                    </div>
                  </div>

                  {/* Expanded Action Bar */}
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3 pt-2.5 border-t border-amber-200 dark:border-amber-900/60 space-y-2"
                      >
                        <p className="text-[11px] text-slate-600 dark:text-zinc-300 leading-relaxed">
                          {item.description || `Orders identified with ${reason} require automated settlement reconciliation.`}
                        </p>

                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              askAgentWithQuestion(`How many ${reason} exceptions do we have and what are their root causes?`);
                            }}
                            className="bg-[#533afd] hover:bg-[#4434d4] text-white text-xs h-7 px-2.5 rounded-lg gap-1 shadow-2xs"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>Ask Agent to Triage</span>
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveTab('exceptions');
                            }}
                            className="text-xs h-7 px-2.5 rounded-lg border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300"
                          >
                            <span>View in Exceptions Hub</span>
                            <ChevronRight className="w-3 h-3" />
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
