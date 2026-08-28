'use client';

import * as React from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useFinanceOverview } from '@/hooks/use-finance';
import { FinancePeriodFilter, defaultMonthRange } from './finance-period-filter';
import { DreBreakdown } from './dre-breakdown';

export function OverviewView() {
  const [range, setRange] = React.useState(defaultMonthRange);
  const { data, isLoading } = useFinanceOverview(range);

  return (
    <div>
      <PageHeader title="Visão geral" description="Resultado gerencial estimado do período." />
      <FinancePeriodFilter value={range} onChange={setRange} />
      {isLoading || !data ? <Skeleton className="h-96" /> : <DreBreakdown data={data} />}
    </div>
  );
}
