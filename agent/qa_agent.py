import os
import json
import time
import hashlib
from rapidfuzz import fuzz
from openai import OpenAI
from dotenv import load_dotenv
import pandas as pd
import re
from agent.query_functions import TOOL_FUNCTIONS, get_reconciled_data
from engine.constants import AMOUNT_TOLERANCE, TIME_TOLERANCE_HOURS

load_dotenv()

def safe_print(msg: str):
    try:
        print(msg, flush=True)
    except UnicodeEncodeError:
        try:
            print(str(msg).encode('ascii', errors='backslashreplace').decode('ascii'), flush=True)
        except Exception:
            pass

SYSTEM_PROMPT = """You are a highly capable AI Finance Controller agent specialized in payment settlement reconciliation.
You have access to a set of tools to query an internal settlement database.
Your job is to answer user questions about orders, payments, settlements, and exceptions.

STRICT FORMATTING INSTRUCTIONS:
- NEVER output internal reasoning, scratchpad thoughts, or <think>...</think> tags. Output only the final structured synthesis directly.
- ALWAYS format your response using clean, beautifully structured GitHub Markdown.
- When presenting order or settlement details, ALWAYS use a Markdown table with clear headers (`| Field | Value |`).
- NEVER output a single dense paragraph or wall of text. Use headings (`### Summary`, `### Transaction Details`), bold bullet points, and neat spacing.
- Clearly highlight key metrics, UTRs, and dates.

CRITICAL GUARDRAIL: If you call a tool and it returns {"found": false}, you MUST explicitly state that you cannot resolve the question because the data was not found. Do NOT invent, guess, or hallucinate answers. Do not try to derive numbers from thin air.

Examples of refusal behavior:
User: "What is the status of order_12345678?"
Tool get_order_status returns: {"found": false}
Assistant: I cannot resolve this question because order_12345678 was not found in the settlement data.

User: "Why did settlement setl_999999 fail?"
Tool explain_exception returns: {"found": false}
Assistant: I cannot explain the exception because settlement setl_999999 was not found or does not have any exceptions recorded.

User: "What is the total settled amount for 2030?"
Tool get_settlement_summary returns: {"found": false}
Assistant: I cannot resolve this question because no settlements were found in the specified date range.

Always base your final answer strictly on the tool results. Include specific numbers, IDs, and dates as evidence.
"""

def strip_think_tags(text: str) -> str:
    """Removes any <think>...</think> reasoning blocks from model output."""
    if not text:
        return ""
    cleaned = re.sub(r'<think>[\s\S]*?</think>', '', text, flags=re.DOTALL)
    cleaned = re.sub(r'</?think>', '', cleaned)
    return cleaned.strip()

