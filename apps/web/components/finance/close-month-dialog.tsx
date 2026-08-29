'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatBRL } from '@ecommerce-manager/shared';
import { useCloseMonth, type MonthlyClosingPreview } from '@/hooks/use-finance';

function monthLabel(referenceMonth: string): string {
  const [year, month] = referenceMonth.split('-');
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
    new Date(Number(year), Number(month) - 1, 1),
  );
}

/** Resumo de confirmação antes de fechar (seção 25 da Fase 4) — sempre mostra os avisos não
 * bloqueantes existentes; nunca finge que não há nenhuma pendência. */
export function CloseMonthDialog({
  open,
  onOpenChange,
  preview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: MonthlyClosingPreview;
}) {
  const closeMonth = useCloseMonth();

  async function handleConfirm() {
    await closeMonth.mutateAsync(preview.referenceMonth);
    onOpenChange(false);
  }

  const documentsCount = preview.fiscal.saleInvoiceCount + preview.fiscal.returnInvoiceCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fechar {monthLabel(preview.referenceMonth)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Você está fechando <span className="font-medium text-foreground">{monthLabel(preview.referenceMonth)}</span>.
          </p>
          <ul className="space-y-1.5 rounded-md bg-muted px-4 py-3">
            <li>
              <span className="font-semibold">{documentsCount}</span> documentos fiscais
            </li>
            <li>
              <span className="font-semibold">{preview.ordersCount}</span> pedidos
            </li>
            <li>
              <span className="font-semibold">{formatBRL(preview.grossRevenue)}</span> de faturamento
            </li>
            <li>
              <span className="font-semibold">{formatBRL(preview.managementResult)}</span> de resultado estimado
            </li>
          </ul>
          {preview.warnings.length > 0 ? (
            <p className="text-warning">
              {preview.warnings.length} {preview.warnings.length === 1 ? 'aviso não bloqueante' : 'avisos não bloqueantes'}.
            </p>
          ) : (
            <p className="text-success">Nenhum aviso pendente.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={closeMonth.isPending}>
            {closeMonth.isPending ? 'Fechando...' : 'Fechar período'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
