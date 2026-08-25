import pandas as pd
import numpy as np
from rapidfuzz import process, fuzz
from engine.exceptions import ExceptionReason
from engine.constants import AMOUNT_TOLERANCE, TIME_TOLERANCE_HOURS

def load_data():
    try:
        orders = pd.read_csv("data/orders.csv")
        payments = pd.read_csv("data/payments.csv")
        settlements = pd.read_csv("data/settlements.csv")
        bank_statement = pd.read_csv("data/bank_statement.csv")
        return orders, payments, settlements, bank_statement
    except FileNotFoundError:
        return None, None, None, None

def run_reconciliation(orders, payments, settlements, bank_statement):
    if orders is None or orders.empty:
        return pd.DataFrame(), 0.0, pd.DataFrame()

    # 1. Orders to Payments
    df = orders.merge(payments, on="order_id", how="left", suffixes=('_order', '_pay'))
    
    # Identify MISSING_PAYMENT
    df['reason'] = np.where(df['payment_id'].isna(), ExceptionReason.MISSING_PAYMENT, ExceptionReason.CLEAN_MATCH)
    
    # 2. Payments to Settlements
    if not settlements.empty:
        settlements_exp = settlements.assign(payment_id=settlements['payment_ids'].str.split(',')).explode('payment_id')
    else:
        settlements_exp = pd.DataFrame(columns=['settlement_id', 'utr', 'settled_amount', 'settled_at', 'payment_id'])
        
    df = df.merge(settlements_exp[['settlement_id', 'utr', 'settled_amount', 'settled_at', 'payment_id']], 
                  on="payment_id", how="left", suffixes=('', '_setl'))
                  
    # Identify UNRESOLVED for orphaned payments (no settlement)
    mask_orphaned = df['settlement_id'].isna() & (df['reason'] == ExceptionReason.CLEAN_MATCH)
    df.loc[mask_orphaned, 'reason'] = ExceptionReason.UNRESOLVED
    
    # 3. Duplicate UTRs
    if not settlements.empty:
        utr_counts = settlements.groupby('utr')['settlement_id'].nunique()
        duplicate_utrs = utr_counts[utr_counts > 1].index
        mask_dup_utr = df['utr'].isin(duplicate_utrs) & (df['reason'] == ExceptionReason.CLEAN_MATCH)
        df.loc[mask_dup_utr, 'reason'] = ExceptionReason.DUPLICATE_UTR
    
    # 4. Settlements to Bank Statement
    bs = bank_statement.copy() if not bank_statement.empty else pd.DataFrame(columns=['utr', 'amount', 'credited_at'])
    if 'credited_amount' not in bs.columns and 'amount' in bs.columns:
        bs = bs.rename(columns={'amount': 'credited_amount'})
    bs = bs.rename(columns={'utr': 'utr_bs'})
    
    cols_to_merge = [c for c in ['utr_bs', 'credited_amount', 'credited_at'] if c in bs.columns]
    df = df.merge(bs[cols_to_merge], left_on='utr', right_on='utr_bs', how='left')
    
    # Fuzzy match for UTRs that didn't match exactly but have a settlement
    unmatched_setl_mask = df['utr'].notna() & df['utr_bs'].isna() & (df['reason'] == ExceptionReason.CLEAN_MATCH)
    unmatched_utrs = df.loc[unmatched_setl_mask, 'utr'].unique()
    
    if len(unmatched_utrs) > 0 and not bs.empty:
        available_bs_utrs = bs['utr_bs'].dropna().unique()
        for u in unmatched_utrs:
            match = process.extractOne(u, available_bs_utrs, scorer=fuzz.ratio)
            if match and match[1] >= 90:
                matched_utr = match[0]
                bs_row = bs[bs['utr_bs'] == matched_utr].iloc[0]
                df.loc[df['utr'] == u, 'utr_bs'] = bs_row['utr_bs']
                df.loc[df['utr'] == u, 'credited_amount'] = bs_row['credited_amount']
                df.loc[df['utr'] == u, 'credited_at'] = bs_row['credited_at']
    
    # Identify MISSING_SETTLEMENT for missing bank statements
    mask_no_bs = df['utr'].notna() & df['utr_bs'].isna() & (df['reason'] == ExceptionReason.CLEAN_MATCH)
    df.loc[mask_no_bs, 'reason'] = ExceptionReason.MISSING_SETTLEMENT
    
    # 5. Check Amount Mismatch
    mask_amt = df['credited_amount'].notna() & df['settled_amount'].notna() & (df['reason'] == ExceptionReason.CLEAN_MATCH)
    amt_diff = (df.loc[mask_amt, 'credited_amount'] - df.loc[mask_amt, 'settled_amount']).abs()
    mask_amt_mismatch = mask_amt & (amt_diff > AMOUNT_TOLERANCE)
    df.loc[mask_amt_mismatch, 'reason'] = ExceptionReason.AMOUNT_MISMATCH
    
    # 6. Check Timing Delay
    df['settled_at'] = pd.to_datetime(df['settled_at'])
    df['credited_at'] = pd.to_datetime(df['credited_at'])
    
    mask_time = df['credited_at'].notna() & df['settled_at'].notna() & (df['reason'] == ExceptionReason.CLEAN_MATCH)
    time_diff = (df.loc[mask_time, 'credited_at'] - df.loc[mask_time, 'settled_at']).dt.total_seconds() / 3600
    mask_time_delay = mask_time & (time_diff > TIME_TOLERANCE_HOURS)
    df.loc[mask_time_delay, 'reason'] = ExceptionReason.TIMING_DELAY
    
    # Format datetimes back to strings for JSON serialization downstream if needed
    df['created_at'] = df['created_at'].astype(str)
    df['captured_at'] = df['captured_at'].astype(str)
    df['settled_at'] = df['settled_at'].astype(str)
    df['credited_at'] = df['credited_at'].astype(str)
    
    # Calculate match rate
    total_orders = len(df)
    clean_orders = len(df[df['reason'] == ExceptionReason.CLEAN_MATCH])
    match_rate = round((clean_orders / total_orders) * 100, 2) if total_orders > 0 else 0.0
    
    # Prepare exceptions dataframe
    exceptions_df = df[df['reason'] != ExceptionReason.CLEAN_MATCH].copy()
    exceptions_df['description'] = exceptions_df['reason'].apply(ExceptionReason.get_description)
    
    return df, match_rate, exceptions_df