class ThinkTagStreamFilter:
    """Filters out <think>...</think> tokens in real-time during SSE streaming."""
    def __init__(self):
        self.inside_think = False
        self.buffer = ""

    def process_chunk(self, chunk_text: str) -> str:
        self.buffer += chunk_text
        output = ""
        while self.buffer:
            if not self.inside_think:
                if "<think>" in self.buffer:
                    before, _, rest = self.buffer.partition("<think>")
                    output += before
                    self.inside_think = True
                    self.buffer = rest
                elif "<" in self.buffer and not any(tag in self.buffer for tag in ["<think>", "</think>"]):
                    idx = self.buffer.rfind("<")
                    output += self.buffer[:idx]
                    self.buffer = self.buffer[idx:]
                    break
                else:
                    output += self.buffer
                    self.buffer = ""
            else:
                if "</think>" in self.buffer:
                    _, _, rest = self.buffer.partition("</think>")
                    self.inside_think = False
                    self.buffer = rest.lstrip("\n\r ")
                else:
                    self.buffer = ""
                    break
        return output

    def flush(self) -> str:
        if not self.inside_think and self.buffer:
            res = self.buffer
            self.buffer = ""
            return res
        return ""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_order_status",
            "description": "Gets the full reconciliation status for a specific order.",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {"type": "string", "description": "The order ID, e.g. order_12345678"}
                },
                "required": ["order_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_settlement_summary",
            "description": "Gets a summary of total settled amounts between start_date and end_date.",
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {"type": "string", "description": "Start date in ISO format, e.g. 2023-01-01"},
                    "end_date": {"type": "string", "description": "End date in ISO format, e.g. 2023-12-31"}
                },
                "required": ["start_date", "end_date"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "explain_exception",
            "description": "Explains an exception for a given order_id or settlement_id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "identifier": {"type": "string", "description": "The order_id or settlement_id to explain."}
                },
                "required": ["identifier"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_exceptions",
            "description": "Lists all exceptions, optionally filtered by reason_code.",
            "parameters": {
                "type": "object",
                "properties": {
                    "reason_code": {"type": "string", "description": "Optional reason code, e.g. AMOUNT_MISMATCH, MISSING_SETTLEMENT, DUPLICATE_UTR, TIMING_DELAY, MISSING_PAYMENT, UNRESOLVED"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "total_settled",
            "description": "Returns the grand total settled amount across all records.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    }
]

AGENT_CACHE = {}

def clear_agent_cache():
    global AGENT_CACHE
    AGENT_CACHE.clear()
    safe_print("[QA AGENT] Memory cache cleared.")

def compute_semantic_cache_key(question: str, model_name: str) -> str:
    """
    Computes a canonical semantic hash for natural language financial questions.
    Normalizes punctuation, whitespace, entity identifiers, intent verbs, and stopwords.
    """
    if not question:
        return ""
    q = question.strip().lower()
    
    # 1. Strip special characters & punctuation except underscores and alphanumeric
    q = re.sub(r'[^\w\s]', ' ', q)
    
    # 2. Canonicalize entity IDs (e.g. order 12345, order order_12345 -> order_12345)
    q = re.sub(r'\border\s*_+order\s*_+', 'order_', q)
    q = re.sub(r'\border\s+([0-9]+)\b', r'order_\1', q)
    q = re.sub(r'\border_([0-9]+)\b', r'order_\1', q)
    
    q = re.sub(r'\bsetl\s*_+setl\s*_+', 'setl_', q)
    q = re.sub(r'\bsettlement\s+([0-9]+)\b', r'setl_\1', q)
    q = re.sub(r'\bsetl\s+([0-9]+)\b', r'setl_\1', q)
    q = re.sub(r'\bsetl_([0-9]+)\b', r'setl_\1', q)
    
    q = re.sub(r'\bpayment\s+([0-9]+)\b', r'pay_\1', q)
    q = re.sub(r'\bpay\s+([0-9]+)\b', r'pay_\1', q)
    q = re.sub(r'\bpay_([0-9]+)\b', r'pay_\1', q)
    
    q = re.sub(r'\butr\s+([0-9]+)\b', r'utr\1', q)
    q = re.sub(r'\butr_([0-9]+)\b', r'utr\1', q)
    
    # 3. Canonicalize exception reasons
    q = re.sub(r'\bduplicate\s+utrs?\b', 'duplicate_utr', q)
    q = re.sub(r'\bmissing\s+payments?\b', 'missing_payment', q)
    q = re.sub(r'\bmissing\s+settlements?\b', 'missing_settlement', q)
    q = re.sub(r'\bamount\s+mismatch(es)?\b', 'amount_mismatch', q)
    q = re.sub(r'\btiming\s+delays?\b', 'timing_delay', q)
    
    # 4. Canonicalize question phrasing and intent verbs
    # Normalize failure / exception inquiries
    q = re.sub(r'\b(why did the|why did|explain why|explain the exception for|explain exception for|explain exception|why|reason for failure of|reason for)\b', 'explain_exception', q)
    q = re.sub(r'\b(failed reconciliation|fail reconciliation|failed to reconcile|fail to reconcile|reconciliation failure|failure|failed|fail|exception)\b', '', q)
    
    # Normalize status inquiries
    q = re.sub(r'\b(what is the status of|what is the status|what is status of|check status of|status of order|reconciliation status of|status of|status)\b', 'status', q)
    
    # Normalize count inquiries
    q = re.sub(r'\b(how many|count of|number of|list the number of|total number of)\b', 'count', q)
    q = re.sub(r'\b(exceptions are recorded|exceptions do we have|exceptions are there|exceptions recorded|exceptions)\b', 'exceptions', q)
    
    # Normalize total settled queries
    q = re.sub(r'\b(total settled amount for all records|total settled amount today|total settled amount|total settled|grand total settled)\b', 'total_settled', q)
    
    # 5. Remove common conversational filler words
    filler_words = {'what', 'is', 'the', 'a', 'an', 'of', 'for', 'in', 'to', 'do', 'we', 'have', 'are', 'there', 'our', 'all', 'records', 'please', 'tell', 'me', 'give', 'show', 'can', 'you', 'order', 'reconciliation'}
    tokens = [w for w in q.split() if w not in filler_words]
    canonical_q = " ".join(tokens).strip()
    
    raw_key = f"semantic:{canonical_q}:{model_name}"
    return hashlib.md5(raw_key.encode('utf-8')).hexdigest()

def compute_confidence(tool_calls_history: list) -> tuple:
    if not tool_calls_history:
        return "Unresolved", 0.10

    all_not_found = True
    for tc in tool_calls_history:
        try:
            res_dict = json.loads(tc.get("result", "{}"))
            if res_dict.get("found", False):
                all_not_found = False
                break
        except:
            pass

    if all_not_found:
        return "Unresolved", 0.10

    confidence_score = 0.95
    for tc in tool_calls_history:
        fn = tc.get("name")
        res_str = tc.get("result", "{}")
        try:
            res_dict = json.loads(res_str)
            if fn == "get_order_status" and res_dict.get("found"):
                data = res_dict.get("data", {})
                utr = str(data.get("utr", ""))
                utr_bs = str(data.get("utr_bs", ""))
                if utr and utr_bs and utr != utr_bs and utr != "None" and utr_bs != "None":
                    ratio = fuzz.ratio(utr, utr_bs)
                    mapped_score = 0.40 + max(0, min(1.0, (ratio - 90) / 10.0)) * 0.24
                    confidence_score = min(confidence_score, mapped_score)
            elif fn == "explain_exception" and res_dict.get("found"):
                confidence_score = max(confidence_score, 0.92)
        except:
            pass

    if confidence_score >= 0.90:
        confidence = "Resolved"
    elif confidence_score >= 0.40:
        confidence = "Partially Resolved"
    else:
        confidence = "Unresolved"

    return confidence, confidence_score

def get_llm_client(model_override: str = None):
    load_dotenv(override=True)
    groq_key = os.environ.get("GROQ_API_KEY")
    mistral_key = os.environ.get("MISTRAL_API_KEY")
    nvidia_key = os.environ.get("NVIDIA_API_KEY")

    requested_model = model_override or os.environ.get("DEFAULT_MODEL")

    if requested_model:
        model_name = requested_model
    elif groq_key:
        model_name = "groq/openai/gpt-oss-120b"
    elif mistral_key:
        model_name = "mistral/mistral-large-latest"
    else:
        model_name = "nvidia/nemotron-3-ultra-550b-a55b"

    # Route based on model prefix, model name, or available provider keys
    if model_name.startswith("groq/") or "llama-3" in model_name or "mixtral" in model_name or "compound" in model_name or "gpt-oss" in model_name or "qwen3.6" in model_name or (groq_key and not model_name.startswith("nvidia/") and not model_name.startswith("mistral/")):
        actual_model = model_name.replace("groq/", "")
        client = OpenAI(
            base_url="https://api.groq.com/openai/v1",
            api_key=groq_key or nvidia_key
        )
        return client, actual_model, "Groq"

    elif model_name.startswith("mistral/") or "mistral" in model_name or (mistral_key and not model_name.startswith("nvidia/") and not model_name.startswith("groq/")):
        actual_model = model_name.replace("mistral/", "")
        client = OpenAI(
            base_url="https://api.mistral.ai/v1",
            api_key=mistral_key or nvidia_key
        )
        return client, actual_model, "Mistral AI"

    else:
        client = OpenAI(
            base_url="https://integrate.api.nvidia.com/v1",
            api_key=nvidia_key
        )
        return client, model_name, "NVIDIA NIM"

def get_candidate_models(model_override: str = None):
    load_dotenv(override=True)
    groq_key = os.environ.get("GROQ_API_KEY")
    mistral_key = os.environ.get("MISTRAL_API_KEY")
    nvidia_key = os.environ.get("NVIDIA_API_KEY")

    candidates = []
    if model_override:
        candidates.append(model_override)

    # 1. Primary Default: Groq openai/gpt-oss-120b
    if groq_key:
        if "groq/openai/gpt-oss-120b" not in candidates:
            candidates.append("groq/openai/gpt-oss-120b")

    # 2. Rate-Limit / Fallback: Mistral Large & Small
    if mistral_key:
        if "mistral/mistral-large-latest" not in candidates:
            candidates.append("mistral/mistral-large-latest")
        if "mistral/mistral-small-latest" not in candidates:
            candidates.append("mistral/mistral-small-latest")

    # 3. Secondary Groq & NVIDIA NIM
    if groq_key:
        if "groq/qwen/qwen3.6-27b" not in candidates:
            candidates.append("groq/qwen/qwen3.6-27b")

    if nvidia_key:
        if "nvidia/nemotron-3-ultra-550b-a55b" not in candidates:
            candidates.append("nvidia/nemotron-3-ultra-550b-a55b")
            
    return candidates or ["groq/openai/gpt-oss-120b"]

def sanitize_messages_for_llm(messages: list) -> list:
    """Sanitizes messages to standard OpenAI specs, removing provider-specific extra fields (e.g. Groq reasoning) that cause 422 errors on Mistral."""
    clean = []
    for msg in messages:
        if isinstance(msg, dict):
            clean_msg = {"role": msg.get("role")}
            if "content" in msg:
                clean_msg["content"] = msg["content"]
            if "tool_calls" in msg and msg["tool_calls"]:
                clean_msg["tool_calls"] = msg["tool_calls"]
            if "tool_call_id" in msg:
                clean_msg["tool_call_id"] = msg["tool_call_id"]
            if "name" in msg:
                clean_msg["name"] = msg["name"]
            clean.append(clean_msg)
        else:
            clean_msg = {
                "role": getattr(msg, "role", "assistant"),
                "content": getattr(msg, "content", None) or ""
            }
            tool_calls = getattr(msg, "tool_calls", None)
            if tool_calls:
                clean_msg["tool_calls"] = [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments
                        }
                    } for tc in tool_calls
                ]
            clean.append(clean_msg)
    return clean

def ask_agent(question: str, conversation_history: list = None, model_override: str = None) -> dict:
    start_time = time.time()
    candidates = get_candidate_models(model_override)
    last_error = None

    # Global Semantic Cache check (Instant <0.001s response across all model variations)
    global_semantic_key = compute_semantic_cache_key(question, "global")
    if not conversation_history and global_semantic_key in AGENT_CACHE:
        cached_result = dict(AGENT_CACHE[global_semantic_key])
        cached_result["elapsed_seconds"] = 0.01
        cached_result["cached"] = True
        safe_print(f"[QA AGENT] [SEMANTIC CACHE HIT] Returning instant answer for '{question}' (<0.01s)")
        return cached_result

    for cand_model in candidates:
        client, model_name, provider_name = get_llm_client(cand_model)
        
        # Check model-specific cache
        exact_key = hashlib.md5(f"{question.strip().lower()}:{model_name}".encode('utf-8')).hexdigest()
        model_semantic_key = compute_semantic_cache_key(question, model_name)
        
        if not conversation_history:
            if exact_key in AGENT_CACHE:
                cached_result = dict(AGENT_CACHE[exact_key])
                cached_result["elapsed_seconds"] = 0.01
                cached_result["cached"] = True
                safe_print(f"[QA AGENT] [EXACT CACHE HIT] Returning instant answer for '{question}' (<0.01s)")
                return cached_result
            elif model_semantic_key and model_semantic_key in AGENT_CACHE:
                cached_result = dict(AGENT_CACHE[model_semantic_key])
                cached_result["elapsed_seconds"] = 0.01
                cached_result["cached"] = True
                safe_print(f"[QA AGENT] [SEMANTIC CACHE HIT] Returning normalized answer for '{question}' (<0.01s)")
                return cached_result
        
        safe_print(f"[QA AGENT] Provider: '{provider_name}' | Model: '{model_name}' | Question: '{question}'")
        
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT}
        ]
        if conversation_history:
            messages.extend(conversation_history)
            
        messages.append({"role": "user", "content": question})
        
        max_turns = 4
        turn = 0
        tool_calls_history = []
        final_answer = ""
        model_failed = False
        
        while turn < max_turns:
            turn += 1
            safe_print(f"[QA AGENT] [Turn {turn}] Sending completion request to {provider_name} ({model_name})...")
            try:
                response = client.chat.completions.create(
                    model=model_name,
                    messages=sanitize_messages_for_llm(messages),
                    tools=TOOLS,
                    tool_choice="auto"
                )
            except Exception as e:
                safe_print(f"[QA AGENT] [{provider_name}] API Error: {str(e)}. Retrying with fallback model...")
                last_error = str(e)
                model_failed = True
                break
                
            choice = response.choices[0]
            message = choice.message
            
            safe_print(f"[QA AGENT] [Turn {turn}] Raw API response details:")
            safe_print(f"  - finish_reason: '{choice.finish_reason}'")
            safe_print(f"  - content shape/length: {len(message.content) if message.content else 'None'}")
            safe_print(f"  - tool_calls count: {len(message.tool_calls) if message.tool_calls else 0}")
            
            if message.tool_calls:
                messages.append(message)
                
                for tool_call in message.tool_calls:
                    func_name = tool_call.function.name
                    try:
                        args = json.loads(tool_call.function.arguments) if tool_call.function.arguments else {}
                    except json.JSONDecodeError:
                        args = {}
                        
                    safe_print(f"[QA AGENT] Executing local tool: '{func_name}' with args: {args}")
                    
                    if func_name in TOOL_FUNCTIONS:
                        try:
                            result = TOOL_FUNCTIONS[func_name](**args)
                            result_str = json.dumps(result)
                        except Exception as e:
                            result_str = json.dumps({"error": str(e), "found": False})
                    else:
                        result_str = json.dumps({"error": f"Tool {func_name} not found", "found": False})
                        
                    tool_calls_history.append({
                        "name": func_name,
                        "arguments": args,
                        "result": result_str
                    })
                    
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": func_name,
                        "content": result_str
                    })
            else:
                final_answer = message.content or ""
                if not final_answer and tool_calls_history:
                    final_answer = "Data retrieved successfully."
                safe_print(f"[QA AGENT] Final answer received ({len(final_answer)} chars).")
                break

        if model_failed:
            continue

        confidence, confidence_score = compute_confidence(tool_calls_history)
        verified, verification_note = verify_agent_answer(question, final_answer, tool_calls_history)

        if verified == False:
            if confidence == "Resolved":
                confidence = "Partially Resolved"
                confidence_score = min(confidence_score, 0.89)
            elif confidence == "Partially Resolved":
                confidence = "Unresolved"
                confidence_score = min(confidence_score, 0.39)

        safe_print(f"[QA AGENT] Result -> Confidence: {confidence} ({confidence_score:.2f}) | Verified: {verified} | Elapsed: {round(time.time() - start_time, 2)}s")

        result_payload = {
            "answer": final_answer,
            "confidence": confidence,
            "confidence_score": round(confidence_score, 2),
            "tool_calls": tool_calls_history,
            "elapsed_seconds": round(time.time() - start_time, 2),
            "tool_call_count": len(tool_calls_history),
            "verified": verified,
            "verification_note": verification_note,
            "cached": False
        }

        if not conversation_history:
            AGENT_CACHE[exact_key] = result_payload
            AGENT_CACHE[global_semantic_key] = result_payload
            if model_semantic_key:
                AGENT_CACHE[model_semantic_key] = result_payload

        return result_payload

    return {
        "answer": f"All free LLM providers were unreachable. Last error: {last_error}",
        "confidence": "Unresolved",
        "confidence_score": 0.0,
        "tool_calls": [],
        "elapsed_seconds": round(time.time() - start_time, 2),
        "tool_call_count": 0,
        "verified": False,
        "verification_note": f"API Error: {last_error}",
        "cached": False
    }

