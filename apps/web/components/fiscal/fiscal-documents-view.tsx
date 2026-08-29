'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Download, FileText, Link2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { FISCAL_DOCUMENT_STATUS_PRESENTATION } from '@ecommerce-manager/ui';
import { formatDate } from '@/lib/format';
import {
  useDownloadFiscalXml,
  useExportFiscalDocuments,
  useFiscalDocuments,
  useFiscalPending,
} from '@/hooks/use-fiscal';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { FiscalUploadDialog } from './upload-dialog';
import { AssociateFiscalDocumentDialog } from './associate-dialog';

const STATUSES = ['PENDING', 'ISSUED', 'CANCELLED', 'ERROR'];

// Filtro e paginação persistem na URL (seção 57 da Fase 4).
const DEFAULT_FILTERS = { page: 1, status: '' };

export function FiscalDocumentsView() {
  const [filters, setFilters] = useUrlFilters(DEFAULT_FILTERS);
  const [selected, setSelected] = React.useState<string[]>([]);

  const { data, isLoading } = useFiscalDocuments({ page: filters.page, pageSize: 20, status: filters.status || undefined });
  const { data: pending } = useFiscalPending();
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
          <div className="flex gap-2">
            <FiscalUploadDialog trigger={<Button variant="outline">Enviar XML</Button>} />
            <Button
              disabled={selected.length === 0 || exportDocuments.isPending}
              onClick={() => exportDocuments.mutate(selected)}
            >
              <Download className="h-4 w-4" />
              Baixar XMLs {selected.length > 0 && `(${selected.length})`}
            </Button>
          </div>
        }
      />

      {pending && (pending.salesWithoutInvoice.length > 0 || pending.returnsWithoutDocument.length > 0) && (
        <Card className="mb-6 border-warning/40">
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <CardTitle>Pendências fiscais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            {pending.salesWithoutInvoice.length > 0 && (
              <p>
                <Badge tone="warning" className="mr-2">
                  {pending.salesWithoutInvoice.length}
                </Badge>
                venda(s) sem NF-e —{' '}
                {pending.salesWithoutInvoice.slice(0, 3).map((o, i) => (
                  <React.Fragment key={o.orderId}>
                    {i > 0 && ', '}
                    <Link href={`/vendas/pedidos/${o.orderId}`} className="underline">
                      {o.customerName ?? o.orderId.slice(0, 8)}
                    </Link>
                  </React.Fragment>
                ))}
              </p>
            )}
            {pending.returnsWithoutDocument.length > 0 && (
              <p>
                <Badge tone="warning" className="mr-2">
                  {pending.returnsWithoutDocument.length}
                </Badge>
                devolução(ões) sem documento —{' '}
                {pending.returnsWithoutDocument.slice(0, 3).map((r, i) => (
                  <React.Fragment key={r.id}>
                    {i > 0 && ', '}
                    <Link href={`/vendas/pedidos/${r.orderId}`} className="underline">
                      {r.customerName ?? r.orderId.slice(0, 8)}
                    </Link>
                  </React.Fragment>
                ))}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="mb-4 space-y-1.5">
        <Label>Status</Label>
        <Select
          value={filters.status || 'all'}
          onValueChange={(v) => setFilters({ status: v === 'all' ? undefined : v, page: 1 })}
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
              <TableHead>Origem</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ações</TableHead>
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
                <TableCell>
                  <Badge tone={doc.sourceType === 'UPLOADED' ? 'info' : 'muted'}>
                    {doc.sourceType === 'UPLOADED' ? 'Enviado' : 'Gerado'}
                  </Badge>
                </TableCell>
                <TableCell>{formatDate(doc.issueDate)}</TableCell>
                <TableCell>
                  <StatusBadge status={doc.status} map={FISCAL_DOCUMENT_STATUS_PRESENTATION} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => downloadXml.mutate(doc.id)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    {!doc.orderId && (
                      <AssociateFiscalDocumentDialog
                        documentId={doc.id}
                        trigger={
                          <Button variant="ghost" size="sm">
                            <Link2 className="h-4 w-4" />
                          </Button>
                        }
                      />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {data && data.totalPages > 1 && (
        <PaginationBar
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          onPageChange={(page) => setFilters({ page })}
        />
      )}
    </div>
  );
}
