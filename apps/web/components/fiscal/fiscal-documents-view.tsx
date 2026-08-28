'use client';

import * as React from 'react';
import { Download, FileText } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { FISCAL_DOCUMENT_STATUS_PRESENTATION } from '@ecommerce-manager/ui';
import { formatDate } from '@/lib/format';
import { useDownloadFiscalXml, useExportFiscalDocuments, useFiscalDocuments } from '@/hooks/use-fiscal';

const STATUSES = ['PENDING', 'ISSUED', 'CANCELLED', 'ERROR'];

export function FiscalDocumentsView() {
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState<string | undefined>();
  const [selected, setSelected] = React.useState<string[]>([]);

  const { data, isLoading } = useFiscalDocuments({ page, pageSize: 20, status });
  const downloadXml = useDownloadFiscalXml();
  const exportDocuments = useExportFiscalDocuments();

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  return (
    <div>
      <PageHeader
        title="Documentos fiscais"
        description="NF-e emitidas para os pedidos."
        actions={
          <Button
            disabled={selected.length === 0 || exportDocuments.isPending}
            onClick={() => exportDocuments.mutate(selected)}
          >
            <Download className="h-4 w-4" />
            Baixar XMLs {selected.length > 0 && `(${selected.length})`}
          </Button>
        }
      />

      <div className="mb-4 space-y-1.5">
        <Label>Status</Label>
        <Select
          value={status ?? 'all'}
          onValueChange={(v) => {
            setStatus(v === 'all' ? undefined : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {FISCAL_DOCUMENT_STATUS_PRESENTATION[s]?.label ?? s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading || !data ? (
        <div className="rounded-lg border border-border">
          <TableSkeleton />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState icon={FileText} title="Nenhum documento fiscal encontrado" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead>Pedido</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>NF-e</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>XML</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell>
                  <Checkbox checked={selected.includes(doc.id)} onCheckedChange={() => toggle(doc.id)} />
                </TableCell>
                <TableCell>{doc.customerName ?? doc.orderId?.slice(0, 8) ?? '—'}</TableCell>
                <TableCell>{doc.type}</TableCell>
                <TableCell>{doc.number ?? '—'}</TableCell>
                <TableCell>{formatDate(doc.issueDate)}</TableCell>
                <TableCell>
                  <StatusBadge status={doc.status} map={FISCAL_DOCUMENT_STATUS_PRESENTATION} />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => downloadXml.mutate(doc.id)}>
                    <Download className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {data && data.totalPages > 1 && (
        <PaginationBar page={data.page} totalPages={data.totalPages} total={data.total} onPageChange={setPage} />
      )}
    </div>
  );
}
