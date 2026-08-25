# ⚡ PARC — Payment & Autonomous Reconciliation Controller

> An enterprise-grade, AI-powered **Financial Reconciliation & Settlement Q&A Engine** designed to ingest multi-source payment streams, deterministically detect discrepancies, and answer natural-language inquiries with ground-truth verification, multi-provider failover, and interactive dashboards.

---

## 🌟 Key Highlights & Architecture

```
                               ┌────────────────────────────────┐
                               │       Raw Data Streams         │
                               │  Orders • Payments •           │
                               │  Settlements • Bank Statements │
                               └───────────────┬────────────────┘
                                               │
                                               ▼
                               ┌────────────────────────────────┐
                               │  Reconciliation Engine         │
                               │  • 4-Way Entity Join           │
                               │  • RapidFuzz UTR Resolution    │
                               │  • Tolerance & Leakage Calc    │
                               └───────────────┬────────────────┘
                                               │
                        ┌──────────────────────┴──────────────────────┐
                        ▼                                             ▼
             ┌─────────────────────────┐                   ┌─────────────────────────┐
             │    Exceptions Triage    │                   │   Smart Semantic Cache  │
             │   6-Category Classifier │                   │   Multi-Stage Normalizer│
             │ (AMOUNT_MISMATCH, etc.) │                   │   (<0.01s Instant Hits) │
             └──────────┬──────────────┘                   └────────────┬────────────┘
                        │                                               │
                        ▼                                               ▼
             ┌───────────────────────────────────────────────────────────────────────┐
             │                    Autonomous Multi-Turn QA Agent                     │
             │   • Primary LLM: Groq (openai/gpt-oss-120b)                           │
             │   • Failover LLM: Mistral AI (mistral-large-latest / small-latest)    │
             │   • Fallback LLM: NVIDIA NIM (nemotron-3-ultra-550b-a55b)             │
             │   • Schema Sanitizer & Real-time Thinking Tag Stream Filter           │
             │   • Local Tool Function Dispatcher & Independent Fact Verifier        │
             └───────────────────────────────────┬───────────────────────────────────┘
                                                 │
                                                 ▼
             ┌───────────────────────────────────────────────────────────────────────┐
             │                 Modern React 19 + Vite Web Application                │
             │   • Overview Dashboard (KPIs, Match Gauge, Money Flow Visualizer)     │
             │   • Ask Agent (SSE Streaming Chat, Voice Input, Follow-Up Chips)      │
             │   • Exceptions Workspace (Filtering, Search, Triage Details)          │
             │   • Eval Benchmark Center (10-Question Ground-Truth Verified Suite)   │
             │   • Batch Testing Lab (Concurrent Execution & Performance Analytics)  │
             └───────────────────────────────────────────────────────────────────────┘
```

---

## 📋 Comprehensive Feature Breakdown

### 1. 🔄 Deterministic Reconciliation & Anomaly Engine
- **4-Way Transaction Merge**: Cross-references four independent ledger systems: `Orders -> Payments -> Settlements -> Bank Statement`.
- **RapidFuzz Fuzzy UTR Matching**: Resolves drifted, truncated, or formatted bank reference strings (e.g. `UTR99127446901` vs `UTR-99127446901-X`).
- **Precision Tolerance Engine**:
  - `AMOUNT_TOLERANCE`: Configurable threshold (default: ₹0.05) to accommodate minor banking fees.
  - `TIME_TOLERANCE_HOURS`: Configurable settlement SLA threshold (default: 72 hours).
- **6-Category Automated Exception Classifier**:
  1. `AMOUNT_MISMATCH`: Discrepancy between captured order amount vs. settled bank credit.
  2. `DUPLICATE_UTR`: The same bank reference number used across multiple distinct settlements.
  3. `MISSING_PAYMENT`: Order captured with no corresponding payment gateway confirmation.
  4. `MISSING_SETTLEMENT`: Payment captured but missing settlement transfer records.
  5. `TIMING_DELAY`: Settlement completed outside the allowable SLA window.
  6. `UNRESOLVED`: Orphaned or contradictory multi-way records.
- **Financial Leakage Calculator**: Computes exact monetary exposure for unmatched and disputed transactions.

---

