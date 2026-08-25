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
  LayoutDashboard, MessageSquare, AlertTriangle, BarChart3, 
  Layers, Database, Sun, Moon, Sparkles, Activity
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Toaster } from 'sonner';
import { motion } from 'framer-motion';

const NAV_TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, shortcut: '1' },
  { id: 'ask', label: 'Ask the Agent', icon: MessageSquare, shortcut: '2' },
  { id: 'exceptions', label: 'Exceptions', icon: AlertTriangle, shortcut: '3' },
  { id: 'eval', label: 'Eval Results', icon: BarChart3, shortcut: '4' },
  { id: 'batch', label: 'Batch Test', icon: Layers, shortcut: '5' },
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
      // Don't trigger if typing in an input/textarea
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

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-[#0c0e29] text-[#0d253d] dark:text-zinc-100 flex flex-col antialiased transition-colors duration-200 selection:bg-indigo-500 selection:text-white">
      <Toaster position="top-right" richColors closeButton />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col gap-0">
        <header className="gradient-mesh-bg border-b border-[#e3e8ee] dark:border-zinc-800/80 sticky top-0 z-50 stripe-shadow-1 backdrop-blur-md bg-white/90 dark:bg-[#12153a]/90">
          <div className="max-w-7xl mx-auto px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Brand Logo & Title */}
            <div className="flex items-center gap-3.5">
              <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-[#533afd] to-[#7c3aed] text-white shadow-md shadow-indigo-500/20">
                <Sparkles className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-normal tracking-[-0.64px] text-[#0d253d] dark:text-white flex items-center gap-2">
                  <span className="font-semibold tracking-tight">PARC</span>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-[#533afd] dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 shadow-xs">
                    Autonomous Finance Controller
                  </span>
                </h1>
                <p className="text-xs text-[#64748d] dark:text-zinc-400">
                  Payment & Autonomous Reconciliation Controller with ground-truth verification
                </p>
              </div>
            </div>
            
            {/* Header Right Actions: Status Badge, Dataset Trigger & Dark Mode */}
            <div className="flex items-center gap-2.5">
              {/* Live Status Badge */}
              <div className="hidden lg:flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50/90 dark:bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-200/80 dark:border-emerald-900/60 shadow-xs">
                <Activity className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                <span>
                  Reconciled: <b className="font-mono">{activeRun?.match_rate ? Number(activeRun.match_rate).toFixed(2) : "93.60"}%</b>
                </span>
              </div>

              {/* View Generated Data Modal Trigger */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => openDataModal()}
                className="bg-white dark:bg-zinc-900 border-indigo-200 dark:border-indigo-900 text-[#533afd] dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-xs gap-1.5 h-8.5 shadow-xs transition-all"
              >
                <Database className="w-3.5 h-3.5 text-[#533afd]" />
                <span className="font-medium">Generated Data</span>
                {history.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold">
                    {history.length} Runs
                  </span>
                )}
              </Button>

              {/* Dark / Light Mode Switcher */}
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleDarkMode}
                className="h-8.5 w-8.5 p-0 rounded-lg text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                {darkMode ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-700" />}
              </Button>
            </div>
          </div>

          {/* Navigation Bar with Animated Sliding Pill */}
          <div className="max-w-7xl mx-auto px-6">
            <TabsList variant="line" className="w-full justify-start h-11 gap-2 border-b-0 p-0 bg-transparent">
              {NAV_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="relative gap-2 px-3.5 py-2 text-xs font-medium tracking-tight text-slate-600 dark:text-zinc-400 data-[state=active]:text-[#533afd] dark:data-[state=active]:text-white rounded-lg transition-colors border-0 shadow-none hover:text-slate-900 dark:hover:text-zinc-200"
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeTabPill"
                        className="absolute inset-0 bg-indigo-50 dark:bg-indigo-950/60 rounded-lg border border-indigo-200/80 dark:border-indigo-800/60 -z-10 shadow-xs"
                        transition={{ type: "spring", stiffness: 450, damping: 35 }}
                      />
                    )}
                    <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#533afd] dark:text-indigo-400' : 'text-slate-400 dark:text-zinc-500'}`} />
                    <span>{tab.label}</span>
                    <span className="hidden xl:inline text-[9px] font-mono text-slate-400 dark:text-zinc-600 px-1 py-0.2 rounded bg-slate-100 dark:bg-zinc-800/60 border border-slate-200/60 dark:border-zinc-700/50">
                      {tab.shortcut}
                    </span>
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
