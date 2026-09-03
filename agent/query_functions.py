import pandas as pd
import re
from engine.reconcile import load_data, run_reconciliation

_cached_data = None
_cached_reconciled_data = None

def get_loaded_data():
    """Loads raw data tables with in-memory caching."""
    global _cached_data
    if _cached_data is None:
        _cached_data = load_data()
    return _cached_data

def get_reconciled_data():
    """Loads data and runs reconciliation with fast in-memory caching."""
    global _cached_reconciled_data
    if _cached_reconciled_data is not None:
        return _cached_reconciled_data
    o, p, s, b = get_loaded_data()
    _cached_reconciled_data = run_reconciliation(o, p, s, b)
    return _cached_reconciled_data

def clear_data_cache():
    """Clears the in-memory cache to force a re-run of data loading."""
    global _cached_reconciled_data, _cached_data
    _cached_data = None
    _cached_reconciled_data = None

import math
from datetime import date, datetime

def serialize_record(record_dict: dict) -> dict:
    """Safely converts dates, timestamps, NaNs, and non-serializable objects for JSON serialization."""
    out = {}
    for k, v in record_dict.items():
        if v is None or (isinstance(v, float) and math.isnan(v)) or pd.isna(v):
            out[k] = None
        elif isinstance(v, (date, datetime, pd.Timestamp)):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out

def normalize_identifier(raw_id: str) -> str:
    s = str(raw_id).strip().replace("`", "")
    s = re.sub(r'^(?:order[\s_]+)+', 'order_', s, flags=re.IGNORECASE)
    s = re.sub(r'^(?:settlement[\s_]+)+', 'setl_', s, flags=re.IGNORECASE)
    s = re.sub(r'^(?:setl[\s_]+)+', 'setl_', s, flags=re.IGNORECASE)
    s = re.sub(r'^(?:payment[\s_]+)+', 'pay_', s, flags=re.IGNORECASE)
    s = re.sub(r'^(?:pay[\s_]+)+', 'pay_', s, flags=re.IGNORECASE)
    return s

def get_order_status(order_id: str) -> dict:
    """Gets the full reconciliation status for a specific order."""
    df, _, _ = get_reconciled_data()
    if df.empty:
        return {"found": False}
        
    clean_id = normalize_identifier(order_id)
    if not clean_id.lower().startswith("order_"):
        clean_id = f"order_{clean_id}"
    
    order_row = df[df['order_id'].str.lower() == clean_id.lower()]
    if order_row.empty:
        raw = str(order_id).strip().replace("`", "")
        order_row = df[df['order_id'] == raw]
        
    if order_row.empty:
        return {"found": False}
        
    row = serialize_record(order_row.iloc[0].to_dict())
    return {"found": True, "data": row}

def get_settlement_summary(start_date: str, end_date: str) -> dict:
    """Gets a summary of total settled amounts between start_date and end_date."""
    df, _, _ = get_reconciled_data()
    if df.empty:
        return {"found": False}
        
    settled_at_series = pd.to_datetime(df['settled_at'])
    mask = (settled_at_series >= pd.to_datetime(start_date)) & (settled_at_series <= pd.to_datetime(end_date))
    filtered = df[mask]
    
    if filtered.empty:
        return {"found": False}
        
    total = filtered['settled_amount'].sum()
    count = len(filtered)
    return {"found": True, "total_settled_amount": round(float(total), 2), "record_count": count}

def explain_exception(identifier: str) -> dict:
    """Explains an exception for a given order_id or settlement_id."""
    df, _, exc = get_reconciled_data()
    if exc.empty:
        return {"found": False}
        
    clean_id = normalize_identifier(identifier)
    mask = (exc['order_id'].str.lower() == clean_id.lower()) | (exc['settlement_id'].str.lower() == clean_id.lower())
    affected = exc[mask]
    
    if affected.empty:
        raw = str(identifier).strip().replace("`", "")
        affected = exc[(exc['order_id'] == raw) | (exc['settlement_id'] == raw)]
    
    if affected.empty:
        # Maybe it's a clean match
        clean_mask = (df['order_id'].str.lower() == clean_id.lower()) | (df['settlement_id'].str.lower() == clean_id.lower())
        if not df[clean_mask].empty:
            return {"found": False, "status": "CLEAN_MATCH", "message": "No exception recorded for this identifier. The record reconciled cleanly."}
        return {"found": False}
        
    results = [serialize_record(r) for r in affected.to_dict(orient="records")]
    return {"found": True, "exceptions": results}

def list_exceptions(reason_code: str = None) -> dict:
    """Lists all exceptions, optionally filtered by reason_code."""
    _, _, exc = get_reconciled_data()
    if exc.empty:
        return {"found": False}
        
    if reason_code:
        filtered = exc[exc['reason'] == reason_code]
    else:
        filtered = exc
        
    if filtered.empty:
        return {"found": False}
        
    results = [serialize_record(r) for r in filtered.head(50).to_dict(orient="records")]
    return {"found": True, "count": len(filtered), "exceptions": results}

def total_settled() -> dict:
    """Returns the grand total settled amount across all records."""
    df, _, _ = get_reconciled_data()
    if df.empty:
        return {"found": False}
        
    # Unique settlements only so we don't double count if grouping by order
    unique_settlements = df.drop_duplicates(subset=['settlement_id']).dropna(subset=['settlement_id', 'settled_amount'])
    total = unique_settlements['settled_amount'].sum()
    
    return {"found": True, "total_settled_amount": round(total, 2)}

# Map tool names to functions for dynamic invocation
TOOL_FUNCTIONS = {
    "get_order_status": get_order_status,
    "get_settlement_summary": get_settlement_summary,
    "explain_exception": explain_exception,
    "list_exceptions": list_exceptions,
    "total_settled": total_settled
}
