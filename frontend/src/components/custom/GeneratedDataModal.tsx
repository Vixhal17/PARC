import { useState, useEffect, useMemo } from 'react';
import { 
  X, Search, Database, RefreshCw, FileText, CheckCircle2, 
  AlertCircle, History, RotateCcw, Download, ChevronLeft, ChevronRight,
  Layers, CreditCard, Building2, ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useData } from '../../context/DataContext';
import { apiClient } from '../../api/client';
import type { GeneratedDataResponse } from '../../types';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';

const TABLES = [
  { id: 'orders', label: 'Orders', icon: Layers, desc: 'Generated order records (500 items)' },
  { id: 'payments', label: 'Payments', icon: CreditCard, desc: 'Captured payment gateways transactions' },
  { id: 'settlements', label: 'Settlements', icon: FileText, desc: 'Batch payment settlements and UTRs' },
  { id: 'bank_statement', label: 'Bank Statement', icon: Building2, desc: 'Bank credit logs matching UTRs' },
  { id: 'reconciled', label: 'Reconciled Output', icon: CheckCircle2, desc: 'Multi-way engine matching output' },
  { id: 'ground_truth', label: 'Ground Truth', icon: ShieldAlert, desc: 'Known anomaly classifications' },
];

export function GeneratedDataModal() {
  const { 
    isDataModalOpen, 
    closeDataModal, 
    history, 
    activeRunId, 
    activeTable: initialTable,
    restoreRun,
    isRestoring,
    generationKey
  } = useData();

  const [selectedTable, setSelectedTable] = useState<string>(initialTable || 'orders');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [dataResponse, setDataResponse] = useState<GeneratedDataResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const pageSize = 50;

  // Initialize selectedRunId when modal opens or history changes
  useEffect(() => {
    if (activeRunId && !selectedRunId) {
      setSelectedRunId(activeRunId);
    }
  }, [activeRunId, isDataModalOpen]);

  useEffect(() => {
    if (initialTable) {
      setSelectedTable(initialTable);
    }
  }, [initialTable, isDataModalOpen]);

  const loadTableData = async () => {
    if (!isDataModalOpen) return;
    setLoading(true);
    try {
      const offset = (page - 1) * pageSize;
      const res = await apiClient.getGeneratedData(
        selectedTable,
        selectedRunId || undefined,
        pageSize,
        offset,
        searchQuery || undefined
      );
      setDataResponse(res);
    } catch (err) {
      console.error("Failed to load generated data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTableData();
  }, [selectedTable, selectedRunId, page, searchQuery, isDataModalOpen, generationKey]);

  const currentRunMeta = useMemo(() => {
    return history.find(r => r.run_id === selectedRunId) || history[0];
  }, [history, selectedRunId]);

  const isViewingActive = selectedRunId === activeRunId;

  const handleRestore = async (runId: string) => {
    try {
      await restoreRun(runId);
      setSelectedRunId(runId);
    } catch (err) {
      console.error("Failed to restore run:", err);
    }
  };

  const handleExportCSV = () => {
    if (!dataResponse || !dataResponse.rows.length) return;
    const headers = dataResponse.columns.join(',');
    const rows = dataResponse.rows.map(row => 
      dataResponse.columns.map(col => {
        const val = row[col];
        if (val === null || val === undefined) return '';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      }).join(',')
    );
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${selectedTable}_${selectedRunId || 'active'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isDataModalOpen) return null;

  const totalPages = dataResponse ? Math.max(1, Math.ceil(dataResponse.total_count / pageSize)) : 1;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ duration: 0.2 }}
          className="bg-white dark:bg-zinc-900 border border-[#e3e8ee] dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
        >
          {/* Modal Header */}
          <div className="px-6 py-4 border-b border-[#e3e8ee] dark:border-zinc-800 flex items-center justify-between bg-[#f8fafc] dark:bg-zinc-950/70">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-900/60 text-[#533afd] dark:text-indigo-400 shadow-xs">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-xl font-light tracking-tight text-[#0d253d] dark:text-white">
                    Generated Data Explorer
                  </h2>
                  <Badge variant="outline" className="bg-indigo-50 dark:bg-indigo-950/50 text-[#533afd] dark:text-indigo-300 border-indigo-200 text-xs">
                    History (Last 3 Runs)
                  </Badge>
                </div>
                <p className="text-xs text-[#64748d] dark:text-zinc-400 mt-0.5">
                  Inspect raw generated tables, cross-verify reconciliations, and restore past generation runs.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                disabled={!dataResponse || dataResponse.rows.length === 0}
                className="text-xs gap-1.5 h-8 text-slate-700 dark:text-zinc-300"
              >
                <Download className="w-3.5 h-3.5" /> Export Page
              </Button>
              <button
                onClick={closeDataModal}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Run History Selector Cards */}
          <div className="px-6 py-3 bg-[#f1f5f9]/70 dark:bg-zinc-900/90 border-b border-[#e3e8ee] dark:border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                <History className="w-3.5 h-3.5 text-indigo-600" />
                <span>Select Generation Run to View (3 Snapshots Tracked):</span>
              </div>
              {currentRunMeta && !isViewingActive && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleRestore(currentRunMeta.run_id)}
                  disabled={isRestoring}
                  className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
                >
                  <RotateCcw className={`w-3 h-3 ${isRestoring ? 'animate-spin' : ''}`} />
                  {isRestoring ? 'Restoring...' : `Restore Run #${history.findIndex(h => h.run_id === currentRunMeta.run_id) + 1} as Active`}
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {history.map((run, idx) => {
                const isActive = run.run_id === activeRunId;
                const isSelected = run.run_id === (selectedRunId || activeRunId);
                const runNumber = history.length - idx;

                return (
                  <div
                    key={run.run_id}
                    onClick={() => {
                      setSelectedRunId(run.run_id);
                      setPage(1);
                    }}
                    className={`cursor-pointer p-2.5 rounded-xl border text-xs transition-all relative ${
                      isSelected
                        ? 'bg-white dark:bg-zinc-800 border-indigo-500 shadow-sm ring-1 ring-indigo-400'
                        : 'bg-white/60 dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 hover:bg-white dark:hover:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                        Run #{runNumber}
                        {isActive && (
                          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                            Active
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(run.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-600 dark:text-zinc-400">
                      <span>Match: <b className="text-emerald-600 dark:text-emerald-400">{run.match_rate}%</b></span>
                      <span>Exc: <b className="text-amber-600 dark:text-amber-400">{run.exceptions_count}</b></span>
                      <span>Orders: <b>{run.total_records}</b></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dataset Table Navigation Tabs & Search */}
          <div className="px-6 pt-3 pb-2 border-b border-[#e3e8ee] dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-zinc-900">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              {TABLES.map(tab => {
                const TabIcon = tab.icon;
                const isCurrent = selectedTable === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setSelectedTable(tab.id);
                      setPage(1);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                      isCurrent
                        ? 'bg-indigo-50 dark:bg-indigo-950/80 text-[#533afd] dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900 font-semibold'
                        : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-transparent'
                    }`}
                  >
                    <TabIcon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="relative w-full md:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                placeholder={`Search ${selectedTable}...`}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="pl-8 h-8 text-xs bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800"
              />
            </div>
          </div>

          {/* Table Content Area */}
          <div className="flex-1 overflow-auto p-4 bg-slate-50/40 dark:bg-zinc-950/40 min-h-[350px]">
            {loading ? (
              <div className="h-64 flex flex-col items-center justify-center gap-2 text-slate-500">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                <span className="text-xs">Loading {selectedTable} dataset...</span>
              </div>
            ) : !dataResponse || dataResponse.rows.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center gap-2 text-slate-400">
                <AlertCircle className="w-8 h-8 text-slate-300" />
                <span className="text-sm font-medium">No records found</span>
                <span className="text-xs text-slate-400">Try changing your search query or switching tabs.</span>
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 overflow-hidden shadow-2xs">
                <div className="overflow-x-auto max-h-[460px]">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-b border-slate-200 dark:border-zinc-700 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3 w-12 text-slate-400 font-mono text-[11px]">#</th>
                        {dataResponse.columns.map(col => (
                          <th key={col} className="py-2.5 px-3 capitalize font-semibold tracking-wider text-[11px] whitespace-nowrap">
                            {col.replace(/_/g, ' ')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
                      {dataResponse.rows.map((row, rIdx) => {
                        const rowNum = (page - 1) * pageSize + rIdx + 1;
                        return (
                          <tr key={rIdx} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-colors">
                            <td className="py-2 px-3 text-slate-400 font-mono text-[10px]">{rowNum}</td>
                            {dataResponse.columns.map(col => {
                              const val = row[col];
                              return (
                                <td key={col} className="py-2 px-3 whitespace-nowrap text-slate-800 dark:text-zinc-200">
                                  {renderCell(col, val)}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer with Pagination */}
          <div className="px-6 py-3 border-t border-[#e3e8ee] dark:border-zinc-800 flex items-center justify-between bg-white dark:bg-zinc-950 text-xs text-slate-600 dark:text-zinc-400">
            <div>
              {dataResponse && (
                <span>
                  Showing <b>{(page - 1) * pageSize + 1}</b> to <b>{Math.min(page * pageSize, dataResponse.total_count)}</b> of <b>{dataResponse.total_count}</b> records
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="h-7 px-2 text-xs"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Prev
              </Button>
              <span className="text-xs px-2 font-medium">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="h-7 px-2 text-xs"
              >
                Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function renderCell(columnName: string, value: any) {
  if (value === null || value === undefined) {
    return <span className="text-slate-300 dark:text-zinc-600 italic">-</span>;
  }

  const col = columnName.toLowerCase();

  // Currency columns
  if (col.includes('amount') || col === 'fee' || col === 'tax') {
    const num = parseFloat(String(value));
    if (!isNaN(num)) {
      return <span className="font-mono font-medium">₹{num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
    }
  }

  // ID columns
  if (col.includes('id') || col.includes('utr')) {
    return <span className="font-mono font-medium text-indigo-600 dark:text-indigo-400">{String(value)}</span>;
  }

  // Reason or Status badge
  if (col === 'reason' || col === 'status') {
    const s = String(value).toUpperCase();
    if (s === 'CLEAN_MATCH' || s === 'RESOLVED' || s === 'CREATED') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900">
          {s}
        </span>
      );
    } else if (s === 'AMOUNT_MISMATCH' || s === 'UNRESOLVED') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900">
          {s}
        </span>
      );
    } else {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900">
          {s}
        </span>
      );
    }
  }

  // Date columns
  if (col.includes('at') || col.includes('date') || col.includes('time')) {
    return <span className="font-mono text-slate-500 text-[11px]">{String(value).replace('T', ' ').slice(0, 19)}</span>;
  }

  return <span>{String(value)}</span>;
}
