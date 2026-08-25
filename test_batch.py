import pandas as pd
from agent.qa_agent import ask_agent
import time
import sys

questions = ['How many DUPLICATE_UTR exceptions do we have?', 'Why did order_79254563 fail?', 'What is the total settled amount for all records?', 'What is the status of order_88888888?', 'Why did settlement setl_00000000 fail?']

total_conf = 0.0
total_latency = 0.0
verified_count = 0
applicable_count = 0

for i, q in enumerate(questions):
    print(f"Processing Q{i+1}: {q}")
    sys.stdout.flush()
    for attempt in range(3):
        res = ask_agent(q)
        if '429' in res.get('answer', '') or 'Rate limit' in res.get('answer', ''):
            print("Rate limited, sleeping 5s")
            time.sleep(5)
        else:
            break
            
    print(f"Confidence: {res.get('confidence_score')}, Latency: {res.get('elapsed_seconds')}, Verified: {res.get('verified')}")
    sys.stdout.flush()
    total_conf += res.get('confidence_score', 0.0)
    total_latency += res.get('elapsed_seconds', 0.0)
    if res.get('verified') != 'not_applicable':
        applicable_count += 1
        if res.get('verified') == True:
            verified_count += 1
    time.sleep(1.5)

print(f'\nTotal Questions: {len(questions)}')
print(f'Avg Confidence: {(total_conf / len(questions)):.2f}')
print(f'% Verified: {(verified_count / applicable_count * 100):.1f}%' if applicable_count > 0 else 'N/A')
print(f'Avg Latency: {(total_latency / len(questions)):.2f}s')
