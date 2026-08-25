import pandas as pd
import random
import os
import shutil
import json
import time
from datetime import datetime, timedelta
from faker import Faker

HISTORY_DIR = "data/history"
HISTORY_INDEX = "data/history/history_index.json"
MAX_HISTORY_RUNS = 3

def generate(seed=None):
    if seed is None:
        seed = random.randint(10, 99999)
    random.seed(seed)
    Faker.seed(seed)
    fake = Faker()

    num_orders = 500

    orders = []
    payments = []
    settlements = []
    bank_statement = []
    ground_truth = {}

    missing_payment_count = random.randint(2, 4)
    orphaned_payment_count = random.randint(1, 2)
    amount_mismatch_count = random.randint(4, 7)
    duplicate_utr_count = random.randint(2, 4)
    missing_settlement_count = random.randint(3, 5)
    timing_delay_count = random.randint(2, 4)

    # 1. Generate Orders
    current_time = fake.date_time_between(start_date='-30d', end_date='now')
    for i in range(num_orders):
        order_id = f"order_{fake.unique.random_number(digits=8)}"
        amount = round(random.uniform(50.0, 5000.0), 2)
        fee = round(amount * 0.02, 2)
        tax = round(fee * 0.18, 2)
        
        orders.append({
            "order_id": order_id,
            "amount": amount,
            "fee": fee,
            "tax": tax,
            "currency": "INR",
            "created_at": current_time.isoformat(),
            "status": "created"
        })
        
        ground_truth[order_id] = {"status": "RESOLVED", "reason": "CLEAN_MATCH"}
        current_time += timedelta(minutes=random.randint(5, 60))

    orders_with_missing_payments = random.sample([o['order_id'] for o in orders], missing_payment_count)
    
    # 2. Generate Payments
    for order in orders:
        order_id = order['order_id']
        if order_id in orders_with_missing_payments:
            ground_truth[order_id] = {"status": "UNRESOLVED", "reason": "MISSING_PAYMENT"}
            continue
            
        payment_id = f"pay_{fake.unique.random_number(digits=8)}"
        captured_at = pd.to_datetime(order['created_at']) + timedelta(minutes=random.randint(1, 10))
        
        payments.append({
            "payment_id": payment_id,
            "order_id": order_id,
            "method": random.choice(["upi", "card", "netbanking"]),
            "captured_at": captured_at.isoformat(),
            "amount": order['amount']
        })

    payment_ids = [p['payment_id'] for p in payments]
    orphaned_payments = random.sample(payment_ids, orphaned_payment_count)
    for p_id in orphaned_payments:
        o_id = next(p['order_id'] for p in payments if p['payment_id'] == p_id)
        ground_truth[o_id] = {"status": "UNRESOLVED", "reason": "UNRESOLVED"}

    settleable_payments = [p for p in payments if p['payment_id'] not in orphaned_payments]
    random.shuffle(settleable_payments)
    
    settlement_batches = []
    i = 0
    while i < len(settleable_payments):
        batch_size = random.randint(2, 4)
        settlement_batches.append(settleable_payments[i:i+batch_size])
        i += batch_size

    batch_indices = list(range(len(settlement_batches)))
    missing_settlement_batches = random.sample(batch_indices, missing_settlement_count)
    remaining_indices = [idx for idx in batch_indices if idx not in missing_settlement_batches]
    
    amount_mismatch_batches = random.sample(remaining_indices, amount_mismatch_count)
    remaining_indices = [idx for idx in remaining_indices if idx not in amount_mismatch_batches]
    
    duplicate_utr_batches = random.sample(remaining_indices, duplicate_utr_count)
    remaining_indices = [idx for idx in remaining_indices if idx not in duplicate_utr_batches]
    
    timing_delay_batches = random.sample(remaining_indices, timing_delay_count)

    for idx, batch in enumerate(settlement_batches):
        p_ids = [p['payment_id'] for p in batch]
        p_ids_str = ",".join(p_ids)
        
        if idx in missing_settlement_batches:
            for p_id in p_ids:
                o_id = next(p['order_id'] for p in payments if p['payment_id'] == p_id)
                ground_truth[o_id] = {"status": "UNRESOLVED", "reason": "MISSING_SETTLEMENT"}
            continue
            
        settlement_id = f"setl_{fake.unique.random_number(digits=8)}"
        utr = f"UTR{fake.unique.random_number(digits=12)}"
        
        batch_orders = [o for o in orders if o['order_id'] in [p['order_id'] for p in batch]]
        expected_settled_amount = sum(o['amount'] for o in batch_orders)
        
        latest_capture = max(pd.to_datetime(p['captured_at']) for p in batch)
        settled_at = latest_capture + timedelta(hours=random.randint(12, 36))
        
        settled_amount = expected_settled_amount
        if idx in amount_mismatch_batches:
            settled_amount = round(settled_amount + random.choice([-50.0, 50.0, 100.0, -100.0]), 2)
            for p_id in p_ids:
                o_id = next(p['order_id'] for p in payments if p['payment_id'] == p_id)
                ground_truth[o_id] = {"status": "UNRESOLVED", "reason": "AMOUNT_MISMATCH"}
                
        settlements.append({
            "settlement_id": settlement_id,
            "payment_ids": p_ids_str,
            "utr": utr,
            "settled_amount": settled_amount,
            "settled_at": settled_at.isoformat()
        })
        
        # Bank Statement
        credited_at = settled_at + timedelta(hours=random.randint(2, 12))
        bank_amount = settled_amount
        
        if idx in timing_delay_batches:
            credited_at = settled_at + timedelta(hours=random.randint(72, 120))
            for p_id in p_ids:
                o_id = next(p['order_id'] for p in payments if p['payment_id'] == p_id)
                ground_truth[o_id] = {"status": "UNRESOLVED", "reason": "TIMING_DELAY"}
                
        bank_statement.append({
            "utr": utr,
            "amount": bank_amount,
            "credited_at": credited_at.isoformat()
        })

    if duplicate_utr_batches:
        utrs_to_duplicate = [s['utr'] for idx, s in enumerate(settlements) if idx in duplicate_utr_batches]
        for utr_to_dup in utrs_to_duplicate:
            clean_settlements = [s for s in settlements if s['utr'] not in utrs_to_duplicate]
            if clean_settlements:
                s = random.choice(clean_settlements)
                s['utr'] = utr_to_dup
                affected_payment_ids = []
                for st in settlements:
                    if st['utr'] == utr_to_dup:
                        affected_payment_ids.extend(st['payment_ids'].split(","))
                
                for p_id in affected_payment_ids:
                    o_id = next(p['order_id'] for p in payments if p['payment_id'] == p_id)
                    ground_truth[o_id] = {"status": "UNRESOLVED", "reason": "DUPLICATE_UTR"}

    unresolved_count = sum(1 for v in ground_truth.values() if v['status'] == 'UNRESOLVED')
    match_rate = ((num_orders - unresolved_count) / num_orders) * 100
    
    return orders, payments, settlements, bank_statement, ground_truth, match_rate, seed

