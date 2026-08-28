'use client';

import * as React from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboard } from '@/hooks/use-reports';
import { PeriodFilterBar, type PeriodFilterValue } from '@/components/dashboard/period-filter-bar';
import {
  MarginByProductTable,
  RevenueByPeriodChart,
  SalesByChannelChart,
  SalesByDayChart,
  TopProductsTable,
} from '@/components/dashboard/dashboard-charts';
import { AlertsPanel } from '@/components/dashboard/alerts-panel';

function defaultPeriod(): PeriodFilterValue {
  const end = new Date();
  const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
  return {
    dateFrom: start.toISOString().slice(0, 10),
    dateTo: end.toISOString().slice(0, 10),
    compare: false,
  };
}

export function ReportsView() {
  const [filters, setFilters] = React.useState<PeriodFilterValue>(defaultPeriod);
  const { data, isLoading } = useDashboard({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    channelId: filters.channelId,
  });

  return (
    <div>
      <PageHeader title="Relatórios" description="Visão detalhada de vendas, produtos e margem." />
      <PeriodFilterBar value={filters} onChange={setFilters} />

      {isLoading || !data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RevenueByPeriodChart data={data.charts.revenueByPeriod} />
          <SalesByDayChart data={data.charts.salesByDay} />
          <SalesByChannelChart data={data.charts.salesByChannel} />
          <AlertsPanel alerts={data.alerts} />
          <TopProductsTable data={data.charts.topProducts} />
          <MarginByProductTable data={data.charts.marginByProduct} />
        </div>
      )}
    </div>
  );
}
