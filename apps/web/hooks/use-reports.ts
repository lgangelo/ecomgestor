'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

export interface DashboardCards {
  revenue: number;
  netRevenue: number;
  orders: number;
  averageTicket: number;
  estimatedProfit: number;
  margin: number;
  receivable: number;
}

/** Item de "Precisa da sua atenção" (seção 63 da Fase 4) — só chega quando count > 0. */
export interface AttentionItem {
  key: string;
  label: string;
  count: number;
  link: string;
}

export interface DashboardResponse {
  cards: DashboardCards;
  previous?: DashboardCards;
  charts: {
    revenueByPeriod: Array<{ date: string; total: number; result: number }>;
    salesByDay: Array<{ date: string; orders: number }>;
    salesByChannel: Array<{
      channelName: string;
      total: number;
      orders: number;
      averageTicket: number;
      profit: number;
      marginPercent: number;
      share: number;
    }>;
    products: Array<{ productName: string; quantity: number; revenue: number; profit: number; marginPercent: number }>;
    topProducts: Array<{ productName: string; quantity: number; revenue: number }>;
    marginByProduct: Array<{ productName: string; marginPercent: number }>;
  };
  alerts: {
    belowMinimumStock: Array<{ sku: string; productName: string; available: number; minStock: number }>;
    cancelledOrders: number;
    salesWithoutFiscalDocument: number;
    integrationDelayed: boolean;
  };
  attention: AttentionItem[];
}

export interface DashboardFilters {
  dateFrom?: string;
  dateTo?: string;
  channelId?: string;
  compare?: 'previous_period';
}

export function useDashboard(filters: DashboardFilters) {
  const query = buildQueryString(filters);
  return useQuery({
    queryKey: ['dashboard', filters],
    queryFn: () => apiFetch<DashboardResponse>(`/reports/dashboard${query}`),
  });
}
