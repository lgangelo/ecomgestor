'use client';

import * as React from 'react';
import { ScrollText } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { useAuditLogs } from '@/hooks/use-audit';
import { AuditLogDetailDialog } from './audit-log-detail-dialog';

export function AuditView() {
  const [page, setPage] = React.useState(1);
  const [entity, setEntity] = React.useState('');
  const [action, setAction] = React.useState('');

  const { data, isLoading } = useAuditLogs({ page, pageSize: 30, entity, action });

  return (
    <div>
      <PageHeader title="Auditoria" description="Registro de ações realizadas no sistema." />

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="entity">Entidade</Label>
          <Input
            id="entity"
            className="w-44"
            placeholder="Ex: product, order"
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="action">Ação</Label>
          <Input
            id="action"
            className="w-44"
            placeholder="Ex: CREATE, UPDATE"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {isLoading || !data ? (
        <div className="rounded-lg border border-border">
          <TableSkeleton />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState icon={ScrollText} title="Nenhum registro de auditoria encontrado" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Entidade</TableHead>
              <TableHead>IP</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((log) => (
              <TableRow key={log.id}>
                <TableCell>{formatDate(log.createdAt, true)}</TableCell>
                <TableCell>{log.user?.name ?? '—'}</TableCell>
                <TableCell>{log.action}</TableCell>
                <TableCell>{log.entity}</TableCell>
                <TableCell>{log.ip ?? '—'}</TableCell>
                <TableCell>
                  <AuditLogDetailDialog log={log} trigger={<Button variant="ghost" size="sm">Ver detalhes</Button>} />
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
