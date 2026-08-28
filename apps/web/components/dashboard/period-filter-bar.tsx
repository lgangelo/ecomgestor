'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useChannels } from '@/hooks/use-channels';

export interface PeriodFilterValue {
  dateFrom: string;
  dateTo: string;
  channelId?: string;
  compare: boolean;
}

export function PeriodFilterBar({
  value,
  onChange,
}: {
  value: PeriodFilterValue;
  onChange: (value: PeriodFilterValue) => void;
}) {
  const { data: channels } = useChannels();

  return (
    <div className="mb-6 flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4">
      <div className="space-y-1.5">
        <Label htmlFor="dateFrom">De</Label>
        <Input
          id="dateFrom"
          type="date"
          value={value.dateFrom}
          onChange={(e) => onChange({ ...value, dateFrom: e.target.value })}
          className="w-40"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dateTo">Até</Label>
        <Input
          id="dateTo"
          type="date"
          value={value.dateTo}
          onChange={(e) => onChange({ ...value, dateTo: e.target.value })}
          className="w-40"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Canal</Label>
        <Select
          value={value.channelId ?? 'all'}
          onValueChange={(v) => onChange({ ...value, channelId: v === 'all' ? undefined : v })}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todos os canais" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os canais</SelectItem>
            {channels?.map((channel) => (
              <SelectItem key={channel.id} value={channel.id}>
                {channel.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2 pb-1.5">
        <Switch
          id="compare"
          checked={value.compare}
          onCheckedChange={(checked) => onChange({ ...value, compare: checked })}
        />
        <Label htmlFor="compare">Comparar com período anterior</Label>
      </div>
    </div>
  );
}