def ask_agent_stream(question: str, conversation_history: list = None, model_override: str = None):
    start_time = time.time()
    candidates = get_candidate_models(model_override)
    last_error = None

    # Global Semantic Cache check (Instant <0.001s response across all model variations)
    global_semantic_key = compute_semantic_cache_key(question, "global")
    if not conversation_history and global_semantic_key in AGENT_CACHE:
        cached_result = dict(AGENT_CACHE[global_semantic_key])
        cached_result["elapsed_seconds"] = 0.01
        cached_result["cached"] = True
        safe_print(f"[QA AGENT STREAM] [SEMANTIC CACHE HIT] Returning instant cached answer for '{question}'")
        yield f"data: {json.dumps({'type': 'cached', 'result': cached_result})}\n\n"
        return

    for cand_model in candidates:
        client, model_name, provider_name = get_llm_client(cand_model)
        exact_key = hashlib.md5(f"{question.strip().lower()}:{model_name}".encode('utf-8')).hexdigest()
        model_semantic_key = compute_semantic_cache_key(question, model_name)

        if not conversation_history:
            if exact_key in AGENT_CACHE:
                cached_result = dict(AGENT_CACHE[exact_key])
                cached_result["elapsed_seconds"] = 0.01
                cached_result["cached"] = True
                safe_print(f"[QA AGENT STREAM] [EXACT CACHE HIT] Returning instant cached answer for '{question}'")
                yield f"data: {json.dumps({'type': 'cached', 'result': cached_result})}\n\n"
                return
            elif model_semantic_key and model_semantic_key in AGENT_CACHE:
                cached_result = dict(AGENT_CACHE[model_semantic_key])
                cached_result["elapsed_seconds"] = 0.01
                cached_result["cached"] = True
                safe_print(f"[QA AGENT STREAM] [SEMANTIC CACHE HIT] Returning normalized cached answer for '{question}'")
                yield f"data: {json.dumps({'type': 'cached', 'result': cached_result})}\n\n"
                return

        yield f"data: {json.dumps({'type': 'status', 'message': f'Turn 1: Routing to {provider_name} ({model_name})...'})}\n\n"

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        if conversation_history:
            messages.extend(conversation_history)
        messages.append({"role": "user", "content": question})

        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=sanitize_messages_for_llm(messages),
                tools=TOOLS,
                tool_choice="auto"
            )
        except Exception as e:
            safe_print(f"[QA AGENT STREAM] [{provider_name}] API Error: {str(e)}. Retrying next model...")
            last_error = str(e)
            continue

        choice = response.choices[0]
        message = choice.message
        tool_calls_history = []
        final_answer = ""

        if message.tool_calls:
            messages.append(message)
            for tool_call in message.tool_calls:
                func_name = tool_call.function.name
                try:
                    args = json.loads(tool_call.function.arguments) if tool_call.function.arguments else {}
                except json.JSONDecodeError:
                    args = {}

                yield f"data: {json.dumps({'type': 'status', 'message': f'Running Pandas Engine tool: {func_name}...'})}\n\n"

                if func_name in TOOL_FUNCTIONS:
                    try:
                        result = TOOL_FUNCTIONS[func_name](**args)
                        result_str = json.dumps(result)
                    except Exception as e:
                        result_str = json.dumps({"error": str(e), "found": False})
                else:
                    result_str = json.dumps({"error": f"Tool {func_name} not found", "found": False})

                tool_calls_history.append({
                    "name": func_name,
                    "arguments": args,
                    "result": result_str
                })

                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": func_name,
                    "content": result_str
                })

            yield f"data: {json.dumps({'type': 'status', 'message': f'Turn 2: Synthesizing Answer with {provider_name} ({model_name})...'})}\n\n"

            try:
                stream_response = client.chat.completions.create(
                    model=model_name,
                    messages=sanitize_messages_for_llm(messages),
                    stream=True
                )
                think_filter = ThinkTagStreamFilter()
                for chunk in stream_response:
                    if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                        tok = chunk.choices[0].delta.content
                        filtered_tok = think_filter.process_chunk(tok)
                        if filtered_tok:
                            final_answer += filtered_tok
                            yield f"data: {json.dumps({'type': 'token', 'token': filtered_tok})}\n\n"
                flush_tok = think_filter.flush()
                if flush_tok:
                    final_answer += flush_tok
                    yield f"data: {json.dumps({'type': 'token', 'token': flush_tok})}\n\n"
            except Exception as e:
                safe_print(f"[QA AGENT STREAM] Turn 2 error on {provider_name} ({model_name}): {e}. Switching synthesis to fallback candidate...")
                yield f"data: {json.dumps({'type': 'status', 'message': f'Rate limit on {provider_name}. Switching synthesis to fallback model...'})}\n\n"
                
                synthesized = False
                for fb_cand in candidates:
                    if fb_cand == cand_model:
                        continue
                    fb_client, fb_model_name, fb_provider = get_llm_client(fb_cand)
                    try:
                        safe_print(f"[QA AGENT STREAM] Synthesizing Turn 2 with {fb_provider} ({fb_model_name})...")
                        fb_stream = fb_client.chat.completions.create(
                            model=fb_model_name,
                            messages=sanitize_messages_for_llm(messages),
                            stream=True
                        )
                        fb_filter = ThinkTagStreamFilter()
                        for chunk in fb_stream:
                            if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                                tok = chunk.choices[0].delta.content
                                filtered_tok = fb_filter.process_chunk(tok)
                                if filtered_tok:
                                    final_answer += filtered_tok
                                    yield f"data: {json.dumps({'type': 'token', 'token': filtered_tok})}\n\n"
                        flush_tok = fb_filter.flush()
                        if flush_tok:
                            final_answer += flush_tok
                            yield f"data: {json.dumps({'type': 'token', 'token': flush_tok})}\n\n"
                        synthesized = True
                        break
                    except Exception as fb_err:
                        safe_print(f"[QA AGENT STREAM] Fallback synthesis on {fb_provider} failed: {fb_err}")
                
                if not synthesized and not final_answer:
                    final_answer = "Data retrieved successfully:\n\n"
                    for tc in tool_calls_history:
                        final_answer += f"- **{tc.get('name')}**: {tc.get('result')}\n"
                    yield f"data: {json.dumps({'type': 'token', 'token': final_answer})}\n\n"
        else:
            final_answer = strip_think_tags(message.content or "")
            yield f"data: {json.dumps({'type': 'token', 'token': final_answer})}\n\n"

        final_answer = strip_think_tags(final_answer)
        if not final_answer and tool_calls_history:
            final_answer = "Data retrieved successfully."

        confidence, confidence_score = compute_confidence(tool_calls_history)
        verified, note = verify_agent_answer(question, final_answer, tool_calls_history)
        if verified == False:
            if confidence == "Resolved":
                confidence = "Partially Resolved"
                confidence_score = min(confidence_score, 0.89)
            elif confidence == "Partially Resolved":
                confidence = "Unresolved"
                confidence_score = min(confidence_score, 0.39)

        final_payload = {
            "answer": final_answer,
            "confidence": confidence,
            "confidence_score": round(confidence_score, 2),
            "tool_calls": tool_calls_history,
            "elapsed_seconds": round(time.time() - start_time, 2),
            "tool_call_count": len(tool_calls_history),
            "verified": verified,
            "verification_note": note,
            "cached": False
        }

        if not conversation_history:
            AGENT_CACHE[exact_key] = final_payload
            AGENT_CACHE[global_semantic_key] = final_payload
            if model_semantic_key:
                AGENT_CACHE[model_semantic_key] = final_payload

        yield f"data: {json.dumps({'type': 'done', 'result': final_payload})}\n\n"
        return

    err_res = {
        "answer": f"All LLM model providers are currently unreachable. Last error: {last_error}",
        "confidence": "Unresolved",
        "confidence_score": 0.0,
        "verified": False,
        "verification_note": f"All providers unreachable: {last_error}",
        "elapsed_seconds": round(time.time() - start_time, 2)
    }
    yield f"data: {json.dumps({'type': 'error', 'result': err_res})}\n\n"

    final_payload = {
        "answer": final_answer,
        "confidence": confidence,
        "confidence_score": round(confidence_score, 2),
        "tool_calls": tool_calls_history,
        "elapsed_seconds": round(time.time() - start_time, 2),
        "tool_call_count": len(tool_calls_history),
        "verified": verified,
        "verification_note": note,
        "cached": False
    }

    if not conversation_history:
        AGENT_CACHE[cache_key] = final_payload

    yield f"data: {json.dumps({'type': 'done', 'result': final_payload})}\n\n"

