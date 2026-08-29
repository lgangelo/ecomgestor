import Link from 'next/link';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ChecklistItem } from '@/hooks/use-finance';

export function ChecklistRow({ item }: { item: ChecklistItem }) {
  const isWarning = item.severity === 'warning';
  const content = (
    <span className="flex items-center gap-2 text-sm">
      {isWarning ? (
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
      ) : (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
      )}
      <span className={isWarning ? 'text-foreground' : 'text-muted-foreground'}>
        {isWarning ? item.detail : item.label}
      </span>
    </span>
  );

  if (isWarning && item.link) {
    return (
      <Link href={item.link} className="block rounded-md hover:underline">
        {content}
      </Link>
    );
  }
  return content;
}

/** Checklist de uma seção do fechamento mensal (seções 20-23 da Fase 4) — nenhum item bloqueia. */
export function MonthlyClosingChecklistCard({ title, items }: { title: string; items: ChecklistItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 pt-0">
        {items.map((item) => (
          <ChecklistRow key={item.key} item={item} />
        ))}
      </CardContent>
    </Card>
  );
}
