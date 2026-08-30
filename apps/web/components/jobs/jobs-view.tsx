'use client';

import * as React from 'react';
import { Layers } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { SYNC_JOB_STATUS_PRESENTATION } from '@ecommerce-manager/ui';
import { formatDate } from '@/lib/format';
import { useJobs, useRetryJob, type JobListItem } from '@/hooks/use-jobs';
import { useUrlFilters } from '@/hooks/use-url-filters';

// Um valor de resultado pode ser um objeto aninhado (ex.: `linkedSync: { updated, failed, ... }`
// dentro do resultado de tiktok-import-products) — `${value}` nesse caso vira "[object Object]",
// escondendo justamente o dado que se precisa ler para diagnosticar. Serializa como JSON em vez
// de deixar o JS converter sozinho.
function formatResultValue(value: unknown): string {
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const JOB_TYPES = [
  'tiktok-import-orders',
  'tiktok-import-products',
  'tiktok-sync-finance',
  'tiktok-sync-returns',
  'tiktok-push-inventory',
  'tiktok-process-webhook',
];

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// Filtros e paginação persistem na URL (seção 57 da Fase 4 — item deixado para quando a tela de
// Jobs existisse; agora existe).
const DEFAULT_FILTERS = { page: 1, status: '', type: '', dateFrom: '', dateTo: '' };

function JobRow({ job }: { job: JobListItem }) {
  const [expanded, setExpanded] = React.useState(false);
  const retryJob = useRetryJob();

  return (
    <React.Fragment>
      <TableRow className="cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <TableCell>{job.queue}</TableCell>
        <TableCell className="font-medium">{job.type}</TableCell>
        <TableCell>
          <StatusBadge status={job.status} map={SYNC_JOB_STATUS_PRESENTATION} />
        </TableCell>
        <TableCell>{formatDate(job.createdAt, true)}</TableCell>
        <TableCell>{formatDate(job.startedAt, true)}</TableCell>
        <TableCell>{formatDate(job.finishedAt, true)}</TableCell>
        <TableCell>
          {job.attempts}/{job.maxAttempts}
        </TableCell>
        <TableCell>{formatDuration(job.durationMs)}</TableCell>
        <TableCell>
          {job.status === 'FAILED' && (
            <Button
              size="sm"
              variant="outline"
              disabled={retryJob.isPending}
              onClick={(e) => {
                e.stopPropagation();
                retryJob.mutate(job.id);
              }}
            >
              Tentar novamente
            </Button>
          )}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={9} className="bg-muted/30 text-sm">
            <div className="grid gap-2 p-2 sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Job ID:</span> {job.id}
              </p>
              <p>
                <span className="text-muted-foreground">Referência externa:</span>{' '}
                {job.relatedExternalId ?? '—'}
              </p>
              <p>
                <span className="text-muted-foreground">Categoria do erro:</span>{' '}
                {job.errorCategory ?? '—'}
              </p>
              <p className="sm:col-span-2">
                <span className="text-muted-foreground">Erro:</span> {job.error ?? '—'}
              </p>
              {job.result && (
                <p className="sm:col-span-2">
                  <span className="text-muted-foreground">Resultado:</span>{' '}
                  {Object.entries(job.result)
                    .map(([key, value]) => `${key}: ${formatResultValue(value)}`)
                    .join(' · ')}
                </p>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </React.Fragment>
  );
}

/** Painel de jobs (seções 45-48 da Fase 4) — nunca mostra payload/token (seção 47); reaproveita
 * `SyncJob` (Fase 3) sem mudança de schema. */
export function JobsView() {
  const [filters, setFilters] = useUrlFilters(DEFAULT_FILTERS);
  const { data, isLoading } = useJobs({
    page: filters.page,
    pageSize: 20,
    status: filters.status || undefined,
    type: filters.type || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
  });

  return (
    <div>
      <PageHeader title="Jobs" description="Acompanhamento das sincronizações e integrações em segundo plano." />

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={filters.status || 'all'} onValueChange={(v) => setFilters({ status: v === 'all' ? undefined : v, page: 1 })}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(SYNC_JOB_STATUS_PRESENTATION).map(([value, presentation]) => (
                <SelectItem key={value} value={value}>
                  {presentation.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select value={filters.type || 'all'} onValueChange={(v) => setFilters({ type: v === 'all' ? undefined : v, page: 1 })}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {JOB_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dateFrom">De</Label>
          <Input
            id="dateFrom"
            type="date"
            className="w-40"
            value={filters.dateFrom}
            onChange={(e) => setFilters({ dateFrom: e.target.value, page: 1 })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dateTo">Até</Label>
          <Input
            id="dateTo"
            type="date"
            className="w-40"
            value={filters.dateTo}
            onChange={(e) => setFilters({ dateTo: e.target.value, page: 1 })}
          />
        </div>
      </div>

      {isLoading || !data ? (
        <div className="rounded-lg border border-border">
          <TableSkeleton />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState icon={Layers} title="Nenhum job encontrado" description="Ajuste os filtros aplicados." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fila</TableHead>
              <TableHead>Job</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Criado</TableHead>
              <TableHead>Iniciado</TableHead>
              <TableHead>Finalizado</TableHead>
              <TableHead>Tentativas</TableHead>
              <TableHead>Duração</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((job) => (
              <JobRow key={job.id} job={job} />
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
