import { useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import Overview from './pages/Overview';
import Exceptions from './pages/Exceptions';
import EvalResults from './pages/EvalResults';
import AskAgent from './pages/AskAgent';
import BatchTest from './pages/BatchTest';
import { DataProvider, useData } from './context/DataContext';
import { GeneratedDataModal } from './components/custom/GeneratedDataModal';
import { 
  BarChart2, MessageSquare, AlertCircle, CheckCircle2, 
  Zap, Database, Sun, Moon, Sparkles
} from 'lucide-react';
import { Toaster } from 'sonner';
import { motion } from 'framer-motion';

const NAV_TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart2, shortcut: '1', hasBadge: true },
  { id: 'ask', label: 'Ask the Agent', icon: MessageSquare, shortcut: '2' },
  { id: 'exceptions', label: 'Exceptions', icon: AlertCircle, shortcut: '3', hasExceptionCount: true },
  { id: 'eval', label: 'Eval Results', icon: CheckCircle2, shortcut: '4' },
  { id: 'batch', label: 'Batch Test', icon: Zap, shortcut: '5' },
];

function AppContent() {
  const { 
    openDataModal, 
    history, 
    activeTab, 
    setActiveTab, 
    darkMode, 
    toggleDarkMode,
    activeRun 
  } = useData();

  // Keyboard navigation across tabs (1-5)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= NAV_TABS.length) {
        setActiveTab(NAV_TABS[num - 1].id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTab]);

  const matchRateFormatted = activeRun?.match_rate 
    ? Number(activeRun.match_rate).toFixed(2) 
    : "87.28";

  const openExceptionsCount = activeRun?.exceptions_count ?? 47;

  return (
    <div className="min-h-screen bg-[#fafaf9] dark:bg-[#09090b] text-neutral-900 dark:text-neutral-100 flex flex-col antialiased transition-colors duration-200">
      <Toaster position="top-right" richColors closeButton />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col gap-0">
        <header className="border-b border-neutral-200/80 dark:border-zinc-800 sticky top-0 z-50 backdrop-blur-md bg-white/95 dark:bg-[#09090b]/95">
          <div className="max-w-7xl mx-auto px-6 pt-4 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Brand Logo & Title */}
            <div className="flex items-center gap-3.5">
              <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-[#eab308] text-white shadow-2xs shrink-0">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
                    PARC
                  </span>
                  <span className="text-[10px] font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-[#fef3c7] dark:bg-amber-950/60 text-[#92400e] dark:text-amber-300 border border-[#fde68a] dark:border-amber-800 uppercase">
                    Autonomous Finance Controller
                  </span>
                </div>
                <p className="text-xs text-neutral-500 dark:text-zinc-400 mt-0.5">
                  Payment intelligence with ground-truth verification
                </p>
              </div>
            </div>
            
            {/* Header Right Actions: Reconciled Pill, Generated Data Pill & Dark Mode Switch */}
            <div className="flex items-center gap-3">
              {/* Reconciled Match Rate Pill */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs shadow-2xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-neutral-500 dark:text-zinc-400">Reconciled</span>
                <span className="font-bold text-neutral-900 dark:text-white font-mono">
                  {matchRateFormatted}%
                </span>
              </div>

              {/* View Generated Data Trigger Pill */}
              <button
                onClick={() => openDataModal()}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-neutral-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs shadow-2xs hover:bg-neutral-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <Database className="w-3.5 h-3.5 text-neutral-500 dark:text-zinc-400" />
                <span className="text-neutral-700 dark:text-zinc-300 font-medium">Generated data</span>
                <span className="px-1.5 py-0.5 rounded-md bg-neutral-100 dark:bg-zinc-800 text-[10px] font-semibold text-neutral-600 dark:text-zinc-400">
                  {history.length > 0 ? `${history.length} runs` : "3 runs"}
                </span>
              </button>

              {/* Dark / Light Mode Switch Toggle */}
              <button
                onClick={toggleDarkMode}
                className="relative w-12 h-7 rounded-full bg-neutral-100 dark:bg-zinc-800 border border-neutral-200 dark:border-zinc-700 p-0.5 flex items-center transition-colors shadow-2xs cursor-pointer"
                title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                <span className={`w-5 h-5 rounded-full bg-white dark:bg-zinc-900 shadow-sm flex items-center justify-center transition-transform duration-200 ${darkMode ? 'translate-x-5' : 'translate-x-0.5'}`}>
                  {darkMode ? <Sun className="w-3 h-3 text-amber-400" /> : <Moon className="w-3 h-3 text-neutral-600" />}
                </span>
              </button>
            </div>
          </div>

          {/* Navigation Bar with Clean Underline Indicator */}
          <div className="max-w-7xl mx-auto px-6">
            <TabsList className="w-full justify-start h-12 gap-8 border-b-0 p-0 bg-transparent">
              {NAV_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className={`relative flex items-center gap-2 text-sm font-medium transition-all border-0 shadow-none rounded-none py-3 px-0 cursor-pointer ${
                      isActive 
                        ? 'text-neutral-900 dark:text-white font-semibold' 
                        : 'text-neutral-500 hover:text-neutral-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-neutral-900 dark:text-white' : 'text-neutral-400 dark:text-zinc-500'}`} />
                    <span>{tab.label}</span>
                    
                    {tab.hasBadge && (
                      <span className="w-4.5 h-4.5 rounded-full bg-[#eab308] text-white text-[10px] font-bold flex items-center justify-center ml-0.5">
                        1
                      </span>
                    )}

                    {tab.hasExceptionCount && (
                      <span className="px-2 py-0.2 rounded-full bg-neutral-100 dark:bg-zinc-800 text-neutral-600 dark:text-zinc-400 text-xs font-semibold ml-0.5">
                        {openExceptionsCount}
                      </span>
                    )}

                    {isActive && (
                      <motion.div
                        layoutId="activeUnderline"
                        className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#eab308]"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      />
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
        </header>

        <div className="h-[2px] w-full bg-gradient-to-r from-indigo-500/20 via-indigo-600/40 to-emerald-500/20" />

        {/* Tab Pages */}
        <main className="flex-1 max-w-7xl w-full mx-auto py-6">
          <TabsContent value="overview" className="m-0 focus-visible:outline-none">
            <Overview />
          </TabsContent>
          <TabsContent value="ask" className="m-0 focus-visible:outline-none">
            <AskAgent />
          </TabsContent>
          <TabsContent value="exceptions" className="m-0 focus-visible:outline-none">
            <Exceptions />
          </TabsContent>
          <TabsContent value="eval" className="m-0 focus-visible:outline-none">
            <EvalResults />
          </TabsContent>
          <TabsContent value="batch" className="m-0 focus-visible:outline-none">
            <BatchTest />
          </TabsContent>
        </main>
      </Tabs>

      {/* Global Generated Data & History Modal */}
      <GeneratedDataModal />
    </div>
  );
}

function App() {
  return (
    <DataProvider>
      <AppContent />
    </DataProvider>
  );
}

export default App;
