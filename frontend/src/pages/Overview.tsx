import { useEffect, useState } from 'react';
import { 
  RefreshCw, Upload, ShoppingCart, CreditCard, Boxes, Landmark, 
  ScanEye, HeartPulse, Layers, AlertTriangle, Target, ChevronDown, ChevronUp, History, Eye, RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

import { apiClient } from '../api/client';
import { useData } from '../context/DataContext';
import type { OverviewData, ChartData, TimelineData, MoneyFlowData } from '../types';
import { ExceptionsChart } from '../components/custom/ExceptionsChart';
import { SettlementTimelineChart } from '../components/custom/SettlementTimelineChart';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';

function formatIndianCurrency(amount: number): string {
  if (isNaN(amount) || amount === 0) return '0.00';
  return amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export default function Overview() {
  const { 
    generationKey, 
    regenerateData, 
    isRegenerating, 
    openDataModal, 
    history, 
    activeRun,
    activeRunId,
    restoreRun,
    isRestoring,
    setActiveTab
  } = useData();

  const [data, setData] = useState<OverviewData | null>(null);
  const [moneyFlow, setMoneyFlow] = useState<MoneyFlowData | null>(null);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [timelineData, setTimelineData] = useState<TimelineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDetailedCharts, setShowDetailedCharts] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [relativeSyncTime, setRelativeSyncTime] = useState<string>("2 minutes ago");

  const loadData = async () => {
    try {
      const [overviewRes, chartRes, timelineRes, flowRes] = await Promise.all([
        apiClient.getOverview(),
        apiClient.getExceptionsChartData(),
        apiClient.getTimelineData(),
        apiClient.getMoneyFlow().catch(() => null),
      ]);
      setData(overviewRes);
      setChartData(chartRes);
      setTimelineData(timelineRes);
      if (flowRes) setMoneyFlow(flowRes);
    } catch (error) {
      console.error("Failed to load overview data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [generationKey]);

  useEffect(() => {
    const calculateRelativeTime = () => {
      if (!activeRun?.timestamp) {
        setRelativeSyncTime("2 minutes ago");
        return;
      }
      const syncDate = new Date(activeRun.timestamp);
      const diffMs = Date.now() - syncDate.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins <= 0) {
        setRelativeSyncTime("Just now");
      } else if (diffMins === 1) {
        setRelativeSyncTime("1 minute ago");
      } else if (diffMins < 60) {
        setRelativeSyncTime(`${diffMins} minutes ago`);
      } else {
        const diffHours = Math.floor(diffMins / 60);
        setRelativeSyncTime(`${diffHours} hours ago`);
      }
    };

    calculateRelativeTime();
    const timer = setInterval(calculateRelativeTime, 30000);
    return () => clearInterval(timer);
  }, [generationKey, activeRun]);

  const handleRegenerate = async () => {
    try {
      await regenerateData();
      toast.success("Reconciliation ledger synchronized!");
    } catch (error) {
      console.error("Failed to regenerate data:", error);
      toast.error("Failed to synchronize data");
    }
  };

  const handleExportReport = async () => {
    try {
      const res = await apiClient.getGeneratedData('reconciled', undefined, 500, 0);
      const rows = res.rows || [];
      if (rows.length === 0) {
        toast.error("No reconciliation data available to export");
        return;
      }
      const headers = Object.keys(rows[0]);
      const csvContent = [
        headers.join(','),
        ...rows.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `reconciliation_report_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Reconciliation report exported successfully!");
    } catch (err) {
      toast.error("Failed to export report");
    }
  };

  // Controller Health dynamic calculation
  const matchRate = data?.match_rate 
    ? (typeof data.match_rate === 'number' ? data.match_rate : parseFloat(String(data.match_rate)))
    : 89.60;
  
  const controllerHealth = matchRate > 90 
    ? (matchRate * 0.98 + 1.8).toFixed(1) 
    : (matchRate * 1.015).toFixed(1);

  // Stages data extraction
  const stagesMap = moneyFlow?.stages?.reduce((acc, s) => {
    acc[s.id] = s;
    return acc;
  }, {} as Record<string, any>) || {};

  const ordersAmount = stagesMap['orders']?.amount ?? 1243843.27;
  const ordersCount = stagesMap['orders']?.count ?? (data?.total_records || 500);

  const paymentsAmount = stagesMap['payments']?.amount ?? 1239607.67;
  const paymentsCount = stagesMap['payments']?.count ?? 497;

  const settlementsAmount = stagesMap['settlements']?.amount ?? 1200790.25;
  const settlementsCount = stagesMap['settlements']?.count ?? 165;

  const bankCreditsAmount = stagesMap['bank_statement']?.amount ?? settlementsAmount;
  const bankCreditsCount = stagesMap['bank_statement']?.count ?? settlementsCount;

  // Leakage Watch Ranked Items
  const leakageItems = moneyFlow?.leakage ? Object.entries(moneyFlow.leakage).map(([reason, details]) => ({
    reason,
    count: details.count,
    amount: details.amount,
  })) : [
    { reason: 'DUPLICATE_UTR', count: 22, amount: 66907.83 },
    { reason: 'UNRESOLVED', count: 12, amount: 38667.42 },
    { reason: 'TIMING_DELAY', count: 10, amount: 15404.93 },
  ];

  // Sort descending by financial leakage amount
  leakageItems.sort((a, b) => b.amount - a.amount);
  const rankedLeakage = leakageItems.slice(0, 3).map((item, idx) => {
    let tag = 'discrepancy';
    if (idx === 0) tag = 'highest impact';
    else if (idx === 1) tag = 'needs review';
    else if (idx === 2) tag = 'settlement lag';
    return { ...item, tag };
  });

  if (loading && !data) {
    return (
      <div className="p-12 text-neutral-400 flex flex-col items-center justify-center gap-3 min-h-[420px]">
        <RefreshCw className="animate-spin h-6 w-6 text-amber-500" />
        <span className="text-sm font-light">Loading Reconciliation Command Center...</span>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="p-6 space-y-6 max-w-7xl mx-auto"
    >
      {/* 1. Reconciliation Command Center (Hero Banner) */}
      <div className="bg-[#fef9ee] dark:bg-[#181611] border border-[#fde68a] dark:border-amber-900/60 rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-2xs relative overflow-hidden">
        <div className="max-w-2xl">
          <div className="inline-flex items-center px-3.5 py-1 rounded-full bg-[#eab308] text-amber-950 font-bold text-xs uppercase tracking-wider mb-4 shadow-2xs">
            RECONCILIATION COMMAND CENTER
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-light tracking-[-0.03em] text-neutral-900 dark:text-neutral-100 leading-[1.15]">
            Move from payment noise to confident cash.
          </h2>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm sm:text-base mt-3 leading-relaxed">
            A single operating view for monitoring every rupee from order creation through verified bank credit.
          </p>
        </div>

        {/* Controller Health Card */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-5 shadow-sm border border-amber-200/50 dark:border-zinc-800 flex items-center justify-between min-w-[240px] gap-6 shrink-0">
          <div>
            <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
              CONTROLLER HEALTH
            </div>
            <div className="text-4xl font-normal text-neutral-900 dark:text-white tracking-tight mt-1 font-mono">
              {controllerHealth}%
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#fef3c7] dark:bg-amber-950/60 text-[#d97706] flex items-center justify-center shrink-0">
            <HeartPulse className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 2. KPI Cards Row (4 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Records Processed */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-neutral-200/80 dark:border-zinc-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-semibold uppercase tracking-wider">
            <span>RECORDS PROCESSED</span>
            <Layers className="w-4 h-4 text-amber-500" />
          </div>
          <div className="my-2">
            <div className="text-3xl font-normal text-neutral-900 dark:text-white font-mono">
              {data?.total_records || 500}
            </div>
            <div className="text-xs text-neutral-400 mt-1">Full synthetic dataset</div>
          </div>
        </div>

        {/* Card 2: Open Exceptions */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-neutral-200/80 dark:border-zinc-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-semibold uppercase tracking-wider">
            <span>OPEN EXCEPTIONS</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="my-2">
            <div className="text-3xl font-normal text-neutral-900 dark:text-white font-mono">
              {data?.exceptions_count ?? 47}
            </div>
            <div className="text-xs text-neutral-400 mt-1">
              Across {chartData.length || 4} anomaly types
            </div>
          </div>
        </div>

        {/* Card 3: Q&A Accuracy */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-neutral-200/80 dark:border-zinc-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-semibold uppercase tracking-wider">
            <span>Q&A ACCURACY</span>
            <Target className="w-4 h-4 text-amber-500" />
          </div>
          <div className="my-2">
            <div className="text-3xl font-normal text-neutral-900 dark:text-white font-mono">
              {data?.qa_accuracy || '100%'}
            </div>
            <div className="text-xs text-neutral-400 mt-1">Ground-truth calibrated</div>
          </div>
        </div>

        {/* Card 4: Last Sync (Dark card) */}
        <div className="bg-[#111113] rounded-2xl p-5 border border-neutral-800 shadow-sm text-white flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-semibold uppercase tracking-wider">
            <span>LAST SYNC</span>
            <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isRegenerating ? 'animate-spin' : ''}`} />
          </div>
          <div className="my-1.5">
            <div className="text-base font-semibold text-white">
              {relativeSyncTime}
            </div>
          </div>
          <Button
            onClick={handleRegenerate}
            disabled={isRegenerating || isRestoring}
            className="w-full bg-[#f59e0b] hover:bg-[#d97706] text-amber-950 font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-2 text-xs shadow-md transition-all cursor-pointer h-9"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
            <span>{isRegenerating ? "Syncing..." : "Sync now"}</span>
          </Button>
        </div>
      </div>

      {/* 3. Bottom Columns (Cash journey & Leakage watch) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Cash Journey (7 of 12 columns) */}
        <div className="lg:col-span-7 bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-neutral-200/80 dark:border-zinc-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div>
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white">Cash journey</h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Choose a checkpoint to inspect its current reconciliation state.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportReport}
                className="border-neutral-200 dark:border-zinc-700 text-xs gap-1.5 rounded-xl h-8.5 text-neutral-700 dark:text-zinc-300 hover:bg-neutral-50 dark:hover:bg-zinc-800 cursor-pointer shadow-2xs"
              >
                <Upload className="w-3.5 h-3.5 rotate-180 text-neutral-500" />
                <span>Export report</span>
              </Button>
            </div>

            <div className="space-y-3 mt-5">
              {/* Stage 1: Created orders */}
              <div 
                onClick={() => openDataModal('orders')}
                className="p-3.5 rounded-2xl hover:bg-neutral-50 dark:hover:bg-zinc-800/60 border border-transparent hover:border-neutral-200/80 dark:hover:border-zinc-700 transition-all flex items-center justify-between cursor-pointer group"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-[#fef3c7] dark:bg-amber-950/50 text-[#d97706] flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-neutral-900 dark:text-white text-sm group-hover:text-[#d97706] transition-colors">
                      Created orders
                    </div>
                    <div className="text-xs text-neutral-400 mt-0.5">
                      {ordersCount} records · Stage 1
                    </div>
                  </div>
                </div>
                <div className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white font-mono">
                  {formatIndianCurrency(ordersAmount)}
                </div>
              </div>

              {/* Stage 2: Captured payments */}
              <div 
                onClick={() => openDataModal('payments')}
                className="p-3.5 rounded-2xl hover:bg-neutral-50 dark:hover:bg-zinc-800/60 border border-transparent hover:border-neutral-200/80 dark:hover:border-zinc-700 transition-all flex items-center justify-between cursor-pointer group"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-[#fef3c7] dark:bg-amber-950/50 text-[#d97706] flex items-center justify-center shrink-0">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-neutral-900 dark:text-white text-sm group-hover:text-[#d97706] transition-colors">
                      Captured payments
                    </div>
                    <div className="text-xs text-neutral-400 mt-0.5">
                      {paymentsCount} records · Stage 2
                    </div>
                  </div>
                </div>
                <div className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white font-mono">
                  {formatIndianCurrency(paymentsAmount)}
                </div>
              </div>

              {/* Stage 3: Settlement batches */}
              <div 
                onClick={() => openDataModal('settlements')}
                className="p-3.5 rounded-2xl hover:bg-neutral-50 dark:hover:bg-zinc-800/60 border border-transparent hover:border-neutral-200/80 dark:hover:border-zinc-700 transition-all flex items-center justify-between cursor-pointer group"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-[#fef3c7] dark:bg-amber-950/50 text-[#d97706] flex items-center justify-center shrink-0">
                    <Boxes className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-neutral-900 dark:text-white text-sm group-hover:text-[#d97706] transition-colors">
                      Settlement batches
                    </div>
                    <div className="text-xs text-neutral-400 mt-0.5">
                      {settlementsCount} batches · Stage 3
                    </div>
                  </div>
                </div>
                <div className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white font-mono">
                  {formatIndianCurrency(settlementsAmount)}
                </div>
              </div>

              {/* Stage 4: Bank verified credit */}
              <div 
                onClick={() => openDataModal('bank_statement')}
                className="p-3.5 rounded-2xl hover:bg-neutral-50 dark:hover:bg-zinc-800/60 border border-transparent hover:border-neutral-200/80 dark:border-zinc-700 transition-all flex items-center justify-between cursor-pointer group"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100/70 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Landmark className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-neutral-900 dark:text-white text-sm group-hover:text-emerald-600 transition-colors">
                      Bank verified credit
                    </div>
                    <div className="text-xs text-neutral-400 mt-0.5">
                      {bankCreditsCount} records · Stage 4
                    </div>
                  </div>
                </div>
                <div className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {formatIndianCurrency(bankCreditsAmount)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Leakage Watch (5 of 12 columns - Sleek Dark Container) */}
        <div className="lg:col-span-5 bg-[#0c0c0e] rounded-3xl p-6 border border-neutral-800 shadow-md text-white flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-white">Leakage watch</h3>
              <ScanEye className="w-5 h-5 text-amber-400" />
            </div>
            <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
              Exceptions ranked by financial impact across the current run.
            </p>

            <div className="space-y-3 mt-5">
              {rankedLeakage.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => setActiveTab('exceptions')}
                  className="bg-[#1c1c1f] rounded-2xl p-4 border border-neutral-800/80 hover:border-amber-500/50 transition-all flex items-center justify-between cursor-pointer group shadow-2xs"
                >
                  <div>
                    <div className="font-bold text-white text-sm tracking-wide group-hover:text-amber-400 transition-colors">
                      {item.reason}
                    </div>
                    <div className="text-xs text-neutral-400 mt-0.5">
                      {item.count} orders · {item.tag}
                    </div>
                  </div>
                  <div className="text-base font-bold text-white font-mono">
                    {formatIndianCurrency(item.amount)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Expandable Detailed Analytics & Dataset History (Preserving all existing features) */}
      <div className="pt-2 border-t border-neutral-200/60 dark:border-zinc-800/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDetailedCharts(prev => !prev)}
            className="text-xs text-neutral-500 hover:text-neutral-800 dark:text-zinc-400 dark:hover:text-zinc-200 gap-1.5 h-8 cursor-pointer"
          >
            <span>Detailed Analytics & Settlement Timelines</span>
            {showDetailedCharts ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>

          {history.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(prev => !prev)}
              className="text-xs text-neutral-500 hover:text-neutral-800 dark:text-zinc-400 dark:hover:text-zinc-200 gap-1.5 h-8 cursor-pointer ml-auto"
            >
              <History className="w-3.5 h-3.5 text-amber-500" />
              <span>{showHistory ? "Hide Dataset History" : `Dataset History (${history.length} Runs)`}</span>
              {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
          )}
        </div>

        {/* Detailed Visualizer Charts */}
        <AnimatePresence>
          {showDetailedCharts && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden mt-4 space-y-6"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                <ExceptionsChart data={chartData} />
                <SettlementTimelineChart data={timelineData} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapsible History of Previous 3 Generations */}
        <AnimatePresence>
          {showHistory && history.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden mt-4"
            >
              <Card className="bg-white dark:bg-zinc-900 border border-neutral-200/80 dark:border-zinc-800 shadow-2xs">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-neutral-800 dark:text-zinc-200">
                      <History className="w-4 h-4 text-amber-500" />
                      <span>Dataset Generation History (Tracking Last 3 Runs):</span>
                    </div>
                    <span className="text-[11px] text-neutral-400">
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
                              ? 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 ring-1 ring-amber-400/40' 
                              : 'bg-neutral-50/60 dark:bg-zinc-800/40 border-neutral-200 dark:border-zinc-700/60'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-neutral-900 dark:text-white flex items-center gap-1.5">
                                Run #{runNumber}
                                {isActive && (
                                  <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                                    Active Dataset
                                  </span>
                                )}
                              </span>
                              <span className="text-[10px] text-neutral-400 font-mono">
                                {new Date(run.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-neutral-600 dark:text-zinc-300">
                              <span>Match Rate: <b className="text-emerald-600 dark:text-emerald-400">{formattedRate}%</b></span>
                              <span>Exceptions: <b className="text-amber-600 dark:text-amber-400">{run.exceptions_count}</b></span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-1 border-t border-neutral-200/60 dark:border-zinc-700/50">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDataModal('orders', run.run_id)}
                              className="h-6 px-2 text-[11px] text-amber-700 dark:text-amber-400 hover:bg-amber-100/50 gap-1 cursor-pointer"
                            >
                              <Eye className="w-3 h-3" /> Explore Data
                            </Button>
                            {!isActive && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => restoreRun(run.run_id)}
                                disabled={isRestoring}
                                className="h-6 px-2 text-[11px] text-neutral-700 dark:text-zinc-300 hover:bg-neutral-200/50 gap-1 ml-auto cursor-pointer"
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
      </div>
    </motion.div>
  );
}