### 2. 🤖 Autonomous Multi-Turn QA Agent & LLM Pipeline
- **Multi-Provider Failover Architecture**:
  - **Primary**: **Groq `openai/gpt-oss-120b`** for ultra-low latency inference and function calling.
  - **Rate-Limit Failover**: **Mistral AI `mistral-large-latest`** & `mistral-small-latest` for seamless quota protection.
  - **Backup Provider**: **NVIDIA NIM `nemotron-3-ultra-550b-a55b`** and Groq Qwen models.
  - **Cross-Provider Schema Sanitizer (`sanitize_messages_for_llm`)**: Automatically scrubs provider-specific custom metadata (e.g. Groq reasoning tags) before passing payloads to other models, preventing 422 schema errors.
- **Tool Calling / Function Dispatcher**:
  - `get_order_status(order_id)`: Retrieves full order lifecycle, payment gateway confirmation, settlement ID, and UTR.
  - `explain_exception(identifier)`: Delivers root-cause analysis for any order or settlement exception.
  - `list_exceptions(reason_code)`: Returns exception listings filtered by reason code.
  - `get_settlement_summary(start_date, end_date)`: Aggregates settled volume and counts within date ranges.
  - `total_settled()`: Returns the grand total reconciled settlement volume.
- **Real-Time Thinking Tag Stream Filter (`ThinkTagStreamFilter`)**:
  - Intercepts and strips internal reasoning scratchpad tokens (`<think>...</think>`) on the fly during SSE streaming so only clean, structured markdown reaches the user.
- **Post-Generation Fact Verifier (`verify_agent_answer`)**:
  - Programmatically extracts numbers, currency amounts, and entity IDs from the LLM output and validates them against the active ground-truth DataFrame.
- **Tri-State Confidence Scoring**:
  - Evaluates tool execution evidence to tag answers as **`Resolved`** ($\ge 0.90$), **`Partially Resolved`** ($0.40 \dots 0.89$), or **`Unresolved`** ($< 0.40$).

---

