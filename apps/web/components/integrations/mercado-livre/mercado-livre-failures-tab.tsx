'use client';

import * as React from 'react';
import { AlertOctagon } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import {
  useMercadoLivreFailedJobs,
  useRetryMercadoLivreJob,
  useFixMercadoLivreColorAndRetry,
  type MercadoLivreFailedJob,
} from '@/hooks/use-mercado-livre';

const JOB_LABELS: Record<string, string> = {
  'mercadolivre-import-orders': 'Importação de pedidos',
  'mercadolivre-reconcile-orders': 'Reconciliação de pedidos',
  'mercadolivre-publish-product-color': 'Publicação de produto',
};

const PUBLISH_COLOR_TYPE = 'mercadolivre-publish-product-color';

/** Falha de publicação de produto (pedido do usuário) — mostra o produto/SKU/cor de verdade
 * (não só o id da variante) e deixa corrigir a cor e reenviar direto aqui, sem abrir outra
 * tela. Falhas de outros tipos (importação/reconciliação de pedidos) continuam só com o botão
 * simples de "Tentar novamente", que já funcionava antes. */
function ProductColorFailureRow({ job }: { job: MercadoLivreFailedJob }) {
  const [color, setColor] = React.useState(job.color ?? '');
  const fixAndRetry = useFixMercadoLivreColorAndRetry();

  return (
    <TableRow>
      <TableCell>{JOB_LABELS[job.type] ?? job.type}</TableCell>
      <TableCell>
        <p className="font-medium">{job.productName ?? '—'}</p>
        <p className="text-xs text-muted-foreground">{job.sku ?? '—'}</p>
      </TableCell>
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
        <div className="flex items-center justify-end gap-2">
          <Input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="Cor"
            className="h-8 w-32"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={fixAndRetry.isPending || !job.variantId || !color.trim()}
            onClick={() => job.variantId && fixAndRetry.mutate({ jobId: job.id, variantId: job.variantId, color: color.trim() })}
          >
            Corrigir e reenviar
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

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
          <TableHead>Produto / Referência</TableHead>
          <TableHead>Data</TableHead>
          <TableHead>Tentativas</TableHead>
          <TableHead>Erro</TableHead>
          <TableHead className="text-right">Ação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((job) =>
          job.type === PUBLISH_COLOR_TYPE ? (
            <ProductColorFailureRow key={job.id} job={job} />
          ) : (
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
          ),
        )}
      </TableBody>
    </Table>
  );
}
