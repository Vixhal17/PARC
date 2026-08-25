from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import pandas as pd
import json
import os
import subprocess
import asyncio
from typing import List, Optional, Any

from agent.query_functions import get_reconciled_data, get_loaded_data, clear_data_cache
from agent.qa_agent import ask_agent, ask_agent_stream, clear_agent_cache
from engine.constants import AMOUNT_TOLERANCE, TIME_TOLERANCE_HOURS
from eval.run_eval import run_eval_suite

app = FastAPI(title="Settlement Q&A API")
clear_agent_cache()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AskRequest(BaseModel):
    question: str
    conversation_history: Optional[List[dict]] = None

class BatchTestRequest(BaseModel):
    questions: List[str]

class RestoreRunRequest(BaseModel):
    run_id: str

def load_eval_results():
    if os.path.exists("eval/results.json"):
        with open("eval/results.json") as f:
            return json.load(f)
    return None

from data.generate_data import get_history_index, restore_run_from_history

@app.post("/api/regenerate-data")
async def regenerate_data():
    subprocess.run(["python", "data/generate_data.py"])
    clear_data_cache()
    clear_agent_cache()
    history = get_history_index()
    active_run = history.get("runs", [None])[0] if history.get("runs") else None
    return {
        "status": "success", 
        "message": "Data regenerated & reconciled!",
        "run": active_run,
        "history": history
    }

@app.get("/api/data/history")
async def get_data_history():
    return get_history_index()

@app.post("/api/data/restore")
async def restore_dataset(req: RestoreRunRequest):
    success, msg = restore_run_from_history(req.run_id)
    if not success:
        raise HTTPException(status_code=404, detail=msg)
    clear_data_cache()
    clear_agent_cache()
    return {"status": "success", "message": msg, "active_run_id": req.run_id}

@app.get("/api/data/generated")
async def get_generated_data(
    table: str = "orders",
    run_id: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    search: Optional[str] = None
):
    base_dir = f"data/history/{run_id}" if run_id and os.path.exists(f"data/history/{run_id}") else "data"
    
    if table == "reconciled":
        df, match_rate, exc = get_reconciled_data()
    elif table == "ground_truth":
        gt_path = os.path.join(base_dir, "ground_truth.json")
        if not os.path.exists(gt_path):
            raise HTTPException(status_code=404, detail="Ground truth file not found")
        with open(gt_path, "r") as f:
            gt_data = json.load(f)
        df = pd.DataFrame([{"order_id": k, "status": v.get("status"), "reason": v.get("reason")} for k, v in gt_data.items()])
    else:
        file_map = {
            "orders": "orders.csv",
            "payments": "payments.csv",
            "settlements": "settlements.csv",
            "bank_statement": "bank_statement.csv",
        }
        if table not in file_map:
            raise HTTPException(status_code=400, detail=f"Invalid table: {table}. Valid tables: {list(file_map.keys()) + ['ground_truth', 'reconciled']}")
        
        file_path = os.path.join(base_dir, file_map[table])
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"File {file_map[table]} not found")
        df = pd.read_csv(file_path)

    # Search filtering
    if search:
        s_lower = search.strip().lower()
        mask = df.astype(str).apply(lambda row: row.str.lower().str.contains(s_lower, na=False).any(), axis=1)
        df = df[mask]

    total_count = len(df)
    paged_df = df.iloc[offset:offset + limit]
    
    rows = paged_df.where(pd.notnull(paged_df), None).to_dict(orient="records")
    columns = list(df.columns)
    
    return {
        "table": table,
        "run_id": run_id or "active",
        "total_count": total_count,
        "limit": limit,
        "offset": offset,
        "columns": columns,
        "rows": rows
    }

