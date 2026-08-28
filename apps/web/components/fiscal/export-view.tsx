'use client';

import * as React from 'react';
import { Download, FileArchive } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { FISCAL_DOCUMENT_STATUS_PRESENTATION } from '@ecommerce-manager/ui';
import { formatDate } from '@/lib/format';
import { useExportFiscalDocuments, useFiscalDocuments } from '@/hooks/use-fiscal';

export function FiscalExportView() {
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [selected, setSelected] = React.useState<string[]>([]);

  const { data, isLoading } = useFiscalDocuments({ dateFrom, dateTo, pageSize: 100, status: 'ISSUED' });
  const exportDocuments = useExportFiscalDocuments();

  function toggleAll() {
    if (!data) return;
    setSelected((s) => (s.length === data.items.length ? [] : data.items.map((d) => d.id)));
  }

  return (
    <div>
      <PageHeader
        title="Exportação de XML"
        description="Selecione um período e os documentos fiscais para exportar em lote."
      />

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-end gap-4 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="dateFrom">De</Label>
            <Input id="dateFrom" type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dateTo">Até</Label>
            <Input id="dateTo" type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <Button variant="outline" onClick={toggleAll} disabled={!data || data.items.length === 0}>
            {data && selected.length === data.items.length ? 'Desmarcar todos' : 'Selecionar todos'}
          </Button>
          <Button
            disabled={selected.length === 0 || exportDocuments.isPending}
            onClick={() => exportDocuments.mutate(selected)}
          >
            <Download className="h-4 w-4" />
            Baixar XMLs ({selected.length})
          </Button>
        </CardContent>
      </Card>

      {isLoading || !data ? (
        <div className="rounded-lg border border-border">
          <TableSkeleton />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState icon={FileArchive} title="Nenhum documento emitido no período selecionado" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead>Pedido</TableHead>
              <TableHead>NF-e</TableHead>
              <TableHead>Emissão</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell>
                  <Checkbox
                    checked={selected.includes(doc.id)}
                    onCheckedChange={() =>
                      setSelected((s) => (s.includes(doc.id) ? s.filter((x) => x !== doc.id) : [...s, doc.id]))
                    }
                  />
                </TableCell>
                <TableCell>{doc.customerName ?? doc.orderId?.slice(0, 8) ?? '—'}</TableCell>
                <TableCell>{doc.number ?? '—'}</TableCell>
                <TableCell>{formatDate(doc.issueDate)}</TableCell>
                <TableCell>
                  <StatusBadge status={doc.status} map={FISCAL_DOCUMENT_STATUS_PRESENTATION} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
