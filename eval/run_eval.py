import json
import time
import os
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
from agent.qa_agent import ask_agent
from agent.query_functions import get_reconciled_data

def evaluate_refusal(question: str, answer: str) -> bool:
    """Fast, deterministic evaluation verifying if the assistant properly refused or reported missing data."""
    ans_lower = answer.lower()
    refusal_keywords = [
        "not found", "cannot find", "unable to find", "does not exist", 
        "cannot resolve", "no record", "could not find", "invalid", 
        "unresolved", "not available", "no matching", "no data", "unable to",
        "cannot help", "can't help", "cannot provide", "no information", "i cannot",
        "sorry", "don't have access", "do not have access", "no access", "cannot explain",
        "no exceptions recorded", "no exception recorded"
    ]
    return any(kw in ans_lower for kw in refusal_keywords)

def generate_dynamic_test_questions(df, exc):
    """Dynamically creates a curated 10-question ground-truth benchmark suite aligned 100% with the active dataset."""
    questions = []
    
    # 1. Clean Match Order Status (2 Questions)
    clean_orders = df[df['reason'] == 'CLEAN_MATCH']
    if not clean_orders.empty:
        sample_clean = clean_orders.sample(min(2, len(clean_orders)), random_state=42)
        for _, row in sample_clean.iterrows():
            oid = str(row['order_id'])
            questions.append({
                "question": f"What is the status of order {oid}?",
                "type": "exact",
                "expected_match": oid,
                "category": "Order Status"
            })
            
    # 2. Real Exception Inquiries (2 Questions)
    if not exc.empty:
        reasons_available = exc['reason'].unique().tolist()
        sample_exc_rows = []
        for r in reasons_available[:2]:
            sub = exc[exc['reason'] == r]
            if not sub.empty:
                sample_exc_rows.append(sub.iloc[0])
                
        for row in sample_exc_rows:
            oid = str(row['order_id']) if pd_not_na(row.get('order_id')) else str(row.get('settlement_id', ''))
            reason = str(row['reason'])
            questions.append({
                "question": f"Why did {oid} fail reconciliation?",
                "type": "exact",
                "expected_match": reason,
                "category": "Exception Triage"
            })

    # 3. Exact Metric Counts from Active Database (3 Questions)
    dup_count = int(len(exc[exc['reason'] == 'DUPLICATE_UTR'])) if not exc.empty else 0
    questions.append({
        "question": "How many DUPLICATE_UTR exceptions do we have?",
        "type": "exact",
        "expected_match": str(dup_count),
        "category": "Aggregate Metrics"
    })

    missing_pay_count = int(len(exc[exc['reason'] == 'MISSING_PAYMENT'])) if not exc.empty else 0
    questions.append({
        "question": "How many MISSING_PAYMENT exceptions are recorded?",
        "type": "exact",
        "expected_match": str(missing_pay_count),
        "category": "Aggregate Metrics"
    })
    
    timing_delay_count = int(len(exc[exc['reason'] == 'TIMING_DELAY'])) if not exc.empty else 0
    questions.append({
        "question": "How many exceptions of type TIMING_DELAY are there?",
        "type": "exact",
        "expected_match": str(timing_delay_count),
        "category": "Aggregate Metrics"
    })

    # 4. Strict Hallucination & Refusal Checks (3 Questions)
    questions.extend([
        {
            "question": "What is the reconciliation status of order_88888888?",
            "type": "refusal",
            "expected_match": "",
            "category": "Hallucination Resistance"
        },
        {
            "question": "Why did settlement setl_00000000 fail?",
            "type": "refusal",
            "expected_match": "",
            "category": "Hallucination Resistance"
        },
        {
            "question": "What is our standard customer refund policy?",
            "type": "refusal",
            "expected_match": "",
            "category": "Out-of-Scope Guardrail"
        }
    ])

    return questions[:10]