### 3. ⚡ Smart Query Semantic Cache
- **Multi-Stage Canonicalization Pipeline**:
  - **Punctuation & Whitespace Stripping**: Normalizes symbols (`?`, `!`, `.`, `,`, `` ` ``).
  - **Entity ID Normalization**: Canonicalizes variations (`order 123`, `order order_123`, `order_123` $\rightarrow$ `order_123`).
  - **Intent Normalization**: Canonicalizes semantic variations (`Why did X fail?`, `Explain exception for X`, `What is the reason for failure of X?` $\rightarrow$ `explain_exception X`).
  - **Stopword & Conversational Padding Removal**: Strips filler words (`please`, `tell me`, `can you`).
- **Turn-0 Global Pre-Check**: Delivers instant **$<0.01\text{s}$** verified responses without consuming LLM API tokens.

---

### 4. 🧪 Ground-Truth Calibrated Evaluation Harness
- **Dynamic 10-Question Benchmark Suite**:
  - **Bucket 1: Exact Match (Order Status & Verification)**: Validates order-level accuracy.
  - **Bucket 2: Exception Triage & Root Cause**: Validates failure explanation fidelity.
  - **Bucket 3: Aggregate Summary & Metrics**: Validates financial arithmetic and counts.
  - **Bucket 4: Negative Control & Refusal Guardrails**: Tests refusal accuracy on non-existent records to ensure zero hallucinations.
- **Real-Time Metrics Engine**:
  - **Overall Accuracy**: Exact correctness against ground truth.
  - **Verified Rate**: Mathematical validation against local database values.
  - **Refusal Rate**: Anti-hallucination guardrail validation.
  - **Average Latency Tracking**: End-to-end timing per turn.
- **Paced Sequential Execution**: Prevents token-per-minute rate limit spikes during automated evaluation.

---

### 5. 📦 Realistic Data Generator & Versioning System
- **Synthetic Financial Stream Generator (`data/generate_data.py`)**:
  - Generates realistic orders, payments, settlements, and bank statement records using `Faker`.
  - Injects realistic edge cases: mismatched amounts, duplicate bank UTRs, delayed settlements, missing payments.
  - Calibrated match rate within the target 85%–95% enterprise reconciliation band.
- **Historical Snapshot & Versioning Controller**:
  - Automatically snapshots datasets into versioned runs (`run_YYYYMMDD_HHMMSS`).
  - **1-Click Historical Rollback**: Restore and test previous datasets directly from the UI or API.
  - **Dataset Inspection Modal**: Inspect and download raw CSVs directly from the dashboard.

---

### 6. 🎙️ Voice-to-Text & Speech-to-Text Engine
- **Browser-Native Web Speech API**: Integrated SpeechRecognition engine with support for standard and webkit prefixes.
- **Hands-Free Financial Triage**: Finance controllers and operations teams can speak questions directly (e.g., *"Why did order 62547357 fail?"* or *"What is the total settled amount today?"*).
- **Real-Time Speech Transcription**: Captures interim speech tokens in real time, automatically transcribes spoken audio into structured text, and triggers autonomous multi-turn tool calling upon speech completion.
- **Live Audio State Indicators**: Visual microphone state feedback (pulse listening indicator, toast status, and auto-abort cleanup on navigation).

---

### 7. 💻 Enterprise React 19 + Vite Frontend Application

#### 📊 Overview Tab (`Overview.tsx`)
- **Executive KPI Cards**: Total Orders, Reconciliation Match Rate %, Financial Leakage Amount, and Total Settlements.
- **Interactive Money Flow Visualizer (`MoneyFlowVisualizer.tsx`)**: Visualizes the flow of funds from Orders $\rightarrow$ Gateway $\rightarrow$ Settled vs Discrepancies.
- **Exceptions Distribution Pie Chart** & **Settlement Timeline Chart**.
- **Dataset Snapshot Manager**: 1-click dataset regeneration and version history restore.

#### 💬 Ask Agent Tab (`AskAgent.tsx`)
- **Real-Time SSE Streaming**: Word-by-word streaming responses with animated status indicators.
- **🎙️ Voice-to-Text Speech Recognition**: 1-click microphone button for spoken financial questions with live audio transcription.
- **Suggested Follow-up Action Chips**: Dynamic, context-aware follow-up action buttons (e.g. `🔍 Show payment gateway details`, `🏦 Check bank statement UTR`, `📊 View all exceptions with this reason`).
- **GitHub Markdown Tables & Badges**: Cleanly formatted financial tables, currency values, and status badges.
- **Expandable Tool Execution Inspector**: Inspect every tool execution turn, passed arguments, and JSON return values.
- **1-Click Copy**: Instant clipboard copying for executive reporting.

#### ⚠️ Exceptions Workspace (`Exceptions.tsx`)
- **Reason Filter Pills**: Filter by `All`, `AMOUNT_MISMATCH`, `DUPLICATE_UTR`, `MISSING_PAYMENT`, `MISSING_SETTLEMENT`, `TIMING_DELAY`, or `UNRESOLVED` with live count badges.
- **Search Bar**: Search across Order IDs, Payment IDs, and Bank UTRs.
- **Accordion Triage Cards**: Inspect order amount, payment amount, settled amount, timestamps, and triage suggestions.

#### 📈 Eval Results Center (`EvalResults.tsx`)
- **Visual KPI Cards**: Overall Accuracy, Ground-truth Verified Rate, and Average Latency.
- **Benchmark Test Suite Table**: Clean markdown answer previews, expected results, confidence badges, and response times.
- **Collapsible Detail Inspector**: Inspect full agent answers and tool call sequences.
- **1-Click Re-Run**: Re-execute the 10-question evaluation harness directly from the UI.

#### 🧪 Batch Testing Lab (`BatchTest.tsx`)
- **Concurrent Test Runner**: Execute multi-query test batches against the QA Agent.
- **Live Progress Bar**: Track completed test cases in real time.
- **Export & Import**: Upload CSV test questions and download structured batch results.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Backend Framework** | FastAPI, Uvicorn (ASGI) |
| **Reconciliation Engine** | Python 3.12+, Pandas, RapidFuzz, Pydantic |
| **LLM & AI Providers** | OpenAI SDK, Groq Cloud API (`gpt-oss-120b`), Mistral AI (`mistral-large`), NVIDIA NIM |
| **Frontend Framework** | React 19, Vite, TypeScript |
| **Styling & Animation** | Tailwind CSS, Lucide React, Framer Motion, Radix UI |
| **Markdown & Formatting** | React Markdown, Remark GFM |
| **Notifications & Audio** | Sonner Toasts, Web Speech API |

---

## 🚀 Getting Started

### 1. Prerequisites
- **Python 3.10+**
- **Node.js 18+** and **npm**

---

### 2. Backend Installation

1. **Clone the repository:**
   ```bash
   git clone <repository_url>
   cd Buildathon
   ```

2. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory (refer to `.env.example`):
   ```env
   GROQ_API_KEY="your_groq_api_key_here"
   MISTRAL_API_KEY="your_mistral_api_key_here"
   NVIDIA_API_KEY="your_nvidia_api_key_here"
   ```

4. **Start the FastAPI Backend Server:**
   ```bash
   python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
   ```
   - API Docs: `http://127.0.0.1:8000/docs`
   - Redoc: `http://127.0.0.1:8000/redoc`

---

### 3. Frontend Installation

1. **Navigate to the frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install npm packages:**
   ```bash
   npm install
   ```

3. **Start the Vite development server:**
   ```bash
   npm run dev
   ```
   - Frontend UI: `http://localhost:5173/`

---

## 🧪 Running Evaluations from Terminal

To run the automated 10-question evaluation benchmark directly from the CLI:
```bash
python -m eval.run_eval
```

---

## 📡 REST & Streaming API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/ask` | Non-streaming QA query endpoint |
| `POST` | `/api/ask/stream` | Server-Sent Events (SSE) streaming QA endpoint |
| `GET` | `/api/overview` | Summary KPIs, match rate, and financial leakage |
| `GET` | `/api/exceptions` | Filtered exception records with search support |
| `GET` | `/api/exceptions/chart-data` | Exception counts grouped by category |
| `GET` | `/api/settlements/timeline` | Settlement volumes grouped by date |
| `GET` | `/api/money-flow` | Transaction stage breakdown for Money Flow chart |
| `POST` | `/api/regenerate-data` | Generates a new synthetic dataset and creates history snapshot |
| `GET` | `/api/data/history` | Lists historical dataset snapshots |
| `POST` | `/api/data/restore` | Restores a specific historical dataset run |
| `GET` | `/api/data/files` | Retrieves raw dataset CSV files for UI inspection |
| `POST` | `/api/eval/run` | Runs the 10-question evaluation harness |
| `GET` | `/api/eval/results` | Retrieves latest evaluation benchmark metrics |
| `POST` | `/api/batch-test` | Executes a batch test suite with progress tracking |

---

## 📂 Directory Structure

```
├── agent/
│   ├── qa_agent.py             # Multi-turn QA Agent, multi-provider failover, semantic cache
│   └── query_functions.py      # Read-only tool functions querying reconciled dataset
├── data/
│   ├── generate_data.py        # Synthetic multi-source financial data generator
│   └── raw/                    # Raw CSVs (orders, payments, settlements, bank_statement)
├── engine/
│   ├── reconcile.py            # 4-way reconciliation engine & RapidFuzz UTR merge
│   ├── exceptions.py           # 6-category exception classification rules
│   └── constants.py            # Tolerance constants (amount & time)
├── eval/
│   ├── run_eval.py             # Dynamic 10-question benchmark evaluation harness
│   └── test_questions.json     # Curated evaluation test questions
├── frontend/                   # React 19 + Vite Single Page Application
│   ├── src/
│   │   ├── pages/              # Overview, AskAgent, Exceptions, EvalResults, BatchTest
│   │   ├── components/         # Custom charts, MoneyFlowVisualizer, KpiCard, UI components
│   │   ├── context/            # DataContext state manager
│   │   └── lib/                # Formatting, Markdown, and string utilities
│   ├── package.json            # Frontend dependencies
│   └── vite.config.ts          # Vite build configuration
├── main.py                     # FastAPI backend application & API routes
├── requirements.txt            # Python dependencies
├── .env.example                # Environment variable template
├── .gitignore                  # Git ignore rules for secrets and build artifacts
└── README.md                   # Comprehensive project documentation
```

---

## 🔒 Security & Best Practices
- Never commit `.env` or sensitive API keys.
- Ensure `.gitignore` is preserved when pushing to version control.
- API keys are hot-reloaded dynamically from `.env` via `load_dotenv(override=True)`.
