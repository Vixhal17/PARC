import { useState, useEffect, Fragment } from 'react';
import { RefreshCw, Play, Database, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { apiClient } from '../api/client';
import { useData } from '../context/DataContext';
import type { EvalResult } from '../types';
import { Button } from '../components/ui/button';
import { KpiCard } from '../components/custom/KpiCard';
import { CalibrationChart } from '../components/custom/CalibrationChart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { stripMarkdown } from '../lib/utils';

export default function EvalResults() {
  const { generationKey, openDataModal } = useData();
  const [results, setResults] = useState<EvalResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expandedQid, setExpandedQid] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await apiClient.getEvalResults();
      if (data && Object.keys(data).length > 0) {
        setResults(data);
      } else {
        setResults(null);
      }
    } catch (error) {
      console.error("Failed to load eval results:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [generationKey]);

  const handleRunEval = async () => {
    setRunning(true);
    const toastId = toast.loading("Running evaluation suite across 15 test questions against ground truth...", {
      description: "Evaluating deterministic queries & refuting non-existent IDs."
    });

    try {
      await apiClient.runEval();
      await loadData();
      toast.success("Evaluation suite complete! Calibration metrics updated.", { id: toastId });
    } catch (error) {
      console.error("Failed to run eval:", error);
      toast.error("Evaluation run failed. Please check backend connection.", { id: toastId });
    } finally {
      setRunning(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6 space-y-8 max-w-7xl mx-auto"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-light tracking-[-0.64px] text-[#0d253d] dark:text-white">Agent Evaluation</h2>
          <p className="font-light text-sm text-[#64748d] dark:text-zinc-400 mt-1">
            Accuracy and confidence calibration against the ground-truth Q&A set. Click any question row to inspect full structured synthesis.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => openDataModal('ground_truth')}
            className="border-indigo-200 dark:border-indigo-900 text-[#533afd] dark:text-indigo-300 hover:bg-indigo-50 text-xs gap-1.5 h-10"
          >
            <Database className="w-4 h-4 text-[#533afd]" />
            View Ground Truth
          </Button>

          <Button onClick={handleRunEval} disabled={running} size="lg" className="bg-[#533afd] hover:bg-[#4434d4] text-white">
            {running ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            {running ? "Running Evaluation..." : "Run Evaluation Suite"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[#64748d]">
          <RefreshCw className="animate-spin h-5 w-5 text-[#533afd]" /> Loading evaluation results...
        </div>
      ) : !results ? (
        <div className="text-[#64748d] p-8 text-center border border-[#e3e8ee] rounded-lg border-dashed">
          No evaluation results found. Click "Run Evaluation Suite" to generate them.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <KpiCard label="Overall Accuracy" value={results.accuracy} suffix="%" animateCountUp={true} decimalPlaces={2} />
            <KpiCard label="Verified Rate" value={results.verified_rate} suffix="%" animateCountUp={true} decimalPlaces={2} />
            <KpiCard label="Avg Latency" value={results.avg_elapsed_seconds} suffix="s" animateCountUp={true} decimalPlaces={2} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <CalibrationChart calibration={results.calibration} />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-light tracking-[-0.26px] text-[#0d253d] dark:text-white">Question-by-Question Breakdown</h3>
              <span className="text-xs text-[#64748d] dark:text-zinc-400">
                💡 Click any question row to expand full structured answer & details
              </span>
            </div>

            <div className="border border-[#e3e8ee] dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 stripe-shadow-1">
              <Table className="w-full table-fixed">
                <TableHeader className="bg-[#f6f9fc] dark:bg-zinc-950">
                  <TableRow>
                    <TableHead className="w-[55px] text-xs font-semibold">Q ID</TableHead>
                    <TableHead className="w-[28%] text-xs font-semibold">Question</TableHead>
                    <TableHead className="w-[14%] text-xs font-semibold">Expected</TableHead>
                    <TableHead className="w-[28%] text-xs font-semibold">Actual</TableHead>
                    <TableHead className="w-[115px] text-xs font-semibold">Confidence</TableHead>
                    <TableHead className="w-[85px] text-xs font-semibold">Verified?</TableHead>
                    <TableHead className="w-[75px] text-right text-xs font-semibold">Match?</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(results.details || {}).map(([qid, detail]) => {
                    const isExpanded = expandedQid === qid;

                    return (
                      <Fragment key={qid}>
                        <TableRow 
                          onClick={() => setExpandedQid(prev => prev === qid ? null : qid)}
                          className={`cursor-pointer transition-colors ${
                            isExpanded 
                              ? 'bg-indigo-50/50 dark:bg-indigo-950/40 border-l-4 border-l-indigo-600' 
                              : 'hover:bg-slate-50/80 dark:hover:bg-zinc-800/40'
                          }`}
                        >
                          <TableCell className="font-medium text-xs tnum align-top">
                            <div className="flex items-center gap-1">
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-indigo-600" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                              <span>{qid}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-normal text-[#0d253d] dark:text-zinc-200 align-top leading-relaxed">
                            {detail.question}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-[#64748d] dark:text-zinc-400 tnum align-top break-words">
                            {detail.expected}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-[#64748d] dark:text-zinc-400 tnum align-top">
                            <div className="line-clamp-2 leading-relaxed" title={stripMarkdown(detail.actual)}>
                              {stripMarkdown(detail.actual)}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge variant="outline" className={
                              detail.confidence === "HIGH" || detail.confidence === "Resolved" ? "text-emerald-700 border-emerald-200 bg-emerald-50/50 text-[11px]" :
                              detail.confidence === "MEDIUM" || detail.confidence === "Partially Resolved" ? "text-amber-700 border-amber-200 bg-amber-50/50 text-[11px]" :
                              "text-rose-700 border-rose-200 bg-rose-50/50 text-[11px]"
                            }>
                              {detail.confidence}
                            </Badge>
                          </TableCell>
                          <TableCell className="align-top">
                            {detail.verified === "not_applicable" ? (
                              <span className="text-[11px] text-[#64748d] bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded font-medium">N/A</span>
                            ) : detail.verified ? (
                              <span className="text-emerald-600 font-semibold text-xs flex items-center gap-1">✓ Yes</span>
                            ) : (
                              <span className="text-rose-600 font-semibold text-xs flex items-center gap-1">✗ No</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right align-top">
                            {detail.is_match ? (
                              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 border-0 font-semibold text-xs">Pass</Badge>
                            ) : (
                              <Badge variant="destructive" className="font-semibold text-xs">Fail</Badge>
                            )}
                          </TableCell>
                        </TableRow>

                        {/* Expandable Full Structured View */}
                        {isExpanded && (
                          <TableRow key={`${qid}-expanded`} className="bg-slate-50/60 dark:bg-zinc-950/60">
                            <TableCell colSpan={7} className="p-4">
                              <motion.div
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -5 }}
                                className="bg-white dark:bg-zinc-900 border border-indigo-200/80 dark:border-indigo-900/60 rounded-xl p-5 shadow-sm space-y-4"
                              >
                                {/* Header Info */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200/80 dark:border-zinc-800">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/70 px-2.5 py-1 rounded text-xs">
                                      {qid}
                                    </span>
                                    <h4 className="font-semibold text-sm text-[#0d253d] dark:text-white">
                                      {detail.question}
                                    </h4>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className={
                                      detail.confidence === "HIGH" || detail.confidence === "Resolved" ? "text-emerald-700 border-emerald-200 bg-emerald-50 text-xs" :
                                      detail.confidence === "MEDIUM" || detail.confidence === "Partially Resolved" ? "text-amber-700 border-amber-200 bg-amber-50 text-xs" :
                                      "text-rose-700 border-rose-200 bg-rose-50 text-xs"
                                    }>
                                      {detail.confidence} Confidence
                                    </Badge>
                                    <Badge className={detail.is_match ? "bg-emerald-100 text-emerald-800 border-0 text-xs" : "bg-rose-100 text-rose-800 border-0 text-xs"}>
                                      {detail.is_match ? "✓ Match Pass" : "✗ Match Fail"}
                                    </Badge>
                                  </div>
                                </div>

                                {/* Comparison Grid */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                  {/* Expected Ground Truth */}
                                  <div className="space-y-1.5 lg:col-span-1">
                                    <div className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                                      Expected Ground Truth
                                    </div>
                                    <div className="p-3 bg-slate-50 dark:bg-zinc-950 rounded-lg border border-slate-200 dark:border-zinc-800 text-xs font-mono text-slate-800 dark:text-zinc-200 whitespace-pre-wrap break-words leading-relaxed">
                                      {detail.expected}
                                    </div>
                                  </div>

                                  {/* Actual Agent Response */}
                                  <div className="space-y-1.5 lg:col-span-2">
                                    <div className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                                      <span>Actual AI Synthesis (Full Structured Output)</span>
                                      {detail.verified !== "not_applicable" && (
                                        <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                          <CheckCircle className="w-3.5 h-3.5" /> Verified via APIs
                                        </span>
                                      )}
                                    </div>
                                    
                                    <div className="p-4 bg-[#f8fafc] dark:bg-zinc-950 rounded-lg border border-slate-200 dark:border-zinc-800 text-xs leading-relaxed text-[#0d253d] dark:text-zinc-100 overflow-x-auto">
                                      <div className="prose prose-sm dark:prose-invert max-w-none space-y-2 [&_table]:w-full [&_table]:border-collapse [&_table]:my-2.5 [&_th]:bg-indigo-50/90 [&_th]:dark:bg-zinc-800 [&_th]:p-2.5 [&_th]:border [&_th]:border-slate-200 [&_th]:dark:border-zinc-700 [&_td]:p-2.5 [&_td]:border [&_td]:border-slate-200 [&_td]:dark:border-zinc-700 [&_th]:text-left [&_th]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-indigo-900 [&_h3]:dark:text-indigo-300 [&_h3]:mt-3 [&_h3]:mb-1.5 [&_p]:my-1">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                          {detail.actual}
                                        </ReactMarkdown>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}
