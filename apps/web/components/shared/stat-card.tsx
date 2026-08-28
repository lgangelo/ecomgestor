import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function StatCard({
  title,
  value,
  icon: Icon,
  hint,
  trend,
}: {
  title: string;
  value: string;
  icon?: LucideIcon;
  hint?: string;
  trend?: { value: number; label?: string };
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle>{title}</CardTitle>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        {trend && (
          <p
            className={cn(
              'mt-1 text-xs font-medium',
              trend.value > 0 ? 'text-success' : trend.value < 0 ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {trend.value > 0 ? '+' : ''}
            {trend.value.toFixed(1)}% {trend.label ?? 'vs. período anterior'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
