import { useEffect, useState } from 'react';
import { RefreshCw, Database, History, RotateCcw, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { apiClient } from '../api/client';
import { useData } from '../context/DataContext';
import type { OverviewData, ChartData, TimelineData } from '../types';
import { KpiCard } from '../components/custom/KpiCard';
import { ExceptionsChart } from '../components/custom/ExceptionsChart';
import { SettlementTimelineChart } from '../components/custom/SettlementTimelineChart';
import { MoneyFlowVisualizer } from '../components/custom/MoneyFlowVisualizer';
import { Button } from '../components/ui/button';
import { Separator } from '../components/ui/separator';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';

export default function Overview() {
  const { 
    generationKey, 
    regenerateData, 
    isRegenerating, 
    openDataModal, 
    history, 
    activeRunId,
    restoreRun,
    isRestoring
  } = useData();

  const [data, setData] = useState<OverviewData | null>(null);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [timelineData, setTimelineData] = useState<TimelineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  const loadData = async () => {
    try {
      const [overviewRes, chartRes, timelineRes] = await Promise.all([
        apiClient.getOverview(),
        apiClient.getExceptionsChartData(),
        apiClient.getTimelineData(),
      ]);
      setData(overviewRes);
      setChartData(chartRes);
      setTimelineData(timelineRes);
    } catch (error) {
      console.error("Failed to load overview data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [generationKey]);

  const handleRegenerate = async () => {
    try {
      await regenerateData();
    } catch (error) {
      console.error("Failed to regenerate data:", error);
    }
  };

  if (loading && !data) {
    return (
      <div className="p-8 text-muted-foreground flex items-center justify-center gap-2 min-h-[400px]">
        <RefreshCw className="animate-spin h-5 w-5 text-[#533afd]" />
        Loading overview data...
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6 space-y-6 max-w-7xl mx-auto"
    >
      {/* Top Banner & Action Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-3xl font-light tracking-[-0.64px] text-[#0d253d] dark:text-white">
              Reconciliation Overview
            </h2>
            <Badge variant="outline" className="bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 text-xs">
              Live Reconciled
            </Badge>
          </div>
          <p className="font-light text-sm text-[#64748d] dark:text-zinc-400 mt-1">
            Real-time multi-way analysis of 500 synthetic orders, payments, settlements, and bank credits.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {history.length > 0 && (
            <Button
              variant="outline"
              size="lg"
              onClick={() => setShowHistory(prev => !prev)}
              className={`border-[#e3e8ee] dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 gap-2 shadow-xs transition-colors ${
                showHistory ? 'bg-indigo-50/80 border-indigo-300 text-[#533afd]' : ''
              }`}
            >
              <History className="h-4 w-4 text-[#533afd]" />
              <span>{showHistory ? "Hide History" : `History (${history.length} Runs)`}</span>
              {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
          )}

          <Button 
            variant="outline" 
            size="lg" 
            onClick={() => openDataModal()}
            className="border-indigo-200 dark:border-indigo-900 text-[#533afd] dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 gap-2 shadow-xs"
          >
            <Database className="h-4 w-4 text-[#533afd]" />
            View Generated Data
          </Button>

          <Button 
            onClick={handleRegenerate} 
            disabled={isRegenerating || isRestoring} 
            size="lg" 
            className="bg-[#533afd] hover:bg-[#4434d4] text-white shadow-xs gap-2 min-w-[200px]"
          >
            <RefreshCw className={`h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} />
            {isRegenerating ? "Regenerating..." : "Regenerate Synthetic Data"}
          </Button>
        </div>
      </div>

      {/* Collapsible History of Previous 3 Generations (Hidden until clicked) */}
      <AnimatePresence>
        {showHistory && history.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <Card className="bg-white dark:bg-zinc-900 border border-indigo-200/80 dark:border-indigo-900/60 stripe-shadow-1">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-zinc-200">
                    <History className="w-4 h-4 text-[#533afd]" />
                    <span>Dataset Generation History (Tracking Last 3 Runs):</span>
                  </div>
                  <span className="text-[11px] text-[#64748d] dark:text-zinc-400">
                    Click "Explore" to inspect raw tables, or "Restore" to switch datasets
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {history.map((run, idx) => {
                    const isActive = run.run_id === activeRunId;
                    const runNumber = history.length - idx;
                    const formattedRate = typeof run.match_rate === 'number' 
                      ? run.match_rate.toFixed(2) 
                      : parseFloat(String(run.match_rate)).toFixed(2);

                    return (
                      <div 
                        key={run.run_id} 
                        className={`p-3 rounded-xl border transition-all text-xs flex flex-col justify-between gap-2 ${
                          isActive 
                            ? 'bg-indigo-50/60 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800 ring-1 ring-indigo-400/40' 
                            : 'bg-slate-50/60 dark:bg-zinc-800/40 border-slate-200 dark:border-zinc-700/60'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                              Run #{runNumber}
                              {isActive && (
                                <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                                  Active Dataset
                                </span>
                              )}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(run.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-600 dark:text-zinc-300">
                            <span>Match Rate: <b className="text-emerald-700 dark:text-emerald-400">{formattedRate}%</b></span>
                            <span>Exceptions: <b className="text-amber-700 dark:text-amber-400">{run.exceptions_count}</b></span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60 dark:border-zinc-700/50">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDataModal('orders', run.run_id)}
                            className="h-6 px-2 text-[11px] text-[#533afd] dark:text-indigo-400 hover:bg-indigo-100/50 gap-1"
                          >
                            <Eye className="w-3 h-3" /> Explore Data
                          </Button>
                          {!isActive && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => restoreRun(run.run_id)}
                              disabled={isRestoring}
                              className="h-6 px-2 text-[11px] text-slate-700 dark:text-zinc-300 hover:bg-slate-200/50 gap-1 ml-auto"
                            >
                              <RotateCcw className="w-2.5 h-2.5" /> Restore
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KPI Cards */}
      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard 
              label="Match Rate" 
              value={typeof data.match_rate === 'number' ? data.match_rate : parseFloat(String(data.match_rate))} 
              suffix="%" 
              animateCountUp={true} 
              decimalPlaces={2}
            />
            <KpiCard label="Total Records" value={data.total_records} animateCountUp={true} />
            <KpiCard label="Exceptions" value={data.exceptions_count} animateCountUp={true} />
            <KpiCard 
              label="Q&A Accuracy" 
              value={data.qa_accuracy || '100%'} 
              suffix={data.qa_accuracy && !String(data.qa_accuracy).includes('%') ? "%" : ""} 
              animateCountUp={typeof data.qa_accuracy === 'number'} 
            />
          </div>

          {/* Interactive Multi-Way Money Flow & Revenue Leakage Visualizer */}
          <MoneyFlowVisualizer generationKey={generationKey} />
          
          <Separator className="my-8" />
          
          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            <ExceptionsChart data={chartData} />
            <SettlementTimelineChart data={timelineData} />
          </div>
        </>
      )}
    </motion.div>
  );
}
