import streamlit as st
import pandas as pd
import json
import os
import subprocess
import time
import plotly.express as px
import plotly.graph_objects as go
from agent.query_functions import get_reconciled_data, clear_data_cache
import agent.qa_agent
import importlib
importlib.reload(agent.qa_agent)
from agent.qa_agent import ask_agent
from engine.constants import AMOUNT_TOLERANCE, TIME_TOLERANCE_HOURS
from engine.exceptions import ExceptionReason

# Configuration and Colors
st.set_page_config(page_title="Settlement Q&A Agent", page_icon="🏦", layout="wide")


COLOR_GREEN = "#00E676"
COLOR_AMBER = "#FF9800"
COLOR_RED = "#F44336"

def load_eval_results():
    if os.path.exists("eval/results.json"):
        with open("eval/results.json") as f:
            return json.load(f)
    return None

def get_checked_steps(reason):
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

def main():
    st.title("🏦 Settlement Q&A Agent - AI Finance Controller")

    # Load Data
    df, match_rate, exc = get_reconciled_data()
    eval_results = load_eval_results()

    # --- Sidebar ---
    st.sidebar.header("Operations")
    if st.sidebar.button("Regenerate Synthetic Data"):
        st.session_state.old_match_rate = match_rate
        st.session_state.old_exc_count = len(exc)
        st.session_state.show_diff = True
        with st.spinner("Generating fresh synthetic data..."):
            subprocess.run(["python", "data/generate_data.py"])
            clear_data_cache()
            st.sidebar.success("Data regenerated & reconciled!")
            st.rerun()

    # --- Tabs ---
    tab1, tab2, tab3, tab4, tab5 = st.tabs(["Overview", "Ask the Agent", "Exceptions", "Eval Results", "Batch Test"])

    # Tab 1: Overview
    with tab1:
        st.header("Reconciliation Overview")
        
        if getattr(st.session_state, 'show_diff', False):
            old_mr = st.session_state.old_match_rate
            new_mr = match_rate
            mr_color = COLOR_GREEN if new_mr > old_mr else (COLOR_RED if new_mr < old_mr else "gray")
            
            old_exc = st.session_state.old_exc_count
            new_exc = len(exc)
            exc_color = COLOR_GREEN if new_exc < old_exc else (COLOR_RED if new_exc > old_exc else "gray")
            
            st.markdown(f"""
            <div style="padding:1em; border-radius:0.5em; background-color:rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); margin-bottom: 1em;">
                <b>Regeneration Complete!</b><br/>
                Match rate: <span style='color:{mr_color}; font-weight:bold;'>{old_mr:.1f}% &rarr; {new_mr:.1f}%</span><br/>
                Exceptions: <span style='color:{exc_color}; font-weight:bold;'>{old_exc} &rarr; {new_exc}</span>
            </div>
            """, unsafe_allow_html=True)
            
        st.markdown(f"""
        <div style="padding:1em; border-radius:0.5em; background-color:rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); margin-bottom: 1em;">
            <b>Active Matching Rules:</b><br/>
            - Amounts matched within &plusmn;&#8377;{AMOUNT_TOLERANCE}<br/>
            - Settlements matched within &plusmn;{TIME_TOLERANCE_HOURS} hours of expected timing<br/>
            - Fuzzy UTR matching applied via rapidfuzz when exact match fails
        </div>
        """, unsafe_allow_html=True)
        
        if eval_results and 'avg_elapsed_seconds' in eval_results and 'avg_api_calls' in eval_results:
            avg_lat = eval_results['avg_elapsed_seconds']
            avg_api = eval_results['avg_api_calls']
            if avg_api > 0 and avg_lat > 0:
                rate_limit_bound = (40 * 60) / avg_api
                latency_bound = 3600 / avg_lat
                
                if latency_bound < rate_limit_bound:
                    actual_cap = int(latency_bound)
                    bottleneck_msg = f"latency-bound, not rate-limit-bound &mdash; API response time ({avg_lat}s) is the current bottleneck, not the 40 RPM cap"
                else:
                    actual_cap = int(rate_limit_bound)
                    bottleneck_msg = f"rate-limit-bound, not latency-bound &mdash; the 40 RPM cap is the current bottleneck, not API response time"
                
                total_s = 1000 * (3600 / actual_cap)
                m, s = divmod(total_s, 60)
                h, m = divmod(m, 60)
                calc_time = f"{int(h)}h {int(m)}m {int(s)}s" if h > 0 else f"{int(m)}m {int(s)}s"
                
                st.markdown(f"""
                <div style="padding:1em; border-radius:0.5em; background-color:rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); margin-bottom: 1em;">
                    <b>Cost & Scale Projections:</b><br/>
                    - Current free tier: NVIDIA NIM, 40 requests/min<br/>
                    - Actual throughput: ~{actual_cap} queries/hour ({bottleneck_msg})<br/>
                    - A 1,000-record daily reconciliation batch would take approximately {calc_time} to process<br/>
                    <span style="color:gray; font-size:0.9em;"><i>Free tier is intended for prototyping; production deployment would require a paid API tier for higher throughput.</i></span>
                </div>
                """, unsafe_allow_html=True)
        
        col1, col2, col3, col4 = st.columns(4)
        col1.metric("Match Rate", f"{match_rate:.1f}%")
        col2.metric("Total Records", len(df))
        col3.metric("Exceptions", len(exc))
        
        qa_acc = f"{eval_results['accuracy']}%" if eval_results else "N/A"
        col4.metric("Q&A Accuracy", qa_acc)
        
        st.divider()
        
        chart_col1, chart_col2 = st.columns(2)
        
        with chart_col1:
            st.subheader("Exceptions Breakdown")
            if not exc.empty:
                reason_counts = exc['reason'].value_counts().reset_index()
                reason_counts.columns = ['Reason', 'Count']
                
                # Dynamic color mapping
                colors = {r: COLOR_RED if r == 'UNRESOLVED' else COLOR_AMBER for r in reason_counts['Reason']}
                
                fig1 = px.pie(reason_counts, values='Count', names='Reason', hole=0.5,
                              color_discrete_map=colors)
                fig1.update_layout(paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)", font=dict(color="#FFFFFF"))
                st.plotly_chart(fig1, use_container_width=True)
            else:
                st.success("No exceptions found!")
                
        with chart_col2:
            st.subheader("Settlement Timeline")
            # Timeline of settlements
            if not df.empty:
                # Group by date
                df['date_settled'] = pd.to_datetime(df['settled_at']).dt.date
                df['date_credited'] = pd.to_datetime(df['credited_at']).dt.date
                
                daily_settled = df.groupby('date_settled')['settled_amount'].sum().reset_index()
                daily_credited = df.groupby('date_credited')['credited_amount'].sum().reset_index()
                
                fig2 = go.Figure()
                fig2.add_trace(go.Bar(x=daily_settled['date_settled'], y=daily_settled['settled_amount'], 
                                      name='Settled Amount', marker_color=COLOR_AMBER))
                fig2.add_trace(go.Bar(x=daily_credited['date_credited'], y=daily_credited['credited_amount'], 
                                      name='Bank Credited Amount', marker_color=COLOR_GREEN))
                
                fig2.update_layout(barmode='group', paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)", 
                                   font=dict(color="#FFFFFF"))
                st.plotly_chart(fig2, use_container_width=True)

    # Tab 2: Ask the Agent
    with tab2:
        st.header("Ask the Agent")
        
        if "chat_history" not in st.session_state:
            st.session_state.chat_history = []
            
        colA, colB = st.columns([0.8, 0.2])
        with colA:
            st.write("Example Questions:")
            b1, b2, b3 = st.columns(3)
            if b1.button("How many DUPLICATE_UTR exceptions?"):
                st.session_state.user_query = "How many DUPLICATE_UTR exceptions do we have?"
            if b2.button("Why did order_79254563 fail?"):
                st.session_state.user_query = "Why did order_79254563 fail reconciliation?"
            if b3.button("Total settled amount?"):
                st.session_state.user_query = "What is the total settled amount for all records?"
        with colB:
            if st.button("Clear conversation"):
                st.session_state.chat_history = []
                st.rerun()
                
        for msg in st.session_state.chat_history:
            st.chat_message(msg["role"]).write(msg["content"])
            
        user_query = st.chat_input("Ask a question about the settlements...")
        
        if getattr(st.session_state, 'user_query', None):
            user_query = st.session_state.user_query
            st.session_state.user_query = None
            
        if user_query:
            st.chat_message("user").write(user_query)
            
            with st.chat_message("assistant"):
                with st.spinner("Thinking..."):
                    import inspect
                    st.write("Signature of ask_agent:", str(inspect.signature(ask_agent)))
                    res = ask_agent(user_query, conversation_history=st.session_state.chat_history)
                    
                    st.session_state.chat_history.append({"role": "user", "content": user_query})
                    st.session_state.chat_history.append({"role": "assistant", "content": res["answer"]})
                    if len(st.session_state.chat_history) > 4:
                        st.session_state.chat_history = st.session_state.chat_history[-4:]
                    
                    # Display answer safely avoiding Windows terminal encoding issues if any
                    st.write(res["answer"])
                    
                    # Display Confidence Badge
                    conf = res["confidence"]
                    score = res.get("confidence_score", 0.0)
                    verified = res.get("verified", False)
                    v_note = res.get("verification_note", "")
                    
                    if verified == "not_applicable":
                        v_badge = " &nbsp; <span style='color:gray;'>&#8212; No lookup needed</span>"
                    else:
                        v_badge = f" &nbsp; <span style='color:{COLOR_GREEN};'>&#10003; Verified</span>" if verified else f" &nbsp; <span style='color:{COLOR_RED};'>&#9888; Discrepancy Found</span>"
                    
                    if conf == "Resolved":
                        st.markdown(f"**Confidence:** <span style='color:{COLOR_GREEN}; font-weight:bold;'>{conf} &middot; {score:.2f}</span>{v_badge}", unsafe_allow_html=True)
                    elif conf == "Partially Resolved":
                        st.markdown(f"**Confidence:** <span style='color:{COLOR_AMBER}; font-weight:bold;'>{conf} &middot; {score:.2f}</span>{v_badge}", unsafe_allow_html=True)
                    else:
                        st.markdown(f"**Confidence:** <span style='color:{COLOR_RED}; font-weight:bold;'>{conf} &middot; {score:.2f}</span>{v_badge}", unsafe_allow_html=True)
                        
                    if verified == False and v_note and v_note != "No tools used to look up data." and v_note != "No data lookup required for this response.":
                        st.error(f"**Verification Failed:** {v_note}")
                        
                    if "elapsed_seconds" in res:
                        st.markdown(f"<span style='color:gray; font-size: 0.8em;'>Answered in {res['elapsed_seconds']}s using {res['tool_call_count']} tool call(s).</span>", unsafe_allow_html=True)
                        
                    # Show Tool Calls
                    if res["tool_calls"]:
                        with st.expander("Show your work"):
                            if verified == "not_applicable":
                                st.write(f"**Verification Status:** ➖ Not Applicable - {v_note}")
                            else:
                                st.write(f"**Verification Status:** {'✅ Passed' if verified else '❌ Failed'} - {v_note}")
                            st.write(f"**Active Tolerances:** Amount &plusmn;&#8377;{AMOUNT_TOLERANCE}, Timing &plusmn;{TIME_TOLERANCE_HOURS}hrs")
                            for tc in res["tool_calls"]:
                                st.write(f"**Function:** `{tc['name']}`")
                                st.write("**Arguments:**")
                                st.json(tc['arguments'])
                                st.write("**Raw Result:**")
                                try:
                                    parsed = json.loads(tc.get('result', '{}'))
                                    st.code(json.dumps(parsed, indent=2), language="json")
                                except:
                                    st.code(tc.get('result', '{}'), language="json")

    # Tab 3: Exceptions
    with tab3:
        st.header("Exceptions List")
        st.info("Honest exception list: All unresolved records that failed strict reconciliation.")
        
        if exc.empty:
            st.success("No exceptions! 100% clean match.")
        else:
            reason_filter = st.selectbox("Filter by Reason Code", ["All"] + list(exc['reason'].unique()))
            display_exc = exc if reason_filter == "All" else exc[exc['reason'] == reason_filter]
            
            # Formatting amounts
            if 'amount' in display_exc.columns:
                display_exc['amount'] = display_exc['amount'].apply(lambda x: f"₹{x:,.2f}" if pd.notna(x) else x)
            if 'settled_amount' in display_exc.columns:
                display_exc['settled_amount'] = display_exc['settled_amount'].apply(lambda x: f"₹{x:,.2f}" if pd.notna(x) else x)
            if 'credited_amount' in display_exc.columns:
                display_exc['credited_amount'] = display_exc['credited_amount'].apply(lambda x: f"₹{x:,.2f}" if pd.notna(x) else x)
                
            for _, row in display_exc.iterrows():
                reason = row['reason']
                desc = row.get('description', '')
                oid = row.get('order_id', 'N/A')
                with st.expander(f"{reason} - {desc} (Order: {oid})"):
                    st.write("**Affected IDs:**")
                    st.write(f"- Order ID: {oid}")
                    st.write(f"- Payment ID: {row.get('payment_id', 'N/A')}")
                    st.write(f"- Settlement ID: {row.get('settlement_id', 'N/A')}")
                    st.write(f"- UTR: {row.get('utr', 'N/A')}")
                    
                    st.write("**What I checked and ruled out:**")
                    steps = get_checked_steps(reason)
                    for step in steps:
                        st.write(f"- {step}")

    # Tab 4: Eval Results
    with tab4:
        st.header("Evaluation Results")
        
        if st.button("Re-run Eval (Live)"):
            with st.spinner("Running evaluation harness... (this will take a minute)"):
                subprocess.run(["python", "-m", "eval.run_eval"])
                st.rerun()
                
        if eval_results:
            st.markdown(f"### Overall Accuracy: <span style='color:{COLOR_GREEN}; font-weight:bold;'>{eval_results['accuracy']}%</span>", unsafe_allow_html=True)
            
            # --- Calibration Chart ---
            st.subheader("Confidence Calibration")
            
            buckets = {"Resolved": {"total": 0, "passed": 0}, 
                       "Partially Resolved": {"total": 0, "passed": 0}, 
                       "Unresolved": {"total": 0, "passed": 0}}
            
            for q in eval_results['questions']:
                label = q.get("confidence_label", "Unknown")
                if label in buckets:
                    buckets[label]["total"] += 1
                    if q.get("passed"):
                        buckets[label]["passed"] += 1
                        
            chart_data = []
            captions = []
            for label, stats in buckets.items():
                total = stats["total"]
                if total > 0:
                    pct = (stats["passed"] / total) * 100
                    chart_data.append({"Confidence": label, "Accuracy (%)": pct, "Count": f"n={total}"})
                    if label == "Unresolved":
                        captions.append(f"{label} correctly identified {stats['passed']} of {total} unanswerable questions")
                    else:
                        captions.append(f"{label} answers were correct {pct:.0f}% of the time (n={total})")
            
            if chart_data:
                df_chart = pd.DataFrame(chart_data)
                fig_cal = px.bar(df_chart, x="Confidence", y="Accuracy (%)", text="Count", range_y=[0, 110])
                fig_cal.update_traces(textposition='outside')
                fig_cal.update_layout(paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)", font=dict(color="#FFFFFF"))
                st.plotly_chart(fig_cal, use_container_width=True)
                
                caption_text = "; ".join(captions) + "."
                st.caption(caption_text)
            
            st.divider()
            
            st.subheader("Question Breakdown")
            for q in eval_results['questions']:
                color = COLOR_GREEN if q['passed'] else COLOR_RED
                st.markdown(f"**Q:** {q['question']} &nbsp;&nbsp;&nbsp; <span style='color:{color}; font-weight:bold;'>{'PASS' if q['passed'] else 'FAIL'}</span>", unsafe_allow_html=True)
                with st.expander("Details"):
                    st.write(f"**Type:** {q['type']}")
                    if q['type'] == 'exact':
                        st.write(f"**Expected Match:** `{q['expected_match']}`")
                    st.write(f"**Agent Answer:** {q['agent_answer']}")
                st.divider()
        else:
            st.info("No evaluation results found. Click 'Re-run Eval' to generate them.")

    # Tab 5: Batch Test
    with tab5:
        st.header("Batch Test Mode")
        st.info("Note: This mode reports agent behavior (confidence, verification, latency), not correctness against an answer key since these are user-supplied questions with no ground truth.")
        
        uploaded_file = st.file_uploader("Upload a CSV file containing a single column 'question'", type=["csv"])
        if uploaded_file is not None:
            try:
                batch_df = pd.read_csv(uploaded_file)
                if 'question' not in batch_df.columns:
                    st.error("The uploaded CSV must contain a 'question' column.")
                else:
                    st.write("Preview of uploaded questions:")
                    st.dataframe(batch_df.head())
                    
                    if st.button("Run Batch"):
                        questions = batch_df['question'].dropna().tolist()
                        results_list = []
                        
                        progress_bar = st.progress(0)
                        status_text = st.empty()
                        
                        total_conf = 0.0
                        total_latency = 0.0
                        verified_count = 0
                        applicable_count = 0
                        
                        for i, q in enumerate(questions):
                            status_text.text(f"Processing question {i+1} of {len(questions)}...")
                            
                            # Rate limit retry logic
                            max_retries = 3
                            for attempt in range(max_retries):
                                res = ask_agent(q)
                                if "429" in res.get('answer', '') or "Rate limit" in res.get('answer', ''):
                                    time.sleep(5)
                                else:
                                    break
                                    
                            ans_summary = res.get('answer', '')
                            # Truncate summary if too long
                            if len(ans_summary) > 100:
                                ans_summary = ans_summary[:97] + "..."
                                
                            results_list.append({
                                "question": q,
                                "answer_summary": ans_summary,
                                "confidence_label": res.get("confidence", "Unknown"),
                                "confidence_score": res.get("confidence_score", 0.0),
                                "verified": res.get("verified", False),
                                "elapsed_seconds": res.get("elapsed_seconds", 0.0)
                            })
                            
                            total_conf += res.get("confidence_score", 0.0)
                            total_latency += res.get("elapsed_seconds", 0.0)
                            if res.get("verified") != "not_applicable":
                                applicable_count += 1
                                if res.get("verified") == True:
                                    verified_count += 1
                            
                            progress_bar.progress((i + 1) / len(questions))
                            time.sleep(1.5) # rate limit delay
                            
                        status_text.text("Batch processing complete!")
                        
                        # Show summary stats
                        st.subheader("Summary Statistics")
                        col1, col2, col3, col4 = st.columns(4)
                        col1.metric("Total Questions", len(questions))
                        col2.metric("Avg Confidence", f"{(total_conf / len(questions)):.2f}" if questions else "0.0")
                        col3.metric("% Verified", f"{(verified_count / applicable_count * 100):.1f}%" if applicable_count > 0 else "N/A")
                        col4.metric("Avg Latency", f"{(total_latency / len(questions)):.2f}s" if questions else "0.0s")
                        
                        # Show results table
                        st.subheader("Results Table")
                        res_df = pd.DataFrame(results_list)
                        st.dataframe(res_df)
                        
                        # Download button
                        csv = res_df.to_csv(index=False).encode('utf-8')
                        st.download_button(
                            label="Download Results as CSV",
                            data=csv,
                            file_name='batch_test_results.csv',
                            mime='text/csv',
                        )
            except Exception as e:
                st.error(f"Error reading file: {str(e)}")

if __name__ == "__main__":
    main()
