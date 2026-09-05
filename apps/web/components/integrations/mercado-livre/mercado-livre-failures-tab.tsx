'use client';

import { AlertOctagon } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { useMercadoLivreFailedJobs, useRetryMercadoLivreJob } from '@/hooks/use-mercado-livre';

const JOB_LABELS: Record<string, string> = {
  'mercadolivre-import-orders': 'Importação de pedidos',
  'mercadolivre-reconcile-orders': 'Reconciliação de pedidos',
};

export function MercadoLivreFailuresTab() {
  const { data, isLoading } = useMercadoLivreFailedJobs();
  const retry = useRetryMercadoLivreJob();

  if (isLoading || !data) {
    return (
      <div className="rounded-lg border border-border">
        <TableSkeleton />
      </div>
    );
  }

  if (data.length === 0) {
    return <EmptyState icon={AlertOctagon} title="Nenhuma falha pendente" />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tipo</TableHead>
          <TableHead>Referência</TableHead>
          <TableHead>Data</TableHead>
          <TableHead>Tentativas</TableHead>
          <TableHead>Erro</TableHead>
          <TableHead className="text-right">Ação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((job) => (
          <TableRow key={job.id}>
            <TableCell>{JOB_LABELS[job.type] ?? job.type}</TableCell>
            <TableCell>{job.relatedExternalId ?? '—'}</TableCell>
            <TableCell>{formatDate(job.createdAt, true)}</TableCell>
            <TableCell>
              {job.attempts}/{job.maxAttempts}
              {job.errorCategory && (
                <Badge tone="muted" className="ml-2">
                  {job.errorCategory}
                </Badge>
              )}
            </TableCell>
            <TableCell className="max-w-xs truncate text-sm text-muted-foreground" title={job.error ?? ''}>
              {job.error ?? '—'}
            </TableCell>
            <TableCell className="text-right">
              <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => retry.mutate(job.id)}>
                Tentar novamente
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