@app.get("/api/overview")
async def get_overview():
    df, match_rate, exc = get_reconciled_data()
    eval_results = load_eval_results()
    
    qa_accuracy = eval_results.get("accuracy", None) if eval_results else None
    
    cost_scale_projection = None
    if eval_results and 'avg_elapsed_seconds' in eval_results and 'avg_api_calls' in eval_results:
        avg_lat = eval_results['avg_elapsed_seconds']
        avg_api = eval_results['avg_api_calls']
        if avg_api > 0 and avg_lat > 0:
            rate_limit_bound = (40 * 60) / avg_api
            latency_bound = 3600 / avg_lat
            
            if latency_bound < rate_limit_bound:
                actual_cap = int(latency_bound)
                bottleneck_msg = f"latency-bound, not rate-limit-bound — API response time ({avg_lat}s) is the current bottleneck, not the 40 RPM cap"
            else:
                actual_cap = int(rate_limit_bound)
                bottleneck_msg = f"rate-limit-bound, not latency-bound — the 40 RPM cap is the current bottleneck, not API response time"
            
            total_s = 1000 * (3600 / actual_cap)
            m, s = divmod(total_s, 60)
            h, m = divmod(m, 60)
            calc_time = f"{int(h)}h {int(m)}m {int(s)}s" if h > 0 else f"{int(m)}m {int(s)}s"
            
            cost_scale_projection = {
                "actual_cap": actual_cap,
                "bottleneck_msg": bottleneck_msg,
                "calc_time": calc_time
            }

    return {
        "match_rate": round(float(match_rate), 2),
        "total_records": len(df),
        "exceptions_count": len(exc),
        "qa_accuracy": qa_accuracy,
        "tolerance_rules": {
            "amount_tolerance": AMOUNT_TOLERANCE,
            "time_tolerance_hours": TIME_TOLERANCE_HOURS
        },
        "cost_scale_projection": cost_scale_projection
    }

@app.get("/api/exceptions")
async def get_exceptions(reason_code: Optional[str] = None):
    _, _, exc = get_reconciled_data()
    if reason_code and reason_code != "All":
        exc = exc[exc['reason'] == reason_code]
        
    # We need to return checked_steps for each exception
    from app import get_checked_steps # reuse logic if possible, or redefine it here
    
    def get_checked_steps_local(reason):
        steps = {
            "MISSING_PAYMENT": [
                "Merged orders with payments on order_id",
                "payment_id is NaN: no payment found for order"
            ],
            "MISSING_SETTLEMENT": [
                "Exploded settlements by payment_id",
                "Merged payments with settlements",
                "Merged settlements with bank_statement on UTR",
                "Applied RapidFuzz fallback for UTRs (>=90 ratio)",
                "utr_bs is still NaN: no matching bank statement found"
            ],
            "UNRESOLVED": [
                "Exploded settlements by payment_id",
                "Merged payments with settlements",
                "settlement_id is NaN: payment is orphaned with no settlement"
            ],
            "DUPLICATE_UTR": [
                "Grouped settlements by UTR",
                "Counted unique settlement_ids per UTR",
                "Found count > 1 for this UTR"
            ],
            "AMOUNT_MISMATCH": [
                "Merged settlements with bank_statement",
                "Checked abs(credited_amount - settled_amount)",
                "Difference exceeded tolerance (1.00)"
            ],
            "TIMING_DELAY": [
                "Parsed settled_at and credited_at to datetime",
                "Calculated hours difference",
                "Difference exceeded tolerance (48.0 hours)"
            ]
        }
        return steps.get(reason, ["No specific checks logged for this status."])

    # Convert to list of dicts
    # Handle NaN values which JSON doesn't support
    exc = exc.fillna("N/A")
    results = exc.to_dict(orient="records")
    for r in results:
        r['checked_steps'] = get_checked_steps_local(r.get('reason'))
        
    return results

@app.get("/api/exceptions/chart-data")
async def get_exceptions_chart_data():
    _, _, exc = get_reconciled_data()
    if exc.empty:
        return []
    reason_counts = exc['reason'].value_counts().reset_index()
    reason_counts.columns = ['Reason', 'Count']
    return reason_counts.to_dict(orient="records")

