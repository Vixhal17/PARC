import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';

interface CalibrationChartProps {
  calibration: Record<string, { expected: number; actual: number }>;
}

export function CalibrationChart({ calibration }: CalibrationChartProps) {
  if (!calibration || Object.keys(calibration).length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-lg">Confidence Calibration</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64 text-muted-foreground">
          No calibration data available.
        </CardContent>
      </Card>
    );
  }

  const data = Object.entries(calibration).map(([label, metrics]) => ({
    label,
    expected: metrics.expected * 100,
    actual: metrics.actual * 100,
  }));

  const isCalibrated = data.every(d => Math.abs(d.expected - d.actual) <= 15);
  const caption = isCalibrated
    ? "Agent is well-calibrated (accuracy matches confidence)."
    : "Agent is overconfident in some areas.";

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-lg">Confidence Calibration</CardTitle>
        <CardDescription>{caption}</CardDescription>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
            <YAxis 
              tickLine={false} 
              axisLine={false} 
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickFormatter={(val) => `${val}%`}
              domain={[0, 100]}
            />
            <Tooltip 
              formatter={(value: any) => [`${Number(value || 0).toFixed(1)}%`, undefined]}
              contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            />
            <Bar dataKey="expected" name="Expected Accuracy" fill="#9ca3af" radius={[4, 4, 0, 0]} />
            <Bar dataKey="actual" name="Actual Accuracy" fill="#4f46e5" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
