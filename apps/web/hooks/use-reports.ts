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
  markup: number | null;
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
      markupPercent: number | null;
      share: number;
    }>;
    products: Array<{
      productName: string;
      quantity: number;
      revenue: number;
      profit: number;
      marginPercent: number;
      markupPercent: number | null;
    }>;
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

/** Pedido do usuário: "tela de tarefas operacionais" — mesma lista de "Precisa da sua atenção",
 * numa página dedicada, sem depender de carregar todo o dashboard. Atualiza sozinha de tempos em
 * tempos, já que o usuário costuma deixar essa tela aberta enquanto resolve as pendências. */
export function useAttention() {
  return useQuery({
    queryKey: ['reports', 'attention'],
    queryFn: () => apiFetch<AttentionItem[]>('/reports/attention'),
    refetchInterval: 60_000,
  });
}