@app.get("/api/settlements/timeline")
async def get_settlements_timeline():
    df, _, _ = get_reconciled_data()
    if df.empty:
        return []
    
    df['date_settled'] = pd.to_datetime(df['settled_at']).dt.date
    df['date_credited'] = pd.to_datetime(df['credited_at']).dt.date
    
    daily_settled = df.groupby('date_settled')['settled_amount'].sum().reset_index()
    daily_credited = df.groupby('date_credited')['credited_amount'].sum().reset_index()
    
    # Merge them on date
    # Some dates might be only in one
    all_dates = sorted(list(set(daily_settled['date_settled'].tolist() + daily_credited['date_credited'].tolist())))
    
    results = []
    for d in all_dates:
        settled = daily_settled[daily_settled['date_settled'] == d]['settled_amount']
        credited = daily_credited[daily_credited['date_credited'] == d]['credited_amount']
        
        results.append({
            "date": d.isoformat() if hasattr(d, 'isoformat') else str(d),
            "settled_amount": float(settled.iloc[0]) if not settled.empty else 0,
            "credited_amount": float(credited.iloc[0]) if not credited.empty else 0
        })
    return results

@app.get("/api/money-flow")
async def get_money_flow():
    o, p, s, b = get_loaded_data()
    df, match_rate, exc = get_reconciled_data()
    
    total_order_amount = float(o['amount'].sum()) if not o.empty and 'amount' in o.columns else 0.0
    total_payment_amount = float(p['amount'].sum()) if not p.empty and 'amount' in p.columns else 0.0
    total_settled_amount = float(s['settled_amount'].sum()) if not s.empty and 'settled_amount' in s.columns else 0.0
    total_credited_amount = float(b['amount'].sum()) if not b.empty and 'amount' in b.columns else 0.0
    
    clean_df = df[df['reason'] == 'CLEAN_MATCH']
    clean_reconciled_amount = float(clean_df['amount_order'].sum()) if not clean_df.empty else 0.0
    
    leakage_by_reason = {}
    if not exc.empty:
        for reason, group in exc.groupby('reason'):
            amt_col = 'amount_order' if 'amount_order' in group.columns else ('amount' if 'amount' in group.columns else None)
            amt = float(group[amt_col].dropna().sum()) if amt_col else 0.0
            desc = group['description'].iloc[0] if 'description' in group.columns and not group['description'].isna().all() else reason
            leakage_by_reason[str(reason)] = {
                "count": int(len(group)),
                "amount": round(amt, 2),
                "description": desc
            }
            
    total_leakage = sum(item['amount'] for item in leakage_by_reason.values())
    
    return {
        "stages": [
            { "id": "orders", "name": "Created Orders", "count": len(o), "amount": round(total_order_amount, 2), "icon": "orders" },
            { "id": "payments", "name": "Captured Payments", "count": len(p), "amount": round(total_payment_amount, 2), "icon": "payments" },
            { "id": "settlements", "name": "Settlement Batches", "count": len(s), "amount": round(total_settled_amount, 2), "icon": "settlements" },
            { "id": "bank_statement", "name": "Bank Credits", "count": len(b), "amount": round(total_credited_amount, 2), "icon": "bank" },
            { "id": "clean_cash", "name": "100% Reconciled Cash", "count": len(clean_df), "amount": round(clean_reconciled_amount, 2), "icon": "verified" }
        ],
        "leakage": leakage_by_reason,
        "match_rate": round(float(match_rate), 2),
        "total_leakage_amount": round(total_leakage, 2),
        "total_discrepancies": len(exc)
    }

