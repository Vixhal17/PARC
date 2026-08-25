import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { toast } from 'sonner';
import { apiClient } from '../api/client';
import type { GenerationRun } from '../types';

interface DataContextType {
  generationKey: number;
  history: GenerationRun[];
  activeRunId: string | null;
  activeRun: GenerationRun | undefined;
  isRegenerating: boolean;
  isRestoring: boolean;
  isDataModalOpen: boolean;
  activeTable: string;
  activeHistoryRunId: string | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  prefilledAgentQuestion: string | null;
  setPrefilledAgentQuestion: (q: string | null) => void;
  askAgentWithQuestion: (question: string) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  openDataModal: (table?: string, runId?: string) => void;
  closeDataModal: () => void;
  regenerateData: () => Promise<void>;
  restoreRun: (runId: string) => Promise<void>;
  refreshHistory: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const [generationKey, setGenerationKey] = useState<number>(1);
  const [history, setHistory] = useState<GenerationRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [isDataModalOpen, setIsDataModalOpen] = useState<boolean>(false);
  const [activeTable, setActiveTable] = useState<string>('orders');
  const [activeHistoryRunId, setActiveHistoryRunId] = useState<string | null>(null);
  
  // Navigation & Interactive Ask Agent state
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [prefilledAgentQuestion, setPrefilledAgentQuestion] = useState<string | null>(null);

  // Dark Mode
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('theme') === 'dark' || 
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode(prev => !prev);
  };

  const askAgentWithQuestion = (question: string) => {
    setPrefilledAgentQuestion(question);
    setActiveTab('ask');
    toast.info(`Querying Agent: "${question.length > 40 ? question.slice(0, 40) + '...' : question}"`);
  };

  const refreshHistory = async () => {
    try {
      const res = await apiClient.getDataHistory();
      if (res && res.runs) {
        setHistory(res.runs);
        setActiveRunId(res.active_run_id || (res.runs[0]?.run_id ?? null));
      }
    } catch (err) {
      console.error("Failed to load dataset history:", err);
    }
  };

  useEffect(() => {
    refreshHistory();
  }, []);

  const regenerateData = async () => {
    setIsRegenerating(true);
    const toastId = toast.loading("Synthesizing 500 financial records & reconciling...");
    try {
      await apiClient.regenerateData();
      await refreshHistory();
      setGenerationKey(prev => prev + 1);
      toast.success("Dataset regenerated! All 4 tabs updated with new live reconciliation.", { id: toastId });
    } catch (err) {
      console.error("Failed to regenerate synthetic data:", err);
      toast.error("Failed to regenerate synthetic data", { id: toastId });
      throw err;
    } finally {
      setIsRegenerating(false);
    }
  };

  const restoreRun = async (runId: string) => {
    setIsRestoring(true);
    const toastId = toast.loading(`Restoring snapshot ${runId}...`);
    try {
      await apiClient.restoreRun(runId);
      await refreshHistory();
      setActiveRunId(runId);
      setGenerationKey(prev => prev + 1);
      toast.success(`Restored dataset snapshot (${runId}) as active!`, { id: toastId });
    } catch (err) {
      console.error("Failed to restore run:", err);
      toast.error("Failed to restore snapshot", { id: toastId });
      throw err;
    } finally {
      setIsRestoring(false);
    }
  };

  const openDataModal = (table?: string, runId?: string) => {
    if (table) setActiveTable(table);
    if (runId !== undefined) setActiveHistoryRunId(runId);
    else setActiveHistoryRunId(activeRunId);
    setIsDataModalOpen(true);
  };

  const closeDataModal = () => {
    setIsDataModalOpen(false);
  };

  const activeRun = history.find(r => r.run_id === activeRunId) || history[0];

  return (
    <DataContext.Provider
      value={{
        generationKey,
        history,
        activeRunId,
        activeRun,
        isRegenerating,
        isRestoring,
        isDataModalOpen,
        activeTable,
        activeHistoryRunId,
        activeTab,
        setActiveTab,
        prefilledAgentQuestion,
        setPrefilledAgentQuestion,
        askAgentWithQuestion,
        darkMode,
        toggleDarkMode,
        openDataModal,
        closeDataModal,
        regenerateData,
        restoreRun,
        refreshHistory
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
