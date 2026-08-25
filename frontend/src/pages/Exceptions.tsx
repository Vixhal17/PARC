import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Search, Database, Bot, ArrowRight, CheckCircle2, Copy } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { apiClient } from '../api/client';
import { useData } from '../context/DataContext';
import type { ExceptionRecord } from '../types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

const REASON_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  AMOUNT_MISMATCH: { bg: "bg-amber-50 dark:bg-amber-950/60", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800" },
  DUPLICATE_UTR: { bg: "bg-blue-50 dark:bg-blue-950/60", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200 dark:border-blue-800" },
  MISSING_PAYMENT: { bg: "bg-purple-50 dark:bg-purple-950/60", text: "text-purple-700 dark:text-purple-300", border: "border-purple-200 dark:border-purple-800" },
  MISSING_SETTLEMENT: { bg: "bg-pink-50 dark:bg-pink-950/60", text: "text-pink-700 dark:text-pink-300", border: "border-pink-200 dark:border-pink-800" },
  TIMING_DELAY: { bg: "bg-emerald-50 dark:bg-emerald-950/60", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800" },
  UNRESOLVED: { bg: "bg-rose-50 dark:bg-rose-950/60", text: "text-rose-700 dark:text-rose-300", border: "border-rose-200 dark:border-rose-800" }
};

export default function Exceptions() {
  const { generationKey, openDataModal, askAgentWithQuestion } = useData();
  const [exceptions, setExceptions] = useState<ExceptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterReason, setFilterReason] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [allExceptionsForCount, setAllExceptionsForCount] = useState<ExceptionRecord[]>([]);

  useEffect(() => {
    loadData(filterReason);
  }, [filterReason, generationKey]);

  const loadData = async (reason: string) => {
    setLoading(true);
    try {
      const data = await apiClient.getExceptions(reason);
      setExceptions(data);

      if (reason === "All") {
        setAllExceptionsForCount(data);
      }
    } catch (error) {
      console.error("Failed to load exceptions:", error);
    } finally {
      setLoading(false);
    }
  };

  const reasonCounts = useMemo(() => {
    const counts: Record<string, number> = { All: allExceptionsForCount.length };
    allExceptionsForCount.forEach(e => {
      counts[e.reason] = (counts[e.reason] || 0) + 1;
    });
    return counts;
  }, [allExceptionsForCount]);

  const filteredExceptions = useMemo(() => {
    if (!searchQuery.trim()) return exceptions;
    const q = searchQuery.toLowerCase().trim();
    return exceptions.filter(e => 
      (e.order_id && e.order_id.toLowerCase().includes(q)) ||
      (e.payment_id && e.payment_id.toLowerCase().includes(q)) ||
      (e.settlement_id && e.settlement_id.toLowerCase().includes(q)) ||
      (e.utr && e.utr.toLowerCase().includes(q)) ||
      (e.reason && e.reason.toLowerCase().includes(q)) ||
      (e.description && e.description.toLowerCase().includes(q))
    );
  }, [exceptions, searchQuery]);

  const formatCurrency = (val: number | null | string) => {
    if (val === null || val === "N/A" || isNaN(Number(val))) return val || "N/A";
    return `₹${Number(val).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${label}: ${text}`);
  };

  const uniqueReasons = Object.keys(reasonCounts).filter(r => r !== 'All');

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6 space-y-6 max-w-7xl mx-auto"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-3xl font-light tracking-[-0.64px] text-[#0d253d] dark:text-white">
              Exceptions Hub
            </h2>
            <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 text-xs">
              {allExceptionsForCount.length} Discrepancies
            </Badge>
          </div>
          <p className="font-light text-sm text-[#64748d] dark:text-zinc-400 mt-1">
            Reconciliation failure triage: Click "Ask Agent" on any record to query the AI diagnostic engine instantly.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => openDataModal('reconciled')}
          className="border-indigo-200 dark:border-indigo-900 text-[#533afd] dark:text-indigo-300 hover:bg-indigo-50 text-xs gap-1.5 h-9 shadow-xs"
        >
          <Database className="w-4 h-4 text-[#533afd]" />
          View Raw Synthetic Data
        </Button>
      </div>

      {/* Filter Chips Bar & Search Input */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Category Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          <Button
            size="sm"
            variant={filterReason === "All" ? "default" : "outline"}
            onClick={() => setFilterReason("All")}
            className={`text-xs h-8 rounded-full px-3 gap-1.5 ${
              filterReason === "All" 
                ? "bg-[#533afd] text-white hover:bg-[#4434d4]" 
                : "border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-50"
            }`}
          >
            <span>All</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20 font-bold">
              {reasonCounts.All || 0}
            </span>
          </Button>

          {uniqueReasons.map(r => {
            const count = reasonCounts[r] || 0;
            const isSelected = filterReason === r;

            return (
              <Button
                key={r}
                size="sm"
                variant={isSelected ? "default" : "outline"}
                onClick={() => setFilterReason(r)}
                className={`text-xs h-8 rounded-full px-3 gap-1.5 whitespace-nowrap ${
                  isSelected 
                    ? "bg-[#533afd] text-white hover:bg-[#4434d4]" 
                    : "border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-50"
                }`}
              >
                <span>{r}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-zinc-700 text-slate-800 dark:text-zinc-200 font-semibold">
                  {count}
                </span>
              </Button>
            );
          })}
        </div>

        {/* Live Search Input */}
        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Order, Payment or UTR..."
            className="pl-9 h-8.5 text-xs rounded-full border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
          />
        </div>
      </div>

      {loading && exceptions.length === 0 ? (
        <div className="flex items-center gap-2 text-[#64748d] p-8">
          <RefreshCw className="animate-spin h-5 w-5 text-[#533afd]" /> Loading exceptions...
        </div>
      ) : filteredExceptions.length === 0 ? (
        <Card className="bg-slate-50 dark:bg-zinc-900 border-dashed border-slate-200 dark:border-zinc-800">
          <CardContent className="p-8 text-center text-slate-500 text-xs">
            {searchQuery ? `No exception found matching "${searchQuery}"` : "✓ Clean dataset — 0 exceptions in this category!"}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Accordion className="w-full space-y-3">
            {filteredExceptions.map((exc, idx) => {
              const reasonStyle = REASON_COLORS[exc.reason] || { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" };

              return (
                <AccordionItem 
                  key={idx} 
                  value={`item-${idx}`} 
                  className="border border-[#e3e8ee] dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 rounded-xl stripe-shadow-1 px-4 overflow-hidden transition-all hover:border-indigo-300 dark:hover:border-indigo-800"
                >
                  <AccordionTrigger className="hover:no-underline py-3.5">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 text-left w-full pr-3">
                      <Badge variant="outline" className={`w-fit font-semibold text-[11px] ${reasonStyle.bg} ${reasonStyle.text} ${reasonStyle.border}`}>
                        {exc.reason}
                      </Badge>
                      <span className="font-medium text-xs sm:text-sm text-[#0d253d] dark:text-zinc-100 truncate max-w-md">
                        {exc.description || "Reconciliation discrepancy"}
                      </span>
                      <span className="text-xs font-mono text-[#64748d] dark:text-zinc-400 sm:ml-auto tnum">
                        {exc.order_id}
                      </span>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="pt-2 pb-4 text-xs text-[#64748d] dark:text-zinc-400 space-y-4 border-t border-slate-100 dark:border-zinc-800/60">
                    {/* Action Bar: Ask Agent Button */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-900/60">
                      <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-300 text-xs">
                        <Bot className="w-4 h-4 text-[#533afd]" />
                        <span>Query AI Agent for automated root cause analysis & refund status:</span>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => askAgentWithQuestion(`Why did ${exc.order_id} fail reconciliation?`)}
                        className="bg-[#533afd] hover:bg-[#4434d4] text-white text-xs h-7 gap-1 px-2.5 shadow-xs"
                      >
                        <span>Ask Agent About {exc.order_id}</span>
                        <ArrowRight className="w-3 h-3" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                      <div className="space-y-2 p-3 bg-slate-50 dark:bg-zinc-950 rounded-lg border border-slate-200 dark:border-zinc-800">
                        <h4 className="font-semibold text-xs text-[#0d253d] dark:text-zinc-200">Affected Financial Identifiers:</h4>
                        <div className="space-y-1 font-mono text-xs text-slate-700 dark:text-zinc-300">
                          <div className="flex justify-between items-center">
                            <span>Order ID:</span>
                            <span className="flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400">
                              {exc.order_id}
                              <button onClick={() => copyToClipboard(exc.order_id, "Order ID")} title="Copy">
                                <Copy className="w-3 h-3 text-slate-400 hover:text-slate-600" />
                              </button>
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Payment ID:</span>
                            <span>{exc.payment_id || "N/A"}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Settlement ID:</span>
                            <span>{exc.settlement_id || "N/A"}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>UTR:</span>
                            <span className="text-amber-700 dark:text-amber-400 font-bold">{exc.utr || "N/A"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 p-3 bg-slate-50 dark:bg-zinc-950 rounded-lg border border-slate-200 dark:border-zinc-800">
                        <h4 className="font-semibold text-xs text-[#0d253d] dark:text-zinc-200">Amounts & Variances:</h4>
                        <div className="space-y-1 font-mono text-xs text-slate-700 dark:text-zinc-300">
                          <div className="flex justify-between items-center">
                            <span>Order Amount:</span>
                            <b>{formatCurrency(exc.amount)}</b>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Settled Amount:</span>
                            <b>{formatCurrency(exc.settled_amount)}</b>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Credited Amount:</span>
                            <b className="text-emerald-600 dark:text-emerald-400">{formatCurrency(exc.credited_amount)}</b>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Diagnostic Checklist */}
                    <div className="bg-slate-50/80 dark:bg-zinc-950/80 p-3 rounded-lg border border-slate-200 dark:border-zinc-800">
                      <h4 className="font-semibold text-xs text-slate-800 dark:text-zinc-200 mb-2 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Deterministic Reconciliation Checks Performed:</span>
                      </h4>
                      <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-zinc-400 text-xs">
                        {exc.checked_steps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      )}
    </motion.div>
  );
}