@app.post("/api/ask/stream")
async def ask_stream(req: AskRequest):
    try:
        return StreamingResponse(
            ask_agent_stream(req.question, conversation_history=req.conversation_history),
            media_type="text/event-stream"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ask")
async def ask(req: AskRequest):
    try:
        res = ask_agent(req.question, conversation_history=req.conversation_history)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/eval/run")
async def run_eval():
    try:
        results = await asyncio.to_thread(run_eval_suite)
        return {"status": "success", "message": "Evaluation completed.", "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/eval/results")
async def get_eval_results():
    results = load_eval_results()
    if not results:
        return {}
    
    # Calculate calibration
    buckets = {}
    for q in results.get('questions', []):
        label = q.get("confidence_label", "Unknown")
        if label not in buckets:
            buckets[label] = {"total": 0, "passed": 0, "sum_conf": 0.0}
        buckets[label]["total"] += 1
        if q.get("passed"):
            buckets[label]["passed"] += 1
        buckets[label]["sum_conf"] += q.get("confidence_score", 0.0)
        
    calibration_data = {}
    for label, stats in buckets.items():
        if stats["total"] > 0:
            actual = stats["passed"] / stats["total"]
            expected = stats["sum_conf"] / stats["total"]
            calibration_data[label] = {
                "expected": expected,
                "actual": actual
            }
            
    # Calculate details
    details = {}
    for i, q in enumerate(results.get('questions', [])):
        qid = f"Q{i+1}"
        conf_label = q.get("confidence_label", "Unknown").upper()
        if "PARTIALLY" in conf_label:
            conf_str = "MEDIUM"
        elif "UNRESOLVED" in conf_label:
            conf_str = "LOW"
        elif "RESOLVED" in conf_label:
            conf_str = "HIGH"
        else:
            conf_str = conf_label
            
        details[qid] = {
            "question": q.get("question"),
            "expected": q.get("expected_match", "N/A"),
            "actual": q.get("agent_answer", "N/A"),
            "confidence": conf_str,
            "verified": q.get("verified"),
            "is_match": q.get("passed")
        }
        
    return {
        "accuracy": results.get("accuracy"),
        "verified_rate": results.get("verified_rate"),
        "avg_elapsed_seconds": results.get("avg_elapsed_seconds"),
        "avg_api_calls": results.get("avg_api_calls"),
        "calibration": calibration_data,
        "details": details
    }

@app.post("/api/batch-test")
async def run_batch_test(req: BatchTestRequest):
    import time
    results = []
    
    total_conf = 0.0
    total_latency = 0.0
    verified_count = 0
    applicable_count = 0
    
    for q in req.questions:
        max_retries = 3
        res = None
        for attempt in range(max_retries):
            res = ask_agent(q)
            if "429" in res.get('answer', '') or "Rate limit" in res.get('answer', ''):
                time.sleep(5)
            else:
                break
                
        if not res:
            continue
            
        ans_summary = res.get('answer', '')
        if len(ans_summary) > 100:
            ans_summary = ans_summary[:97] + "..."
            
        verified_val = res.get("verified", "not_applicable")
        
        results.append({
            "question": q,
            "answer_summary": ans_summary,
            "confidence_label": res.get("confidence", "Unknown"),
            "confidence_score": res.get("confidence_score", 0.0),
            "verified": verified_val,
            "elapsed_seconds": res.get("elapsed_seconds", 0.0)
        })
        
        total_conf += res.get("confidence_score", 0.0)
        total_latency += res.get("elapsed_seconds", 0.0)
        if verified_val != "not_applicable":
            applicable_count += 1
            if verified_val == True:
                verified_count += 1
        
        time.sleep(1.0) # rate limit delay
        
    return {
        "results": results,
        "summary": {
            "total_questions": len(req.questions),
            "avg_latency": round(total_latency / len(req.questions), 2) if req.questions else 0,
            "avg_confidence": round((total_conf / len(req.questions)) * 100, 1) if req.questions else 0,
            "verified_rate": round((verified_count / applicable_count) * 100, 1) if applicable_count > 0 else 0
        }
    }
