import { useState, useRef, useEffect } from 'react';
import { Bot, User, CheckCircle, XCircle, Loader2, Info, Sparkles, Database, Copy, Check, CornerDownLeft, Mic, MicOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { apiClient } from '../api/client';
import { Card, CardContent, CardFooter } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { Separator } from '../components/ui/separator';
import { useData } from '../context/DataContext';
import { stripThinkTags } from '../lib/utils';

interface Message {
  role: 'user' | 'agent';
  content: string;
  statusText?: string;
  metadata?: {
    confidence?: string;
    verified?: boolean | "not_applicable";
    api_calls?: number;
    tool_call_count?: number;
    elapsed_seconds?: number;
    tool_calls?: any[];
    cached?: boolean;
  };
}

interface FollowUpAction {
  icon: string;
  label: string;
  query: string;
}

function getSuggestedFollowUps(msg: Message): FollowUpAction[] {
  if (msg.role !== 'agent' || !msg.content) return [];
  const text = msg.content;
  const toolCalls = msg.metadata?.tool_calls || [];
  
  // Extract order ID if present
  const orderMatch = text.match(/\b(order_[0-9]+)\b/i);
  let orderId: string | null = orderMatch ? orderMatch[1] : null;
  if (!orderId) {
    const found = toolCalls.flatMap(tc => Object.values(tc.arguments || {})).find(v => typeof v === 'string' && v.startsWith('order_'));
    if (typeof found === 'string') orderId = found;
  }

  // Extract UTR if present
  const utrMatch = text.match(/\b(UTR[0-9A-Z]+)\b/i);
  let utr: string | null = utrMatch ? utrMatch[1] : null;
  if (!utr) {
    const found = toolCalls.flatMap(tc => Object.values(tc.arguments || {})).find(v => typeof v === 'string' && v.startsWith('UTR'));
    if (typeof found === 'string') utr = found;
  }

  // Extract Reason code if present
  const reasons = ['DUPLICATE_UTR', 'AMOUNT_MISMATCH', 'MISSING_SETTLEMENT', 'MISSING_PAYMENT', 'TIMING_DELAY', 'UNRESOLVED'];
  const matchedReason = reasons.find(r => text.toUpperCase().includes(r));

  const actions: FollowUpAction[] = [];

  if (orderId) {
    actions.push({
      icon: "🔍",
      label: `Show payment gateway details`,
      query: `What is the payment gateway and order capture status for ${orderId}?`
    });
    actions.push({
      icon: "🏦",
      label: `Check bank statement UTR`,
      query: `Check bank statement UTR reconciliation for ${orderId}`
    });
    if (matchedReason) {
      actions.push({
        icon: "📊",
        label: `View all ${matchedReason} exceptions`,
        query: `How many ${matchedReason} exceptions do we have in total?`
      });
    } else {
      actions.push({
        icon: "⚠️",
        label: `Explain reconciliation status`,
        query: `Why did ${orderId} fail or succeed in settlement reconciliation?`
      });
    }
  } else if (matchedReason) {
    actions.push({
      icon: "📊",
      label: `View all ${matchedReason} exceptions`,
      query: `How many ${matchedReason} exceptions do we have in total?`
    });
    actions.push({
      icon: "🔍",
      label: `Show payment gateway details`,
      query: `What are the payment gateway logs and failure root causes for these ${matchedReason} exceptions?`
    });
    actions.push({
      icon: "🏦",
      label: `Check bank statement UTR`,
      query: `Show bank statement records and UTR matches for ${matchedReason} exceptions`
    });
  } else if (utr) {
    actions.push({
      icon: "🏦",
      label: `Check bank statement UTR`,
      query: `What settlements and bank records are linked to ${utr}?`
    });
    actions.push({
      icon: "🔍",
      label: `Show payment gateway details`,
      query: `Show payment gateway capture logs for transactions associated with ${utr}`
    });
    actions.push({
      icon: "📊",
      label: `List duplicate UTR exceptions`,
      query: `How many DUPLICATE_UTR exceptions do we have?`
    });
  } else {
    actions.push({
      icon: "📊",
      label: `View all active exceptions`,
      query: `How many total exceptions are recorded across all categories?`
    });
    actions.push({
      icon: "🏦",
      label: `Check settlement summary`,
      query: `What is the total settled amount today?`
    });
    actions.push({
      icon: "🔍",
      label: `Show payment gateway details`,
      query: `What is the status of our latest payments and gateway captures?`
    });
  }

  return actions.slice(0, 3);
}

const PROMPT_SUGGESTIONS = [
  { icon: "🔍", category: "Order Status", text: "What is the status of order order_3356886?" },
  { icon: "⚠️", category: "Exception Triage", text: "Why did order_79254563 fail reconciliation?" },
  { icon: "📊", category: "Exception Metrics", text: "How many DUPLICATE_UTR exceptions do we have?" },
  { icon: "🏦", category: "Settlement Summary", text: "What is the total settled amount today?" },
];

export default function AskAgent() {
  const { generationKey, activeRun, openDataModal, prefilledAgentQuestion, setPrefilledAgentQuestion } = useData();
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'agent', 
      content: "Hello! I am your **Autonomous Financial Reconciliation Controller**. Ask me anything about order capture, settlement UTRs, discrepancy root causes, or run diagnostics across the live dataset." 
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  
  const isExecutingRef = useRef(false);
  const lastProcessedPrefillRef = useRef<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isFirstMount = useRef(true);

  // Initialize SpeechRecognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        toast.info("🎙️ Listening... speak your question clearly", { duration: 3000 });
      };

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        if (currentTranscript) {
          setInput(currentTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
        if (event.error !== 'no-speech') {
          toast.error(`Microphone error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      toast.error("Speech recognition is not supported in this browser. Try Chrome or Edge!");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error("Failed to start speech recognition:", err);
      }
    }
  };

  // Auto-fill and submit prefilled question from Exceptions / other tabs (with de-duplication guard)
  useEffect(() => {
    if (prefilledAgentQuestion && prefilledAgentQuestion !== lastProcessedPrefillRef.current) {
      const q = prefilledAgentQuestion;
      lastProcessedPrefillRef.current = q;
      setPrefilledAgentQuestion(null);
      // Small tick delay to ensure state and tab mount are stable
      setTimeout(() => {
        executeQuestion(q);
      }, 50);
    }
  }, [prefilledAgentQuestion, setPrefilledAgentQuestion]);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    setMessages(prev => [
      ...prev,
      {
        role: 'agent',
        content: `🔄 **Active Dataset Updated**: The reconciliation engine has regenerated with **${activeRun ? `${activeRun.match_rate}% Match Rate` : 'new synthetic data'}**. Cache has been refreshed.`
      }
    ]);
  }, [generationKey]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const executeQuestion = async (userMessage: string) => {
    const trimmed = userMessage.trim();
    if (!trimmed || isExecutingRef.current) return;

    // Stop voice listening if still active
    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
    }

    isExecutingRef.current = true;
    setLoading(true);
    setInput('');

    const history = messages
      .filter(m => m.content)
      .map(m => ({
        role: m.role === 'agent' ? 'assistant' : m.role,
        content: m.content
      }));

    setMessages(prev => [
      ...prev,
      { role: 'user', content: trimmed },
      { role: 'agent', content: '', statusText: 'Dispatching to deterministic settlement tools...' }
    ]);

    apiClient.askAgentStream(
      trimmed,
      history,
      (statusMsg) => {
        setMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === 'agent') {
            updated[lastIdx] = { ...updated[lastIdx], statusText: statusMsg };
          }
          return updated;
        });
      },
      (tokenStr) => {
        setMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === 'agent') {
            const newRawContent = updated[lastIdx].content + tokenStr;
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: stripThinkTags(newRawContent),
              statusText: undefined
            };
          }
          return updated;
        });
      },
      (finalRes) => {
        isExecutingRef.current = false;
        setLoading(false);
        setMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === 'agent') {
            updated[lastIdx] = {
              role: 'agent',
              content: stripThinkTags(finalRes.answer),
              statusText: undefined,
              metadata: {
                confidence: finalRes.confidence,
                verified: finalRes.verified,
                tool_call_count: finalRes.tool_call_count ?? finalRes.tool_calls?.length ?? 0,
                elapsed_seconds: finalRes.elapsed_seconds,
                tool_calls: finalRes.tool_calls,
                cached: finalRes.cached
              }
            };
          }
          return updated;
        });
      },
      (error) => {
        isExecutingRef.current = false;
        setLoading(false);
        console.error("Streaming error:", error);
        setMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === 'agent') {
            updated[lastIdx] = {
              role: 'agent',
              content: "I encountered an error querying the settlement engine. Please verify the backend connection.",
              statusText: undefined
            };
          }
          return updated;
        });
      }
    );
  };

  const handleSend = () => {
    if (!isExecutingRef.current && input.trim()) {
      executeQuestion(input);
    }
  };

  const copyMessageContent = (content: string, idx: number) => {
    navigator.clipboard.writeText(content);
    setCopiedIdx(idx);
    toast.success("Answer copied to clipboard!");
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 h-[calc(100vh-140px)] flex flex-col space-y-3">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl sm:text-3xl font-light tracking-[-0.64px] text-[#0d253d] dark:text-white">
            Ask the Agent
          </h2>
          <p className="font-light text-xs sm:text-sm text-[#64748d] dark:text-zinc-400 mt-0.5">
            Voice-enabled financial Q&A engine with deterministic verification & sub-second latency.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => openDataModal('orders')}
          className="border-indigo-200 dark:border-indigo-900 text-[#533afd] dark:text-indigo-300 hover:bg-indigo-50 text-xs gap-1.5 h-8 shrink-0 self-start sm:self-auto shadow-xs"
        >
          <Database className="w-3.5 h-3.5 text-[#533afd]" />
          View Active Dataset
        </Button>
      </div>

      {/* Suggested Query Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
        <span className="text-[11px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider shrink-0 mr-1">
          Suggestions:
        </span>
        {PROMPT_SUGGESTIONS.map((item, idx) => (
          <button
            key={idx}
            onClick={() => executeQuestion(item.text)}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:border-indigo-300 dark:hover:border-indigo-800 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/40 transition-all shrink-0 shadow-2xs group"
          >
            <span>{item.icon}</span>
            <span className="font-medium group-hover:text-[#533afd] dark:group-hover:text-indigo-400 transition-colors">
              {item.text}
            </span>
          </button>
        ))}
      </div>

      {/* Chat Container */}
      <Card className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-zinc-900/90 border border-[#e3e8ee] dark:border-zinc-800/80 shadow-sm rounded-2xl">
        <CardContent className="flex-1 overflow-y-auto p-4 md:p-5 space-y-5">
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'agent' && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 dark:bg-indigo-950/80 flex items-center justify-center shrink-0 border border-indigo-200 dark:border-indigo-800 text-[#533afd] dark:text-indigo-400 shadow-2xs">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div className={`flex flex-col gap-2 max-w-[88%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  {/* Message bubble */}
                  {msg.content || !msg.statusText ? (
                    <div className={`relative p-4 rounded-2xl text-xs sm:text-sm leading-relaxed group ${
                      msg.role === 'user'
                        ? 'bg-[#533afd] text-white rounded-tr-xs shadow-xs font-normal'
                        : 'bg-[#f8fafc] dark:bg-zinc-800/70 border border-[#e3e8ee] dark:border-zinc-700/70 rounded-tl-xs text-[#0d253d] dark:text-zinc-100 shadow-xs'
                    }`}>
                      {msg.role === 'user' ? (
                        msg.content
                      ) : (
                        <div>
                          <div className="prose prose-sm dark:prose-invert max-w-none space-y-2 [&_table]:w-full [&_table]:border-collapse [&_table]:my-2.5 [&_th]:bg-indigo-50/90 [&_th]:dark:bg-zinc-800 [&_th]:p-2.5 [&_th]:border [&_th]:border-slate-200 [&_th]:dark:border-zinc-700 [&_td]:p-2.5 [&_td]:border [&_td]:border-slate-200 [&_td]:dark:border-zinc-700 [&_th]:text-left [&_th]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-indigo-900 [&_h3]:dark:text-indigo-300 [&_h3]:mt-3 [&_h3]:mb-1.5 [&_p]:my-1">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>

                          {/* Quick Copy Button */}
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => copyMessageContent(msg.content, idx)}
                              className="p-1 rounded bg-white/80 dark:bg-zinc-700/80 border border-slate-200 dark:border-zinc-600 text-slate-500 hover:text-slate-900 dark:text-zinc-300 shadow-2xs transition-colors"
                              title="Copy Answer"
                            >
                              {copiedIdx === idx ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* Active Status indicator while streaming */}
                  {msg.statusText && (
                    <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-3.5 py-2 rounded-xl border border-indigo-100 dark:border-indigo-900/50 shadow-2xs">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span>{msg.statusText}</span>
                    </div>
                  )}

                  {/* Metadata & tool breakdown */}
                  {msg.metadata && (
                    <div className="w-full space-y-2 mt-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {msg.metadata.confidence && (
                          <Badge variant="outline" className={
                            msg.metadata.confidence === "HIGH" || msg.metadata.confidence === "Resolved" ? "text-emerald-700 border-emerald-200 bg-emerald-50/50" :
                            msg.metadata.confidence === "MEDIUM" || msg.metadata.confidence === "Partially Resolved" ? "text-amber-700 border-amber-200 bg-amber-50/50" :
                            "text-rose-700 border-rose-200 bg-rose-50/50"
                          }>
                            {msg.metadata.confidence} Confidence
                          </Badge>
                        )}

                        {msg.metadata.verified !== "not_applicable" && (
                          <Badge variant="outline" className={`flex items-center gap-1 ${
                            msg.metadata.verified
                              ? "text-emerald-700 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30"
                              : "text-rose-700 border-rose-200 bg-rose-50 dark:bg-rose-950/30"
                          }`}>
                            {msg.metadata.verified ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            {msg.metadata.verified ? "Verified via APIs" : "Verification Failed"}
                          </Badge>
                        )}

                        {msg.metadata.cached && (
                          <Badge variant="outline" className="text-purple-700 border-purple-200 bg-purple-50 dark:bg-purple-950/30 flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-purple-600" /> Instant Cache Hit
                          </Badge>
                        )}

                        <span className="text-[#64748d] dark:text-zinc-400 ml-auto flex items-center gap-1 text-xs tnum">
                          <Info className="w-3 h-3" />
                          {msg.metadata.elapsed_seconds?.toFixed(2)}s • {msg.metadata.tool_call_count ?? 0} API calls
                        </span>
                      </div>

                      {msg.metadata.tool_calls && msg.metadata.tool_calls.length > 0 && (
                        <Accordion className="w-full bg-white dark:bg-zinc-950/50 rounded-lg border border-[#e3e8ee] dark:border-zinc-800 mt-2">
                          <AccordionItem value="tools" className="border-b-0">
                            <AccordionTrigger className="text-xs py-2 px-3 hover:no-underline text-[#64748d]">
                              Show agent's work ({msg.metadata.tool_calls.length} step{msg.metadata.tool_calls.length > 1 ? 's' : ''})
                            </AccordionTrigger>
                            <AccordionContent className="px-3 pb-3">
                              <div className="space-y-3">
                                {msg.metadata.tool_calls.map((tool, tIdx) => {
                                  let parsed: any = tool.result;
                                  if (typeof parsed === 'string') {
                                    try {
                                      parsed = JSON.parse(parsed);
                                    } catch {
                                      // keep as raw string
                                    }
                                  }

                                  const isDataObj = parsed && typeof parsed === 'object' && parsed.data && typeof parsed.data === 'object';
                                  const isExceptionsArr = parsed && typeof parsed === 'object' && Array.isArray(parsed.exceptions);

                                  return (
                                    <div key={tIdx} className="space-y-2 border border-indigo-100 dark:border-zinc-800 rounded-lg p-3 bg-slate-50/50 dark:bg-zinc-900/60 text-xs">
                                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-zinc-800">
                                        <span className="font-mono font-semibold text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                                          <span className="px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 text-[11px]">
                                            {tool.name}
                                          </span>
                                        </span>
                                        <span className="font-mono text-[11px] text-slate-500 dark:text-zinc-400 truncate max-w-[240px]">
                                          {JSON.stringify(tool.arguments)}
                                        </span>
                                      </div>

                                      {isDataObj ? (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] pt-1">
                                          {Object.entries(parsed.data).map(([key, val]) => (
                                            <div key={key} className="bg-white dark:bg-zinc-800/80 p-2 rounded border border-slate-200/80 dark:border-zinc-700/60 shadow-xs">
                                              <div className="text-slate-400 dark:text-zinc-400 font-medium capitalize text-[10px]">{key.replace(/_/g, ' ')}</div>
                                              <div className="font-mono font-semibold text-slate-800 dark:text-zinc-100 truncate mt-0.5">
                                                {val !== null && val !== undefined ? String(val) : '-'}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : isExceptionsArr ? (
                                        <div className="space-y-2 pt-1 max-h-60 overflow-y-auto pr-1">
                                          {parsed.exceptions.map((exc: any, eIdx: number) => (
                                            <div key={eIdx} className="bg-white dark:bg-zinc-800 p-2 rounded border border-amber-200/60 dark:border-amber-900/40 text-[11px] space-y-1">
                                              <div className="flex items-center justify-between">
                                                <span className="font-semibold text-amber-800 dark:text-amber-300 font-mono">
                                                  {exc.order_id || exc.settlement_id || `Exception #${eIdx + 1}`}
                                                </span>
                                                <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[10px] font-semibold">
                                                  {exc.reason || 'EXCEPTION'}
                                                </span>
                                              </div>
                                              <p className="text-slate-600 dark:text-zinc-300 text-[10px]">{exc.description || exc.message || 'No description'}</p>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="bg-slate-900 text-emerald-400 p-2.5 rounded font-mono text-[11px] leading-relaxed max-h-56 overflow-y-auto whitespace-pre-wrap break-all shadow-inner border border-slate-800">
                                          {typeof parsed === 'object' ? JSON.stringify(parsed, null, 2) : String(parsed)}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )}
                    </div>
                  )}

                  {/* Suggested Follow-up Action Chips */}
                  {msg.role === 'agent' && !loading && !msg.statusText && idx === messages.length - 1 && getSuggestedFollowUps(msg).length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-zinc-800/80 w-full space-y-1.5">
                      <div className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-[#533afd] dark:text-indigo-400" />
                        <span>Suggested Next Actions</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {getSuggestedFollowUps(msg).map((action, aIdx) => (
                          <button
                            key={aIdx}
                            onClick={() => executeQuestion(action.query)}
                            disabled={loading}
                            className="flex items-center gap-1.5 text-[11px] sm:text-xs px-2.5 py-1 rounded-lg bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-200/80 dark:border-indigo-800/70 text-indigo-800 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-all cursor-pointer shadow-2xs font-medium group"
                          >
                            <span>{action.icon}</span>
                            <span className="group-hover:text-[#533afd] dark:group-hover:text-white transition-colors">{action.label}</span>
                            <CornerDownLeft className="w-2.5 h-2.5 text-indigo-400 opacity-60 group-hover:opacity-100 ml-0.5" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center shrink-0 border border-indigo-200 dark:border-indigo-800 text-[#533afd] dark:text-indigo-400 shadow-2xs">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </CardContent>

        <Separator className="bg-[#e3e8ee] dark:border-zinc-800" />

        {/* Voice-Enabled Input Bar */}
        <CardFooter className="p-3.5 bg-white dark:bg-zinc-900">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex w-full items-center gap-2"
          >
            <div className="relative flex-1">
              <Input
                placeholder={isListening ? "🎙️ Listening... speak your financial query now" : "Ask about any order ID, settlement UTR, or failure reason..."}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
                className={`w-full rounded-xl border-[#a8c3de] dark:border-zinc-700 focus-visible:border-[#533afd] dark:focus-visible:border-indigo-500 px-4 py-2.5 text-xs sm:text-sm shadow-2xs transition-colors ${
                  isListening 
                    ? "bg-rose-50/70 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 placeholder:text-rose-500" 
                    : "bg-[#f8fafc] dark:bg-zinc-800/90"
                }`}
              />

              {isListening && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                </span>
              )}
            </div>

            {/* Voice Microphone Button */}
            <Button
              type="button"
              variant={isListening ? "destructive" : "outline"}
              onClick={toggleVoiceInput}
              disabled={loading}
              className={`rounded-xl h-10 w-10 p-0 shrink-0 transition-all ${
                isListening 
                  ? "bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-500/30 animate-pulse" 
                  : "border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-[#533afd] hover:border-indigo-300"
              }`}
              title={isListening ? "Stop listening" : "Click to speak your question"}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>

            {/* Send Button */}
            <Button 
              type="submit" 
              disabled={!input.trim() || loading} 
              className="rounded-xl px-4 bg-[#533afd] hover:bg-[#4434d4] text-white shrink-0 gap-1.5 h-10 shadow-xs"
            >
              <span>Send</span>
              <CornerDownLeft className="w-3.5 h-3.5" />
            </Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
}
