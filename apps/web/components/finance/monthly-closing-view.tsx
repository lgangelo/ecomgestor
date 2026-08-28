'use client';

import * as React from 'react';
import { CalendarCheck } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { MONTHLY_CLOSING_STATUS_PRESENTATION } from '@ecommerce-manager/ui';
import { formatBRL } from '@ecommerce-manager/shared';
import { useCloseMonth, useMonthlyClosings } from '@/hooks/use-finance';
import { DreBreakdown } from './dre-breakdown';
import { ReopenClosingDialog } from './reopen-closing-dialog';

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function MonthlyClosingView() {
  const { data: closings, isLoading } = useMonthlyClosings();
  const closeMonth = useCloseMonth();
  const [referenceMonth, setReferenceMonth] = React.useState(currentMonthValue());
  const [expanded, setExpanded] = React.useState<string | null>(null);

  return (
    <div>
      <PageHeader title="Fechamento mensal" description="Consolidação do resultado gerencial por mês." />

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-end gap-4 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="referenceMonth">Mês de referência</Label>
            <Input
              id="referenceMonth"
              type="month"
              className="w-44"
              value={referenceMonth}
              onChange={(e) => setReferenceMonth(e.target.value)}
            />
          </div>
          <Button onClick={() => closeMonth.mutate(referenceMonth)} disabled={closeMonth.isPending}>
            {closeMonth.isPending ? 'Fechando...' : 'Fechar mês'}
          </Button>
        </CardContent>
      </Card>

      {isLoading || !closings ? (
        <Skeleton className="h-48" />
      ) : closings.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="Nenhum fechamento registrado ainda" />
      ) : (
        <div className="space-y-3">
          {closings.map((closing) => (
            <Card key={closing.id}>
              <button
                type="button"
                onClick={() => setExpanded(expanded === closing.id ? null : closing.id)}
                className="flex w-full items-center justify-between p-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium">
                    {new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
                      new Date(closing.referenceMonth),
                    )}
                  </span>
                  <StatusBadge status={closing.status} map={MONTHLY_CLOSING_STATUS_PRESENTATION} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">{formatBRL(closing.managementResult)}</span>
                  {closing.status === 'CLOSED' && (
                    <ReopenClosingDialog
                      closingId={closing.id}
                      trigger={
                        <Button variant="outline" size="sm">
                          Reabrir período
                        </Button>
                      }
                    />
                  )}
                </div>
              </button>
              {expanded === closing.id && (
                <div className="border-t border-border p-4">
                  <DreBreakdown
                    data={{
                      ...closing,
                      disclaimer: 'Resultado gerencial estimado. Não substitui apuração fiscal ou contábil.',
                    }}
                  />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
