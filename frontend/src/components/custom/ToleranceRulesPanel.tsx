import { ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import type { ToleranceRules } from '../../types';

interface ToleranceRulesPanelProps {
  rules: ToleranceRules;
}

export function ToleranceRulesPanel({ rules }: ToleranceRulesPanelProps) {
  return (
    <Card className="mb-4 bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100/80 dark:border-indigo-900/40 shadow-xs">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="font-semibold text-sm text-indigo-950 dark:text-indigo-200">
            Active Matching Rules
          </h3>
        </div>
        <ul className="text-sm text-slate-700 dark:text-zinc-300 space-y-1.5 ml-6 list-disc marker:text-indigo-500">
          <li>Amounts matched within &plusmn;&#8377;{rules.amount_tolerance}</li>
          <li>Settlements matched within &plusmn;{rules.time_tolerance_hours} hours of expected timing</li>
          <li>Fuzzy UTR matching applied via rapidfuzz when exact match fails</li>
        </ul>
      </CardContent>
    </Card>
  );
}
