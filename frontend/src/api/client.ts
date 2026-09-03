import axios from 'axios';
import type { 
  OverviewData, 
  ExceptionRecord, 
  ChartData, 
  TimelineData, 
  AskResponse, 
  EvalResult, 
  BatchTestResponse,
  HistoryIndexResponse,
  GeneratedDataResponse,
  MoneyFlowData
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api` 
  : (typeof window !== 'undefined' && window.location.port === '5173' ? 'http://127.0.0.1:8000/api' : '/api');

const api = axios.create({
  baseURL: API_BASE_URL,
});

export const apiClient = {
  regenerateData: async () => {
    const res = await api.post('/regenerate-data');
    return res.data;
  },
  
  getOverview: async (): Promise<OverviewData> => {
    const res = await api.get('/overview');
    return res.data;
  },
  
  getExceptions: async (reasonCode?: string): Promise<ExceptionRecord[]> => {
    const params = reasonCode && reasonCode !== 'All' ? { reason_code: reasonCode } : {};
    const res = await api.get('/exceptions', { params });
    return res.data;
  },
  
  getExceptionsChartData: async (): Promise<ChartData[]> => {
    const res = await api.get('/exceptions/chart-data');
    return res.data;
  },
  
  getTimelineData: async (): Promise<TimelineData[]> => {
    const res = await api.get('/settlements/timeline');
    return res.data;
  },
  
  askAgent: async (question: string, history?: any[]): Promise<AskResponse> => {
    const res = await api.post('/ask', { question, conversation_history: history });
    return res.data;
  },

  askAgentStream: async (
    question: string,
    history: any[] | undefined,
    onStatus: (status: string) => void,
    onToken: (token: string) => void,
    onDone: (data: AskResponse) => void,
    onError: (err: any) => void
  ) => {
    try {
      const response = await fetch(`${API_BASE_URL}/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, conversation_history: history })
      });

      if (!response.body) throw new Error('ReadableStream not supported');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;
            try {
              const event = JSON.parse(dataStr);
              if (event.type === 'cached') {
                onDone(event.result);
                return;
              } else if (event.type === 'status') {
                onStatus(event.message);
              } else if (event.type === 'token') {
                onToken(event.token);
              } else if (event.type === 'done') {
                onDone(event.result);
                return;
              } else if (event.type === 'error') {
                onDone(event.result);
                return;
              }
            } catch (e) {
              console.error('Failed to parse SSE event:', e, line);
            }
          }
        }
      }
    } catch (err) {
      console.warn("Streaming fetch failed. Attempting fallback to REST /api/ask...", err);
      try {
        const fallbackRes = await apiClient.askAgent(question, history);
        onDone(fallbackRes);
      } catch (fallbackErr) {
        onError(fallbackErr);
      }
    }
  },
  
  runEval: async () => {
    const res = await api.post('/eval/run');
    return res.data;
  },
  
  getEvalResults: async (): Promise<EvalResult> => {
    const res = await api.get('/eval/results');
    return res.data;
  },
  
  getDefaultBatchQuestions: async (): Promise<string[]> => {
    try {
      const res = await api.get('/batch-test/default-questions');
      return res.data.questions;
    } catch {
      return [
        "How many DUPLICATE_UTR exceptions do we have?",
        "How many MISSING_PAYMENT exceptions are recorded?",
        "What is the total settled amount for all records?"
      ];
    }
  },

  runBatchTest: async (questions: string[]): Promise<BatchTestResponse> => {
    const res = await api.post('/batch-test', { questions });
    return res.data;
  },

  getDataHistory: async (): Promise<HistoryIndexResponse> => {
    const res = await api.get('/data/history');
    return res.data;
  },

  restoreRun: async (run_id: string): Promise<{ status: string; message: string; active_run_id: string }> => {
    const res = await api.post('/data/restore', { run_id });
    return res.data;
  },

  getGeneratedData: async (
    table: string = 'orders',
    run_id?: string,
    limit: number = 100,
    offset: number = 0,
    search?: string
  ): Promise<GeneratedDataResponse> => {
    const params: Record<string, any> = { table, limit, offset };
    if (run_id) params.run_id = run_id;
    if (search) params.search = search;
    const res = await api.get('/data/generated', { params });
    return res.data;
  },

  getMoneyFlow: async (): Promise<MoneyFlowData> => {
    const res = await api.get('/money-flow');
    return res.data;
  }
};
