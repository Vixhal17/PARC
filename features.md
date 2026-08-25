# Project Features

This document outlines each and every feature of the Settlement Q&A Agent project, detailing how they work and their results.

## 1. Reconciliation Engine
*   **Working**: The engine deterministically merges data across multiple stages: Orders -> Payments -> Settlements -> Bank Statements. It uses exact matching on IDs (`order_id`, `payment_id`, `utr`). It incorporates active matching rules with defined tolerances (e.g., Amount ±₹1.00, Timing ±48.0 hours). If an exact UTR match fails between settlements and bank statements, it applies fuzzy matching using `rapidfuzz` (with a >=90 ratio fallback).
*   **Results**: Classifies each record as a `CLEAN_MATCH` or assigns a specific exception reason. Outputs a consolidated dataframe and calculates the overall Match Rate (e.g., 91.2%).

## 2. Exceptions Triage
*   **Working**: Automatically tags reconciliation failures with specific reason codes by checking conditions sequentially:
    *   `MISSING_PAYMENT`: No `payment_id` found for a merged order.
    *   `UNRESOLVED`: Payment is orphaned with no `settlement_id`.
    *   `DUPLICATE_UTR`: Count of unique `settlement_id`s per UTR is greater than 1.
    *   `MISSING_SETTLEMENT`: No matching bank statement UTR found (even after fuzzy matching).
    *   `AMOUNT_MISMATCH`: Absolute difference between `credited_amount` and `settled_amount` exceeded the defined tolerance.
    *   `TIMING_DELAY`: Difference between `credited_at` and `settled_at` exceeded the defined hours tolerance.
*   **Results**: Generates an exceptions dataset detailing the specific reason and steps checked for each failed record.

## 3. Q&A Agent
*   **Working**: Powered by the **NVIDIA NIM API** (`nvidia/nemotron-3-ultra-550b-a55b`) utilizing an OpenAI-compatible client. The agent uses tool-calling to execute localized, read-only Python functions to query the reconciled dataset. It operates with strict guardrails, explicitly instructed to refuse to answer if the underlying tools return no data, effectively preventing hallucinations.
*   **Results**: Delivers natural language answers to user queries about the settlement data. Provides confidence labels (`Resolved`, `Partially Resolved`, `Unresolved`), a verification status, and an expandable "Show your work" section detailing the function calls and arguments used.

## 4. Interactive Dashboard
*   **Working**: Built with Streamlit, featuring a polished dark mode UI and multiple tabs:
    *   **Sidebar**: Allows for the regeneration of synthetic data on the fly using `Faker`.
    *   **Overview Tab**: Displays key metrics (Match Rate, Total Records, Exceptions Count), an Exceptions Breakdown Pie Chart, and a Settlement Timeline Bar Chart comparing settled vs. bank credited amounts.
    *   **Ask the Agent Tab**: A live chat interface with pre-filled example questions, rendering agent responses with confidence badges.
    *   **Exceptions Tab**: Provides a comprehensive list of all unresolved records, filterable by reason code, with an expander detailing affected IDs and the specific checks that were ruled out.
    *   **Eval Results Tab**: Displays the evaluation harness output, including overall accuracy and a Confidence Calibration bar chart.
*   **Results**: Provides a real-time, user-friendly control center for Finance Controllers to monitor KPIs, triage exceptions, and interact with the AI agent.

## 5. Evaluation Harness
*   **Working**: An automated evaluation script that tests the Q&A agent against a set of predefined questions (`eval/test_questions.json`). It grades the agent's accuracy based on expected exact matches and employs a secondary LLM grader to verify the agent's refusal behavior on unanswerable questions.
*   **Results**: Generates a comprehensive results JSON containing the overall accuracy (e.g., 90.0%) and a detailed breakdown of each question (PASS/FAIL), which is then visualized in the dashboard.
