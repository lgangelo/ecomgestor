'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { useAttention } from '@/hooks/use-reports';

/** Tela de tarefas operacionais (pedido do usuário): a mesma lista de "Precisa da sua atenção"
 * do dashboard, só que numa página própria, maior e mais fácil de acessar — cada item é um
 * cartão clicável que já leva direto pra tela onde o problema se resolve.
 *
 * Pedido do usuário: mostra TODOS os checks, inclusive os que estão em dia (`count === 0`) — não
 * só as pendências. Um card "OK" (verde, ícone de check) confirma que aquele check rodou e não
 * achou nada; antes, count zero simplesmente sumia da tela, sem confirmar que o check existe. */
export function AttentionView() {
  const { data, isLoading } = useAttention();

  return (
    <div>
      <PageHeader
        title="Tarefas operacionais"
        description="Pendências que precisam da sua atenção — clique num item pra resolver."
      />

      {isLoading || !data ? (
        <div className="rounded-lg border border-border">
          <TableSkeleton />
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Nenhuma pendência no momento" description="Está tudo em dia." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((item) => {
            const ok = item.count === 0;
            return (
              <Link
                key={item.key}
                href={item.link}
                className={`flex items-center justify-between gap-3 rounded-lg border p-4 transition-colors hover:bg-muted ${
                  ok ? 'border-border/60 bg-card/60' : 'border-border bg-card'
                }`}
              >
                <div className="flex items-center gap-3">
                  {ok ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
                  )}
                  <div>
                    <p className={`text-2xl font-semibold leading-none ${ok ? 'text-muted-foreground' : ''}`}>{item.count}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.label}</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
