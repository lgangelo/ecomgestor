'use client';

import * as React from 'react';
import { DollarSign, Percent, Receipt, ShoppingBag, TrendingUp, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBRL } from '@ecommerce-manager/shared';
import { useDashboard } from '@/hooks/use-reports';
import { PeriodFilterBar, type PeriodFilterValue } from './period-filter-bar';
import { AlertsPanel } from './alerts-panel';
import {
  MarginByProductTable,
  RevenueByPeriodChart,
  SalesByChannelChart,
  SalesByDayChart,
  TopProductsTable,
} from './dashboard-charts';

function defaultPeriod(): PeriodFilterValue {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return {
    dateFrom: start.toISOString().slice(0, 10),
    dateTo: end.toISOString().slice(0, 10),
    compare: false,
  };
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
      <PeriodFilterBar value={filters} onChange={setFilters} />

      {isLoading || !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
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
              title="Margem"
              value={`${data.cards.margin.toFixed(1)}%`}
              icon={Percent}
              trend={trendFor(data.cards.margin, data.previous?.margin)}
            />
            <StatCard title="A receber" value={formatBRL(data.cards.receivable)} icon={Wallet} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RevenueByPeriodChart data={data.charts.revenueByPeriod} />
            <SalesByDayChart data={data.charts.salesByDay} />
            <SalesByChannelChart data={data.charts.salesByChannel} />
            <AlertsPanel alerts={data.alerts} />
            <TopProductsTable data={data.charts.topProducts} />
            <MarginByProductTable data={data.charts.marginByProduct} />
          </div>
        </>
      )}
    </div>
  );
}
