'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export interface DateRange {
  dateFrom: string;
  dateTo: string;
}

export function FinancePeriodFilter({ value, onChange }: { value: DateRange; onChange: (v: DateRange) => void }) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4">
      <div className="space-y-1.5">
        <Label htmlFor="dateFrom">De</Label>
        <Input
          id="dateFrom"
          type="date"
          className="w-40"
          value={value.dateFrom}
          onChange={(e) => onChange({ ...value, dateFrom: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dateTo">Até</Label>
        <Input
          id="dateTo"
          type="date"
          className="w-40"
          value={value.dateTo}
          onChange={(e) => onChange({ ...value, dateTo: e.target.value })}
        />
      </div>
    </div>
  );
}

export function defaultMonthRange(): DateRange {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { dateFrom: start.toISOString().slice(0, 10), dateTo: now.toISOString().slice(0, 10) };
}
