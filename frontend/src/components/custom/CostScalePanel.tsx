import { Zap } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import type { CostScaleProjection } from '../../types';

interface CostScalePanelProps {
  projection: CostScaleProjection;
}

export function CostScalePanel({ projection }: CostScalePanelProps) {
  return (
    <Card className="mb-4 bg-slate-50/70 dark:bg-zinc-900/60 border border-slate-200/80 dark:border-zinc-800 shadow-xs">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-amber-500 dark:text-amber-400" />
          <h3 className="font-semibold text-sm text-slate-900 dark:text-zinc-100">
            Cost & Scale Projections
          </h3>
        </div>
        <ul className="text-sm text-slate-700 dark:text-zinc-300 space-y-1.5 ml-6 list-disc marker:text-amber-500">
          <li>Current free tier: NVIDIA NIM, 40 requests/min</li>
          <li>Actual throughput: ~{projection.actual_cap} queries/hour ({projection.bottleneck_msg})</li>
          <li>A 1,000-record daily reconciliation batch would take approximately {projection.calc_time} to process</li>
        </ul>
        <p className="text-xs text-slate-500 dark:text-zinc-400 italic mt-3 pl-1">
          Free tier is intended for prototyping; production deployment would require a paid API tier for higher throughput.
        </p>
      </CardContent>
    </Card>
  );
}
