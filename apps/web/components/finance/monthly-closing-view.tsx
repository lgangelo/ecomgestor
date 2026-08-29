'use client';

import * as React from 'react';
import Link from 'next/link';
import { CalendarCheck } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { MONTHLY_CLOSING_STATUS_PRESENTATION } from '@ecommerce-manager/ui';
import { formatBRL } from '@ecommerce-manager/shared';
import { useCloseMonth, useMonthlyClosingPreview, useMonthlyClosings, type FiscalChecklist } from '@/hooks/use-finance';
import { DreBreakdown } from './dre-breakdown';
import { ReopenClosingDialog } from './reopen-closing-dialog';
import { CloseMonthDialog } from './close-month-dialog';
import { MonthlyClosingChecklistCard, ChecklistRow } from './monthly-closing-checklist';

const DISCLAIMER = 'Resultado gerencial estimado. Não substitui apuração fiscal ou contábil.';

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(referenceMonth: string): string {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(referenceMonth));
}

function FiscalClosingCard({ fiscal }: { fiscal: FiscalChecklist }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fiscal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">NF-e de venda</span>
          <span className="font-medium text-foreground">{fiscal.saleInvoiceCount}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">NF-e de devolução</span>
          <span className="font-medium text-foreground">{fiscal.returnInvoiceCount}</span>
        </div>
        <div className="space-y-2 border-t border-border pt-3">
          {fiscal.items.map((item) => (
            <ChecklistRow key={item.key} item={item} />
          ))}
        </div>
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link href="/fiscal/exportacao">Baixar XMLs para contabilidade</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function MonthlyClosingView() {
  const { data: closings, isLoading } = useMonthlyClosings();
  const [referenceMonth, setReferenceMonth] = React.useState(currentMonthValue());
  const { data: preview, isLoading: isPreviewLoading } = useMonthlyClosingPreview(referenceMonth);
  const closeMonth = useCloseMonth();
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

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
          {preview && <StatusBadge status={preview.status} map={MONTHLY_CLOSING_STATUS_PRESENTATION} />}
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={!preview || preview.status === 'CLOSED' || closeMonth.isPending}
          >
            {preview?.status === 'CLOSED' ? 'Mês já fechado' : 'Fechar mês'}
          </Button>
        </CardContent>
      </Card>

      {isPreviewLoading || !preview ? (
        <Skeleton className="mb-6 h-64" />
      ) : (
        <div className="mb-8 space-y-4">
          <h2 className="text-lg font-semibold capitalize">Fechamento — {monthLabel(preview.referenceMonth)}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <MonthlyClosingChecklistCard title="Operacional" items={preview.operational} />
            <MonthlyClosingChecklistCard title="Financeiro" items={preview.financial} />
            <FiscalClosingCard fiscal={preview.fiscal} />
          </div>
          <DreBreakdown data={{ ...preview, disclaimer: DISCLAIMER }} />
        </div>
      )}

      {preview && (
        <CloseMonthDialog open={confirmOpen} onOpenChange={setConfirmOpen} preview={preview} />
      )}

      <h2 className="mb-3 text-lg font-semibold">Histórico de fechamentos</h2>
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
                  <span className="font-medium capitalize">{monthLabel(closing.referenceMonth)}</span>
                  <StatusBadge status={closing.status} map={MONTHLY_CLOSING_STATUS_PRESENTATION} />
                  {closing.warningsSnapshot && closing.warningsSnapshot.length > 0 && (
                    <span className="text-xs text-warning">
                      {closing.warningsSnapshot.length}{' '}
                      {closing.warningsSnapshot.length === 1 ? 'aviso' : 'avisos'}
                    </span>
                  )}
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
                <div className="space-y-4 border-t border-border p-4">
                  <div className="grid gap-4 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-muted-foreground">Pedidos</p>
                      <p className="font-medium">{closing.ordersCount}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Devoluções</p>
                      <p className="font-medium">{closing.returnsCount}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">NF-e emitidas</p>
                      <p className="font-medium">{closing.saleInvoiceCount + closing.returnInvoiceCount}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Pendências fiscais</p>
                      <p className="font-medium">{closing.fiscalPendingCount}</p>
                    </div>
                  </div>
                  <DreBreakdown data={{ ...closing, disclaimer: DISCLAIMER }} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