def get_history_index():
    os.makedirs(HISTORY_DIR, exist_ok=True)
    if os.path.exists(HISTORY_INDEX):
        try:
            with open(HISTORY_INDEX, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {"runs": [], "active_run_id": None}

def save_history_index(data):
    os.makedirs(HISTORY_DIR, exist_ok=True)
    with open(HISTORY_INDEX, "w") as f:
        json.dump(data, f, indent=2)

def save_dataset_and_snapshot(orders, payments, settlements, bank_statement, ground_truth, match_rate, seed):
    os.makedirs("data", exist_ok=True)
    os.makedirs(HISTORY_DIR, exist_ok=True)
    
    # Save active files in data/
    pd.DataFrame(orders).to_csv("data/orders.csv", index=False)
    pd.DataFrame(payments).to_csv("data/payments.csv", index=False)
    pd.DataFrame(settlements).to_csv("data/settlements.csv", index=False)
    pd.DataFrame(bank_statement).to_csv("data/bank_statement.csv", index=False)
    with open("data/ground_truth.json", "w") as f:
        json.dump(ground_truth, f, indent=2)
        
    # Generate run ID and metadata
    now = datetime.now()
    run_id = f"run_{now.strftime('%Y%m%d_%H%M%S')}"
    
    # Exception breakdown
    reasons = [v['reason'] for v in ground_truth.values() if v.get('status') == 'UNRESOLVED']
    reason_counts = {}
    for r in reasons:
        reason_counts[r] = reason_counts.get(r, 0) + 1
        
    run_meta = {
        "run_id": run_id,
        "label": f"Generation Run {now.strftime('%b %d, %H:%M:%S')}",
        "timestamp": now.isoformat(),
        "seed": seed,
        "total_records": len(orders),
        "payments_count": len(payments),
        "settlements_count": len(settlements),
        "bank_records_count": len(bank_statement),
        "match_rate": round(match_rate, 1),
        "exceptions_count": len(reasons),
        "exception_breakdown": reason_counts,
        "is_active": True
    }
    
    # Save snapshot in history folder
    run_dir = os.path.join(HISTORY_DIR, run_id)
    os.makedirs(run_dir, exist_ok=True)
    pd.DataFrame(orders).to_csv(os.path.join(run_dir, "orders.csv"), index=False)
    pd.DataFrame(payments).to_csv(os.path.join(run_dir, "payments.csv"), index=False)
    pd.DataFrame(settlements).to_csv(os.path.join(run_dir, "settlements.csv"), index=False)
    pd.DataFrame(bank_statement).to_csv(os.path.join(run_dir, "bank_statement.csv"), index=False)
    with open(os.path.join(run_dir, "ground_truth.json"), "w") as f:
        json.dump(ground_truth, f, indent=2)
    with open(os.path.join(run_dir, "meta.json"), "w") as f:
        json.dump(run_meta, f, indent=2)

    # Update index and keep max 3 runs
    history = get_history_index()
    existing_runs = history.get("runs", [])
    
    # Prepend new run
    updated_runs = [run_meta] + existing_runs
    
    # Trim to MAX_HISTORY_RUNS
    runs_to_keep = updated_runs[:MAX_HISTORY_RUNS]
    runs_to_delete = updated_runs[MAX_HISTORY_RUNS:]
    
    for old_run in runs_to_delete:
        old_id = old_run.get("run_id")
        if old_id:
            old_path = os.path.join(HISTORY_DIR, old_id)
            if os.path.exists(old_path):
                shutil.rmtree(old_path, ignore_errors=True)
                
    history["runs"] = runs_to_keep
    history["active_run_id"] = run_id
    save_history_index(history)
    
    return run_meta, history

def restore_run_from_history(run_id: str):
    run_dir = os.path.join(HISTORY_DIR, run_id)
    if not os.path.exists(run_dir):
        return False, f"Run {run_id} not found in history."
        
    for fname in ["orders.csv", "payments.csv", "settlements.csv", "bank_statement.csv", "ground_truth.json"]:
        src = os.path.join(run_dir, fname)
        dst = os.path.join("data", fname)
        if os.path.exists(src):
            shutil.copy2(src, dst)
            
    history = get_history_index()
    history["active_run_id"] = run_id
    save_history_index(history)
    return True, f"Successfully restored dataset from {run_id}"

def main():
    os.makedirs("data", exist_ok=True)
    
    max_attempts = 100
    seed = int(time.time()) % 100000
    
    for attempt in range(max_attempts):
        orders, payments, settlements, bank_statement, ground_truth, match_rate, current_seed = generate(seed)
        
        reasons = [v['reason'] for v in ground_truth.values() if v['status'] == 'UNRESOLVED']
        unique_reasons = set(reasons)
        required_reasons = {"MISSING_PAYMENT", "UNRESOLVED", "MISSING_SETTLEMENT", "AMOUNT_MISMATCH", "TIMING_DELAY", "DUPLICATE_UTR"}
        
        if 85 <= match_rate <= 95 and required_reasons.issubset(unique_reasons):
            print(f"Data generated successfully on attempt {attempt+1} with match rate {match_rate:.2f}% (seed: {current_seed})")
            run_meta, history = save_dataset_and_snapshot(orders, payments, settlements, bank_statement, ground_truth, match_rate, current_seed)
            print(f"Saved snapshot to history: {run_meta['run_id']} (History now tracks {len(history['runs'])} runs)")
            break
        
        seed += 1
    else:
        print("Failed to generate data meeting criteria after maximum attempts.")

if __name__ == "__main__":
    main()
