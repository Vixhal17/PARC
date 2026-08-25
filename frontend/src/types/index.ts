export interface ToleranceRules {
  amount_tolerance: number;
  time_tolerance_hours: number;
}

export interface CostScaleProjection {
  actual_cap: number;
  bottleneck_msg: string;
  calc_time: string;
}

export interface OverviewData {
  match_rate: number;
  total_records: number;
  exceptions_count: number;
  qa_accuracy: number | null;
  tolerance_rules: ToleranceRules;
  cost_scale_projection: CostScaleProjection | null;
}

export interface ExceptionRecord {
  order_id: string;
  payment_id: string | null;
  settlement_id: string | null;
  utr: string | null;
  amount: number | null;
  settled_amount: number | null;
  credited_amount: number | null;
  reason: string;
  description: string;
  checked_steps: string[];
}

export interface ChartData {
  Reason: string;
  Count: number;
}

export interface TimelineData {
  date: string;
  settled_amount: number;
  credited_amount: number;
}

export interface AskResponse {
  answer: string;
  confidence: string;
  confidence_score: number;
  verified: boolean | "not_applicable";
  elapsed_seconds: number;
  api_calls?: number;
  tool_call_count?: number;
  tool_calls: any[];
  cached?: boolean;
}

export interface EvalResult {
  accuracy: number;
  verified_rate: number;
  calibration: any;
  avg_elapsed_seconds: number;
  avg_api_calls: number;
  details: Record<string, any>;
}

export interface BatchTestResult {
  question: string;
  answer_summary: string;
  confidence_label: string;
  confidence_score: number;
  verified: boolean | "not_applicable";
  elapsed_seconds: number;
}

export interface BatchTestSummary {
  total_questions: number;
  avg_latency: number;
  avg_confidence: number;
  verified_rate: number;
}

export interface BatchTestResponse {
  results: BatchTestResult[];
  summary: BatchTestSummary;
}

export interface GenerationRun {
  run_id: string;
  label: string;
  timestamp: string;
  seed: number;
  total_records: number;
  payments_count: number;
  settlements_count: number;
  bank_records_count: number;
  match_rate: number;
  exceptions_count: number;
  exception_breakdown: Record<string, number>;
  is_active?: boolean;
}

export interface HistoryIndexResponse {
  current_run_id: string;
  active_run_id?: string | null;
  runs: GenerationRun[];
}

export interface GeneratedDataResponse {
  table: string;
  run_id: string;
  total_count: number;
  limit: number;
  offset: number;
  columns: string[];
  rows: Record<string, any>[];
}

export interface MoneyFlowStage {
  id: string;
  name: string;
  count: number;
  amount: number;
  icon: string;
}

export interface MoneyFlowLeakageItem {
  count: number;
  amount: number;
  description: string;
}

export interface MoneyFlowData {
  stages: MoneyFlowStage[];
  leakage: Record<string, MoneyFlowLeakageItem>;
  match_rate: number;
  total_leakage_amount: number;
  total_discrepancies: number;
}
