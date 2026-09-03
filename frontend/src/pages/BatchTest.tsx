import { useState, useRef, useEffect, Fragment, type ChangeEvent } from 'react';
import { Play, CheckCircle, XCircle, Plus, X, RotateCcw, Upload, ChevronDown, ChevronUp } from 'lucide-react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiClient } from '../api/client';
import type { BatchTestResponse } from '../types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Progress } from '../components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { KpiCard } from '../components/custom/KpiCard';
import { stripMarkdown } from '../lib/utils';

import { useData } from '../context/DataContext';

const DEFAULT_QUESTIONS = [
  "What is the status of our latest clean orders?",
  "Why did recent exceptions fail reconciliation?",
  "How many DUPLICATE_UTR exceptions do we have?",
  "How many MISSING_PAYMENT exceptions are recorded?",
  "What is the total settled amount for all records?"
];

export default function BatchTest() {
  const { openDataModal, generationKey } = useData();
  const [questions, setQuestions] = useState<string[]>([...DEFAULT_QUESTIONS]);
  const [results, setResults] = useState<BatchTestResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    apiClient.getDefaultBatchQuestions().then(activeQuestions => {
      if (activeQuestions && activeQuestions.length > 0) {
        setQuestions(activeQuestions);
      }
    }).catch(() => {});
  }, [generationKey]);

  const handleUpdateQuestion = (index: number, value: string) => {
    const updated = [...questions];
    updated[index] = value;
    setQuestions(updated);
  };

  const handleAddQuestion = () => {
    setQuestions([...questions, ""]);
  };

  const handleRemoveQuestion = (index: number) => {
    if (questions.length <= 1) {
      setQuestions([""]);
      return;
    }
    const updated = questions.filter((_, i) => i !== index);
    setQuestions(updated);
  };

  const handleResetDefaults = () => {
    setResults(null);
    apiClient.getDefaultBatchQuestions().then(activeQuestions => {
      if (activeQuestions && activeQuestions.length > 0) {
        setQuestions(activeQuestions);
      } else {
        setQuestions([...DEFAULT_QUESTIONS]);
      }
    }).catch(() => {
      setQuestions([...DEFAULT_QUESTIONS]);
    });
  };

  const handleCsvUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const rawLines = content.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
      const parsedQuestions: string[] = [];

      for (let i = 0; i < rawLines.length; i++) {
        let line = rawLines[i];
        // Strip quotes if present
        if ((line.startsWith('"') && line.endsWith('"')) || (line.startsWith("'") && line.endsWith("'"))) {
          line = line.substring(1, line.length - 1).trim();
        }
        // If line is header like "question" or "query", skip first row
        if (i === 0 && (line.toLowerCase() === "question" || line.toLowerCase() === "query" || line.toLowerCase() === "questions")) {
          continue;
        }
        if (line) {
          parsedQuestions.push(line);
        }
      }

      if (parsedQuestions.length > 0) {
        setQuestions(parsedQuestions);
      }
    };
    reader.readAsText(file);
    // Reset file input so user can re-upload same file if needed
    if (e.target) e.target.value = "";
  };

  const handleRunBatch = async () => {
    const validQuestions = questions.map(q => q.trim()).filter(q => q.length > 0);
    if (validQuestions.length === 0) return;

    setRunning(true);
    setProgress(0);
    
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 95) return 95;
        const remaining = 100 - prev;
        return prev + Math.max(1, remaining * 0.05);
      });
    }, 600);

    try {
      const data = await apiClient.runBatchTest(validQuestions);
      setProgress(100);
      setResults(data);
    } catch (error) {
      console.error("Failed to run batch test:", error);
      setProgress(0);
    } finally {
      clearInterval(progressInterval);
      setRunning(false);
    }
  };

  const validQuestionCount = questions.filter(q => q.trim().length > 0).length;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6 space-y-8 max-w-7xl mx-auto"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-light tracking-[-0.64px] text-[#0d253d] dark:text-white">Batch Testing</h2>
          <p className="font-light text-sm text-[#64748d] dark:text-zinc-400 mt-1">
            Configure custom test queries and evaluate agent performance at scale.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => openDataModal('orders')}
            className="border-indigo-200 dark:border-indigo-900 text-[#533afd] dark:text-indigo-300 hover:bg-indigo-50 text-xs gap-1.5 h-10"
          >
            View Synthetic Dataset
          </Button>

          <Button onClick={handleRunBatch} disabled={running || validQuestionCount === 0} size="lg" className="bg-[#533afd] hover:bg-[#4434d4] text-white shadow-sm">
            {running ? <span className="mr-2 animate-pulse w-2 h-2 rounded-full bg-current"></span> : <Play className="mr-2 h-4 w-4" />}
            {running ? `Running Batch (${validQuestionCount})...` : `Run Batch Test (${validQuestionCount})`}
          </Button>
        </div>
      </div>

      {/* Editable Questions Card */}
      <Card className="border border-[#e3e8ee] bg-white dark:bg-zinc-900 stripe-shadow-1">
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#e3e8ee] pb-4">
          <div>
            <CardTitle className="text-lg font-light tracking-tight text-[#0d253d] dark:text-white">
              Test Suite Queries ({validQuestionCount})
            </CardTitle>
            <CardDescription className="text-xs text-[#64748d] dark:text-zinc-400 mt-0.5">
              Edit text directly, add/remove rows, or upload a CSV file to replace the batch suite.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <input 
              type="file" 
              accept=".csv,.txt" 
              ref={fileInputRef} 
              onChange={handleCsvUpload} 
              className="hidden" 
            />
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="gap-1.5 text-xs text-[#0d253d] border-[#e3e8ee] hover:bg-[#f6f9fc]"
            >
              <Upload className="w-3.5 h-3.5" /> Upload CSV
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleResetDefaults}
              className="gap-1.5 text-xs text-[#64748d] border-[#e3e8ee] hover:bg-[#f6f9fc]"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset Defaults
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          {questions.map((q, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <span className="w-8 text-center text-xs font-mono font-medium text-[#64748d] dark:text-zinc-400 shrink-0 tnum">
                Q{idx + 1}
              </span>
              <Input
                value={q}
                onChange={(e) => handleUpdateQuestion(idx, e.target.value)}
                placeholder="Type a custom query..."
                disabled={running}
                className="flex-1 rounded-full border-[#a8c3de] focus-visible:border-[#533afd] text-sm px-4 bg-[#f6f9fc] dark:bg-zinc-800 text-[#0d253d] dark:text-zinc-100"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveQuestion(idx)}
                disabled={running}
                className="rounded-full text-[#64748d] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 shrink-0"
                title="Remove question"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}

          <div className="pt-2 flex justify-start">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddQuestion}
              disabled={running}
              className="rounded-full gap-1.5 text-xs text-[#533afd] border-dashed border-[#533afd]/40 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30"
            >
              <Plus className="w-3.5 h-3.5" /> Add Question
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Execution Progress */}
      {running && (
        <Card className="border-[#e3e8ee] bg-[#f6f9fc] dark:border-indigo-900/50 dark:bg-indigo-950/20 stripe-shadow-1">
          <CardContent className="p-6 space-y-4">
            <div className="flex justify-between text-sm font-medium">
              <span className="text-[#0d253d]">Executing the queries...</span>
              <span className="tnum text-[#533afd] font-semibold">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-[#64748d]">
              Running batch queries in sequence.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!running && !results && (
        <Card className="bg-[#f6f9fc] dark:bg-zinc-900/50 border-dashed border-[#e3e8ee]">
          <CardContent className="p-12 text-center text-[#64748d]">
            <p>Click "Run Batch Test" above to execute the configured test queries.</p>
          </CardContent>
        </Card>
      )}

      {/* Results Dashboard */}
      {results && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <KpiCard label="Questions Run" value={results.summary.total_questions} animateCountUp={true} />
            <KpiCard label="Avg Latency" value={results.summary.avg_latency} suffix="s" animateCountUp={true} />
            <KpiCard label="Avg Confidence" value={results.summary.avg_confidence} suffix="%" animateCountUp={true} />
            <KpiCard label="Verified Rate" value={results.summary.verified_rate} suffix="%" animateCountUp={true} />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-zinc-200">Execution Breakdown</h4>
              <span className="text-xs text-[#64748d] dark:text-zinc-400">
                💡 Click any row to expand full structured answer
              </span>
            </div>

            <div className="border border-[#e3e8ee] dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 stripe-shadow-1">
              <Table className="w-full table-fixed">
                <TableHeader className="bg-[#f6f9fc] dark:bg-zinc-950">
                  <TableRow>
                    <TableHead className="w-[30%] text-xs font-semibold">Question</TableHead>
                    <TableHead className="w-[38%] text-xs font-semibold">Answer Summary</TableHead>
                    <TableHead className="w-[12%] text-xs font-semibold">Confidence</TableHead>
                    <TableHead className="w-[10%] text-xs font-semibold">Verified</TableHead>
                    <TableHead className="w-[10%] text-right text-xs font-semibold">Latency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.results.map((res, idx) => {
                    const isExpanded = expandedIdx === idx;
                    return (
                      <Fragment key={idx}>
                        <TableRow 
                          onClick={() => setExpandedIdx(prev => prev === idx ? null : idx)}
                          className={`cursor-pointer transition-colors ${
                            isExpanded 
                              ? 'bg-indigo-50/50 dark:bg-indigo-950/40 border-l-4 border-l-indigo-600' 
                              : 'hover:bg-slate-50/80 dark:hover:bg-zinc-800/40'
                          }`}
                        >
                          <TableCell className="font-medium text-xs align-top text-[#0d253d] dark:text-zinc-100 leading-relaxed">
                            <div className="flex items-start gap-1.5">
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />}
                              <span>{res.question}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-[#64748d] dark:text-zinc-400 align-top">
                            <div className="line-clamp-2 leading-relaxed" title={stripMarkdown(res.answer_summary)}>
                              {stripMarkdown(res.answer_summary)}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge variant="outline" className={
                              res.confidence_label === "HIGH" || res.confidence_label === "Resolved" ? "text-emerald-700 border-emerald-200 bg-emerald-50/50 text-[11px]" :
                              res.confidence_label === "MEDIUM" || res.confidence_label === "Partially Resolved" ? "text-amber-700 border-amber-200 bg-amber-50/50 text-[11px]" :
                              "text-rose-700 border-rose-200 bg-rose-50/50 text-[11px]"
                            }>
                              {res.confidence_label} ({Math.round(res.confidence_score * 100)}%)
                            </Badge>
                          </TableCell>
                          <TableCell className="align-top">
                            {res.verified === "not_applicable" ? (
                              <span className="inline-flex items-center text-[11px] text-[#64748d] bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded font-medium">N/A</span>
                            ) : res.verified ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold">
                                <CheckCircle className="w-3.5 h-3.5" /> Yes
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-rose-700 text-xs font-semibold">
                                <XCircle className="w-3.5 h-3.5" /> No
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right align-top text-xs font-mono text-[#64748d] dark:text-zinc-400">
                            {res.elapsed_seconds.toFixed(2)}s
                          </TableCell>
                        </TableRow>

                        {/* Expandable Full Answer */}
                        {isExpanded && (
                          <TableRow key={`${idx}-expanded`} className="bg-slate-50/60 dark:bg-zinc-950/60">
                            <TableCell colSpan={5} className="p-4">
                              <motion.div
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -5 }}
                                className="bg-white dark:bg-zinc-900 border border-indigo-200 dark:border-indigo-900/60 rounded-xl p-5 shadow-sm space-y-3"
                              >
                                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-zinc-800">
                                  <h4 className="font-semibold text-sm text-[#0d253d] dark:text-white">
                                    Full Synthesis for "{res.question}"
                                  </h4>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline">
                                      {res.confidence_label}
                                    </Badge>
                                    <span className="text-xs font-mono text-slate-500">
                                      {res.elapsed_seconds.toFixed(2)}s
                                    </span>
                                  </div>
                                </div>

                                <div className="p-4 bg-[#f8fafc] dark:bg-zinc-950 rounded-lg border border-slate-200 dark:border-zinc-800 text-xs leading-relaxed text-[#0d253d] dark:text-zinc-100 overflow-x-auto">
                                  <div className="prose prose-sm dark:prose-invert max-w-none space-y-2 [&_table]:w-full [&_table]:border-collapse [&_table]:my-2.5 [&_th]:bg-indigo-50/90 [&_th]:dark:bg-zinc-800 [&_th]:p-2 [&_th]:border [&_th]:border-slate-200 [&_th]:dark:border-zinc-700 [&_td]:p-2 [&_td]:border [&_td]:border-slate-200 [&_td]:dark:border-zinc-700 [&_th]:text-left [&_th]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-indigo-900 [&_h3]:dark:text-indigo-300 [&_h3]:mt-3 [&_h3]:mb-1.5 [&_p]:my-1">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                      {res.answer_summary}
                                    </ReactMarkdown>
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
        </motion.div>
      )}
    </motion.div>
  );
}