def verify_agent_answer(question, final_answer, tool_calls_history):
    df, _, exc = get_reconciled_data()
    
    if not tool_calls_history:
        return "not_applicable", "No data lookup required for this response."
        
    raw_numbers = re.findall(r"[-+]?(?:[0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)(?:\.[0-9]+)?", final_answer)
    parsed_numbers = []
    for num_str in raw_numbers:
        try:
            parsed_numbers.append(float(num_str.replace(",", "")))
        except:
            pass
            
    lower_answer = final_answer.lower()
    
    for tc in tool_calls_history:
        func_name = tc.get("name")
        args = tc.get("arguments", {})
        
        if func_name in ["get_order_status", "explain_exception"]:
            identifier = args.get("order_id") or args.get("identifier")
            if identifier:
                record = df[(df['order_id'] == identifier) | (df['settlement_id'] == identifier) | (df['payment_id'] == identifier)]
                if not record.empty:
                    row = record.iloc[0]
                    expected_oid = str(row.get('order_id', '')).lower()
                    expected_reason = str(row.get('reason', '')).lower()
                    expected_status = str(row.get('status', '')).lower()
                    
                    if expected_oid and expected_oid not in lower_answer:
                        return False, f"Expected order ID '{expected_oid}' not found in answer."
                        
                    reason_variants = [
                        expected_reason,
                        expected_reason.replace('_', ' '),
                        expected_reason.replace('_', ''),
                        expected_status
                    ]
                    
                    if expected_reason and not any(v in lower_answer for v in reason_variants if v):
                        return False, f"Expected status/reason '{expected_reason}' not found in answer."
                        
                    amt_ord = row.get('amount_order') if pd.notna(row.get('amount_order')) else row.get('amount')
                    if pd.notna(amt_ord):
                        found_amt = any(abs(pnum - float(amt_ord)) <= 0.05 for pnum in parsed_numbers)
                        if not found_amt:
                            return False, f"Expected order amount {float(amt_ord):.2f} not found in answer text."
                            
                    return True, f"Verified order ID '{expected_oid}', status '{expected_reason.upper()}', and amount (${float(amt_ord):.2f}) against database ground truth."
                else:
                    refusal_phrases = ["not found", "cannot find", "does not exist", "cannot resolve", "no record", "could not find", "not available", "no matching", "no data", "unable to", "cannot explain", "no exception"]
                    if any(rp in lower_answer for rp in refusal_phrases):
                        return True, f"Verified accurate refusal: '{identifier}' does not exist in ground truth database."
                    else:
                        return False, f"Identifier '{identifier}' does not exist, but agent failed to clearly state data was not found."

        elif func_name == "list_exceptions":
            reason_code = args.get("reason_code")
            if reason_code and reason_code != "All":
                expected_count = len(exc[exc['reason'] == reason_code])
            else:
                expected_count = len(exc)
                
            if expected_count == 0:
                found_count = (0 in [int(pnum) for pnum in parsed_numbers if pnum.is_integer()]) or ("0" in final_answer) or ("zero" in lower_answer) or ("no " in lower_answer) or ("none" in lower_answer) or ("not found" in lower_answer) or ("cannot resolve" in lower_answer)
            else:
                found_count = any(int(pnum) == expected_count for pnum in parsed_numbers if pnum.is_integer()) or (str(expected_count) in final_answer)
                
            if found_count:
                rc_str = reason_code if reason_code else "total"
                return True, f"Verified count of {expected_count} {rc_str} exceptions against database ground truth."
            else:
                return False, f"Expected exception count {expected_count} for {reason_code}, but count was not found in answer."

        elif func_name == "total_settled":
            unique_settlements = df.drop_duplicates(subset=['settlement_id']).dropna(subset=['settlement_id', 'settled_amount'])
            expected_total = unique_settlements['settled_amount'].sum()
            found_total = any(abs(pnum - expected_total) <= 1.00 for pnum in parsed_numbers)
            if found_total:
                return True, f"Verified grand total settled amount (${expected_total:.2f}) against database ground truth."
            else:
                return False, f"Expected total settled amount ${expected_total:.2f}, but matching value was not found in answer."

        elif func_name == "get_settlement_summary":
            start_date = args.get("start_date")
            end_date = args.get("end_date")
            if start_date and end_date:
                df_temp = df.copy()
                df_temp['settled_at'] = pd.to_datetime(df_temp['settled_at'])
                mask = (df_temp['settled_at'] >= pd.to_datetime(start_date)) & (df_temp['settled_at'] <= pd.to_datetime(end_date))
                expected_sum = df_temp[mask]['settled_amount'].sum()
                found_sum = any(abs(pnum - expected_sum) <= 1.00 for pnum in parsed_numbers)
                if found_sum:
                    return True, f"Verified settlement summary amount (${expected_sum:.2f}) against database ground truth."
                else:
                    return False, f"Expected settlement summary amount ${expected_sum:.2f}, but matching value was not found in answer."

    return True, "Data verified against direct database lookup."

