'use client';

import { AlertTriangle, Download, FileCheck2, FileText, FileWarning } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useChannels } from '@/hooks/use-channels';
import { useDownloadMonthlyFiscalExport, useFiscalMonthlySummary } from '@/hooks/use-fiscal';
import { useUrlFilters } from '@/hooks/use-url-filters';

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(referenceMonth: string): string {
  const [year, month] = referenceMonth.split('-');
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
    new Date(Number(year), Number(month) - 1, 1),
  );
}

// Filtros persistem na URL (seção 57 da Fase 4 — "Fiscal (a nova tela por mês)").
const DEFAULT_FILTERS = { referenceMonth: currentMonthValue(), channelId: '' };

/**
 * Fluxo principal do módulo fiscal (seções 9-16 da Fase 4): escolher o mês, ver o preview antes
 * de baixar (nunca finge que o pacote está completo — seção 12) e baixar o ZIP sob demanda. O
 * upload manual de XML e a lista completa de documentos ficam na tela `/fiscal` (ação
 * secundária, seção 18).
 */
export function FiscalExportView() {
  const [filters, setFilters] = useUrlFilters(DEFAULT_FILTERS);
  const { data: channels } = useChannels();
  const { data: summary, isLoading } = useFiscalMonthlySummary(filters.referenceMonth, filters.channelId || undefined);
  const download = useDownloadMonthlyFiscalExport();

  return (
    <div>
      <PageHeader
        title="Exportação de XML"
        description="Baixe os XMLs emitidos no mês para enviar à contabilidade."
      />

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-end gap-4 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="referenceMonth">Mês</Label>
            <Input
              id="referenceMonth"
              type="month"
              className="w-44"
              value={filters.referenceMonth}
              onChange={(e) => setFilters({ referenceMonth: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Canal</Label>
            <Select
              value={filters.channelId || 'all'}
              onValueChange={(v) => setFilters({ channelId: v === 'all' ? undefined : v })}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os canais</SelectItem>
                {channels?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="ml-auto"
            disabled={!summary || summary.xmlAvailableCount === 0 || download.isPending}
            onClick={() => download.mutate({ referenceMonth: filters.referenceMonth, channelId: filters.channelId || undefined })}
          >
            <Download className="h-4 w-4" />
            {download.isPending
              ? 'Gerando pacote...'
              : summary && summary.xmlUnavailableCount > 0
                ? `Baixar ${summary.xmlAvailableCount} disponíveis`
                : 'Baixar XMLs para contabilidade'}
          </Button>
        </CardContent>
      </Card>

      {isLoading || !summary ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <>
          <h2 className="mb-3 text-lg font-semibold capitalize">{monthLabel(filters.referenceMonth)}</h2>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Documentos emitidos" value={String(summary.documentsCount)} icon={FileText} />
            <StatCard title="NF-e de venda" value={String(summary.saleInvoiceCount)} icon={FileText} />
            <StatCard title="NF-e de devolução" value={String(summary.returnInvoiceCount)} icon={FileText} />
            <StatCard title="XML disponível" value={String(summary.xmlAvailableCount)} icon={FileCheck2} />
          </div>

          {summary.documentsCount === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum documento fiscal emitido neste mês.</p>
          ) : summary.xmlUnavailableCount > 0 ? (
            <Card className="border-warning/40">
              <CardContent className="flex items-center gap-3 p-4 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                <p>
                  <span className="font-medium">{summary.xmlUnavailableCount}</span>{' '}
                  {summary.xmlUnavailableCount === 1 ? 'documento não pôde' : 'documentos não puderam'} ser recuperado
                  {summary.xmlUnavailableCount === 1 ? '' : 's'}. O pacote inclui os{' '}
                  {summary.xmlAvailableCount} disponíveis e uma lista de pendências (<code>pendencias.csv</code>).
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-success/40">
              <CardContent className="flex items-center gap-3 p-4 text-sm">
                <FileCheck2 className="h-4 w-4 shrink-0 text-success" />
                <p>Todos os XMLs deste mês estão disponíveis para download.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {summary && summary.documentsCount > 0 && summary.xmlAvailableCount === 0 && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <FileWarning className="h-4 w-4" /> Nenhum XML disponível para baixar neste mês.
        </p>
      )}
    </div>
  );
}