def pd_not_na(val):
    if val is None:
        return False
    val_str = str(val).strip().lower()
    return val_str != "" and val_str != "nan" and val_str != "none"

def evaluate_single_question(item: tuple) -> dict:
    idx, q = item
    question_text = q['question']
    
    # Run agent query
    res = ask_agent(question_text)
    answer = res.get('answer', 'ERROR: No answer')
    passed = False
    
    if q['type'] == 'exact':
        expected = str(q['expected_match'])
        # Match if expected keyword/count is in the answer
        if expected == "0":
            passed = ("0" in answer) or ("zero" in answer.lower()) or ("no " in answer.lower()) or ("none" in answer.lower())
        else:
            passed = expected.lower() in answer.lower()
    elif q['type'] == 'refusal':
        passed = evaluate_refusal(question_text, answer)
        
    return {
        "idx": idx,
        "question": question_text,
        "type": q['type'],
        "expected_match": q.get('expected_match'),
        "agent_answer": answer,
        "passed": passed,
        "confidence_label": res.get("confidence", "Unknown"),
        "confidence_score": res.get("confidence_score", 0.0),
        "verified": res.get("verified", False),
        "elapsed_seconds": res.get("elapsed_seconds", 0.0),
        "api_calls": 2 if res.get("tool_call_count", 0) > 0 else 1
    }

def run_eval_suite():
    print("Loading active dataset for dynamic ground-truth evaluation...")
    df, match_rate, exc = get_reconciled_data()
    
    questions = generate_dynamic_test_questions(df, exc)
    
    # Save active test question suite
    with open("eval/test_questions.json", "w") as f:
        json.dump(questions, f, indent=2)
        
    results = {
        "match_rate": round(float(match_rate), 1),
        "exception_count": len(exc),
        "total_questions": len(questions),
        "passed": 0,
        "questions": [],
        "avg_elapsed_seconds": 0.0,
        "avg_api_calls": 0.0
    }
    
    print(f"Running dynamic evaluation on {len(questions)} test questions...")
    evaluated_questions = []
    
    for i, q in enumerate(questions):
        try:
            res_item = evaluate_single_question((i, q))
            evaluated_questions.append(res_item)
        except Exception as exc_err:
            print(f"Question evaluation error on Q{i+1}: {exc_err}")
        time.sleep(0.2)
                
    # Sort by original index
    evaluated_questions.sort(key=lambda x: x["idx"])
    results['questions'] = evaluated_questions
    results['passed'] = sum(1 for q in evaluated_questions if q.get('passed'))
    
    accuracy = (results['passed'] / results['total_questions']) * 100 if results['total_questions'] > 0 else 0
    results['accuracy'] = round(accuracy, 1)
    
    total_elapsed = sum(q.get('elapsed_seconds', 0.0) for q in results['questions'])
    total_api_calls = sum(q.get('api_calls', 1) for q in results['questions'])
    results['avg_elapsed_seconds'] = round(total_elapsed / results['total_questions'], 2) if results['total_questions'] > 0 else 0.0
    results['avg_api_calls'] = round(total_api_calls / results['total_questions'], 2) if results['total_questions'] > 0 else 1.0
    
    applicable_questions = [q for q in results['questions'] if q.get('verified') != "not_applicable"]
    verified_count = sum(1 for q in applicable_questions if q.get('verified') == True)
    
    if len(applicable_questions) > 0:
        verified_rate = (verified_count / len(applicable_questions)) * 100
    else:
        verified_rate = 0
    results['verified_rate'] = round(verified_rate, 1)
    
    # Save evaluation results
    with open("eval/results.json", "w") as f:
        json.dump(results, f, indent=2)
        
    print(f"Dynamic evaluation complete! Accuracy: {results['accuracy']}%, Verified Rate: {results['verified_rate']}%")
    return results

def main():
    run_eval_suite()

if __name__ == "__main__":
    main()
