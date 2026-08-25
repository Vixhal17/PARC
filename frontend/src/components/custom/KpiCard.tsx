import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Database, AlertTriangle, Target, CheckCircle, Clock, Zap, Layers, XCircle } from 'lucide-react';
import { Card, CardContent } from '../ui/card';

interface KpiCardProps {
  label: string;
  value: number | string;
  prefix?: string;
  suffix?: string;
  subtitle?: string;
  animateCountUp?: boolean;
  decimalPlaces?: number;
  accentColor?: "emerald" | "amber" | "rose" | "indigo";
  icon?: ReactNode;
}

export function KpiCard({
  label,
  value,
  prefix = "",
  suffix = "",
  subtitle,
  animateCountUp = false,
  decimalPlaces,
  accentColor: explicitAccent,
  icon: explicitIcon,
}: KpiCardProps) {
  const formatVal = (v: number | string): string | number => {
    if (typeof v === 'number') {
      if (decimalPlaces !== undefined) return v.toFixed(decimalPlaces);
      return Number.isInteger(v) ? v : v.toFixed(2);
    }
    const num = parseFloat(String(v));
    if (!isNaN(num) && (String(v).includes('.') || decimalPlaces !== undefined)) {
      return num.toFixed(decimalPlaces ?? 2);
    }
    return v;
  };

  const [displayValue, setDisplayValue] = useState<string | number>(
    animateCountUp && typeof value === 'number' ? 0 : formatVal(value)
  );

  useEffect(() => {
    if (animateCountUp && typeof value === 'number') {
      let start = 0;
      const end = value;
      const duration = 1000;
      let startTimestamp: number | null = null;
      const decimals = decimalPlaces ?? (Number.isInteger(end) ? 0 : 2);

      const step = (timestamp: number) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 4);
        const current = start + easeProgress * (end - start);

        if (decimals === 0) {
          setDisplayValue(Math.floor(current));
        } else {
          setDisplayValue(current.toFixed(decimals));
        }

        if (progress < 1) {
          window.requestAnimationFrame(step);
        } else {
          setDisplayValue(decimals === 0 ? end : end.toFixed(decimals));
        }
      };

      window.requestAnimationFrame(step);
    } else {
      setDisplayValue(formatVal(value));
    }
  }, [value, animateCountUp, decimalPlaces]);

  // Determine semantic color and icon based on label and value
  const numericVal = typeof value === 'number' ? value : parseFloat(String(value));
  const isNumeric = !isNaN(numericVal);
  const normalizedLabel = label.toLowerCase();

  let accent: "emerald" | "amber" | "rose" | "indigo" = explicitAccent || "indigo";
  let CardIcon: ReactNode = explicitIcon;
  let autoSubtitle: string | undefined = subtitle;

  if (!explicitAccent || !explicitIcon) {
    if (normalizedLabel.includes('match rate') || normalizedLabel.includes('verified rate')) {
      if (isNumeric && numericVal >= 85) {
        accent = "emerald";
        CardIcon = CardIcon || <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
        autoSubtitle = autoSubtitle || "Target > 90% achieved";
      } else if (isNumeric && numericVal >= 70) {
        accent = "amber";
        CardIcon = CardIcon || <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
        autoSubtitle = autoSubtitle || "Near target range";
      } else {
        accent = "rose";
        CardIcon = CardIcon || <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />;
        autoSubtitle = autoSubtitle || "Attention required";
      }
    } else if (normalizedLabel.includes('accuracy') || normalizedLabel.includes('confidence')) {
      if (isNumeric && numericVal >= 85) {
        accent = "emerald";
        CardIcon = CardIcon || <Target className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
        autoSubtitle = autoSubtitle || "Ground-truth calibrated";
      } else if (isNumeric && numericVal >= 70) {
        accent = "amber";
        CardIcon = CardIcon || <Target className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
        autoSubtitle = autoSubtitle || "Moderate confidence";
      } else if (isNumeric) {
        accent = "rose";
        CardIcon = CardIcon || <Target className="w-4 h-4 text-rose-600 dark:text-rose-400" />;
        autoSubtitle = autoSubtitle || "Needs tuning";
      } else {
        accent = "indigo";
        CardIcon = CardIcon || <Target className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
        autoSubtitle = autoSubtitle || "Ground-truth calibrated";
      }
    } else if (normalizedLabel.includes('exception')) {
      if (isNumeric && numericVal === 0) {
        accent = "emerald";
        CardIcon = CardIcon || <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
        autoSubtitle = autoSubtitle || "Clean 0 discrepancies";
      } else {
        accent = "amber";
        CardIcon = CardIcon || <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
        autoSubtitle = autoSubtitle || "Actionable discrepancies";
      }
    } else if (normalizedLabel.includes('latency')) {
      if (isNumeric && numericVal <= 10) {
        accent = "emerald";
        CardIcon = CardIcon || <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
        autoSubtitle = autoSubtitle || "Ultra-fast response";
      } else if (isNumeric && numericVal <= 25) {
        accent = "amber";
        CardIcon = CardIcon || <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
        autoSubtitle = autoSubtitle || "Acceptable latency";
      } else {
        accent = "rose";
        CardIcon = CardIcon || <Clock className="w-4 h-4 text-rose-600 dark:text-rose-400" />;
        autoSubtitle = autoSubtitle || "High latency";
      }
    } else if (normalizedLabel.includes('record') || normalizedLabel.includes('question') || normalizedLabel.includes('evaluated')) {
      accent = "indigo";
      CardIcon = CardIcon || (normalizedLabel.includes('question') ? <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> : <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />);
      autoSubtitle = autoSubtitle || "Full synthetic dataset";
    }
  }

  const borderClasses = {
    emerald: "border-l-4 border-l-emerald-500 dark:border-l-emerald-400 hover:border-emerald-400/60",
    amber: "border-l-4 border-l-amber-500 dark:border-l-amber-400 hover:border-amber-400/60",
    rose: "border-l-4 border-l-rose-500 dark:border-l-rose-400 hover:border-rose-400/60",
    indigo: "border-l-4 border-l-indigo-600 dark:border-l-indigo-400 hover:border-indigo-400/60",
  }[accent];

  const iconBgClasses = {
    emerald: "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200/80 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300",
    amber: "bg-amber-50 dark:bg-amber-950/60 border-amber-200/80 dark:border-amber-900/60 text-amber-700 dark:text-amber-300",
    rose: "bg-rose-50 dark:bg-rose-950/60 border-rose-200/80 dark:border-rose-900/60 text-rose-700 dark:text-rose-300",
    indigo: "bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200/80 dark:border-indigo-900/60 text-indigo-700 dark:text-indigo-300",
  }[accent];

  return (
    <Card className={`relative overflow-hidden bg-white dark:bg-zinc-900/90 border border-[#e3e8ee] dark:border-zinc-800/80 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group ${borderClasses}`}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-[11px] font-semibold tracking-wider text-slate-500 dark:text-zinc-400 uppercase">
            {label}
          </p>
          {CardIcon && (
            <div className={`p-1.5 rounded-lg border shadow-2xs group-hover:scale-105 transition-transform ${iconBgClasses}`}>
              {CardIcon}
            </div>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-light text-[#0d253d] dark:text-white tnum tracking-[-0.64px]"
        >
          {prefix}{displayValue}{suffix}
        </motion.div>

        {autoSubtitle && (
          <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1.5 flex items-center gap-1 font-light">
            <span>{autoSubtitle}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
