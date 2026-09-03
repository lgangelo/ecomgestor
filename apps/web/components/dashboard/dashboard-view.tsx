'use client';

import * as React from 'react';
import { DollarSign, Percent, Receipt, ShoppingBag, TrendingUp, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBRL } from '@ecommerce-manager/shared';
import { useDashboard } from '@/hooks/use-reports';
import { computePeriodPreset } from '@/lib/period-presets';
import { PeriodFilterBar, type PeriodFilterValue } from './period-filter-bar';
import { AttentionSection } from './attention-section';
import { ProductsRankingTable, RevenueByPeriodChart, SalesByChannelChart } from './dashboard-charts';
import { OnboardingChecklist } from '@/components/onboarding/onboarding-checklist';

function defaultPeriod(): PeriodFilterValue {
  // Padrão é o mês vigente (não "últimos 30 dias") — o usuário troca pelo seletor de período se
  // quiser outra janela.
  return { ...computePeriodPreset('this_month')!, compare: false };
}

export function DashboardView() {
  const [filters, setFilters] = React.useState<PeriodFilterValue>(defaultPeriod);

  const { data, isLoading } = useDashboard({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    channelId: filters.channelId,
    compare: filters.compare ? 'previous_period' : undefined,
  });

  function trendFor(current: number, previous: number | undefined) {
    if (previous === undefined || previous === 0) return undefined;
    return { value: ((current - previous) / previous) * 100 };
  }

  return (
    <div>
      <PageHeader title="Dashboard" description="Visão geral das vendas, estoque e financeiro." />
      <OnboardingChecklist />
      <PeriodFilterBar value={filters} onChange={setFilters} />

      {isLoading || !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              title="Faturamento"
              value={formatBRL(data.cards.revenue)}
              icon={DollarSign}
              trend={trendFor(data.cards.revenue, data.previous?.revenue)}
            />
            <StatCard
              title="Receita líquida"
              value={formatBRL(data.cards.netRevenue)}
              icon={DollarSign}
              trend={trendFor(data.cards.netRevenue, data.previous?.netRevenue)}
            />
            <StatCard
              title="Pedidos"
              value={String(data.cards.orders)}
              icon={ShoppingBag}
              trend={trendFor(data.cards.orders, data.previous?.orders)}
            />
            <StatCard
              title="Ticket médio"
              value={formatBRL(data.cards.averageTicket)}
              icon={Receipt}
              trend={trendFor(data.cards.averageTicket, data.previous?.averageTicket)}
            />
            <StatCard
              title="Lucro estimado"
              value={formatBRL(data.cards.estimatedProfit)}
              icon={TrendingUp}
              trend={trendFor(data.cards.estimatedProfit, data.previous?.estimatedProfit)}
            />
            <StatCard
              title="Margem (sobre a venda)"
              value={`${data.cards.margin.toFixed(1)}%`}
              icon={Percent}
              trend={trendFor(data.cards.margin, data.previous?.margin)}
            />
            <StatCard
              title="Markup (sobre o custo)"
              value={data.cards.markup === null ? '—' : `${data.cards.markup.toFixed(1)}%`}
              icon={Percent}
              trend={
                data.cards.markup !== null && data.previous?.markup !== null
                  ? trendFor(data.cards.markup, data.previous?.markup)
                  : undefined
              }
            />
            <StatCard
              title="A receber"
              value={formatBRL(data.cards.receivable)}
              icon={Wallet}
              hint="Estimativa — pedidos ainda não entregues, já descontada a taxa média da plataforma"
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RevenueByPeriodChart data={data.charts.revenueByPeriod} />
            <AttentionSection items={data.attention} />
            <SalesByChannelChart data={data.charts.salesByChannel} />
            <ProductsRankingTable data={data.charts.products} />
          </div>
        </>
      )}
    </div>
  );
}
