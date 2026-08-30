'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type { Paginated } from '@/lib/types/pagination';
import { toast } from '@/components/ui/use-toast';

export interface OrderListItem {
  id: string;
  orderDate: string;
  externalOrderId: string | null;
  channelName: string;
  customerName: string | null;
  total: string;
  status: string;
  integrationSyncStatus: 'OK' | 'REQUIRES_MAPPING' | 'ERROR';
}

export interface OrderItemDetail {
  id: string;
  variantId: string | null;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  sellerDiscount: string;
  platformDiscount: string;
  shippingRevenue: string;
  shippingCost: string;
  marketplaceFee: string;
  unitCost: string;
  listPrice: number;
  lineTotal: number;
}

export interface OrderDetail {
  id: string;
  channel: { id: string; name: string; type: string };
  externalOrderId: string | null;
  externalStatus: string | null;
  integrationSyncStatus: 'OK' | 'REQUIRES_MAPPING' | 'ERROR';
  integrationIssue: string | null;
  customerName: string | null;
  customerDocument: string | null;
  status: string;
  orderDate: string;
  subtotal: string;
  discount: string;
  shipping: string;
  total: string;
  paymentMethod: string | null;
  notes: string | null;
  items: OrderItemDetail[];
  payments: Array<{ id: string; method: string; amount: string; status: string; paidAt: string | null }>;
  statusHistory: Array<{ id: string; status: string; changedAt: string; changedBy: string | null; note: string | null }>;
  fiscalDocuments: Array<{ id: string; type: string; number: string | null; status: string }>;
  cmv: number;
  marketplaceFeesTotal: number;
  estimatedProfit: number;
  marginPercent: number;
}

export interface OrderFilters {
  page?: number;
  pageSize?: number;
  dateFrom?: string;
  dateTo?: string;
  channelId?: string;
  status?: string;
  syncStatus?: string;
  productId?: string;
  customerName?: string;
  externalOrderId?: string;
  hasFiscalDocument?: boolean;
}

export function useOrders(filters: OrderFilters) {
  const query = buildQueryString({ page: filters.page ?? 1, pageSize: filters.pageSize ?? 20, ...filters });
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: () => apiFetch<Paginated<OrderListItem>>(`/orders${query}`),
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: () => apiFetch<OrderDetail>(`/orders/${id}`),
    enabled: Boolean(id),
  });
}

function onErrorToast(title: string) {
  return (error: unknown) =>
    toast({ title, description: error instanceof ApiError ? error.message : undefined, variant: 'destructive' });
}

/** Ação manual explícita (pedido do usuário) — recalcula unitCost de todos os itens de pedido a
 * partir do custo ATUAL, para quando o custo só foi cadastrado depois de produtos/pedidos já
 * importados. Nunca roda sozinha. */
export function useRecalculateOrderCosts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ checked: number; updated: number }>('/orders/recalculate-costs', { method: 'POST' }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({ title: `${result.updated} item(ns) de pedido atualizado(s) de ${result.checked} verificado(s).` });
    },
    onError: onErrorToast('Não foi possível recalcular os custos'),
  });
}

export function useUpdateOrderStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { status: string; note?: string }) =>
      apiFetch(`/orders/${id}/status`, { method: 'PATCH', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({ title: 'Status do pedido atualizado.' });
    },
    onError: onErrorToast('Não foi possível atualizar o status'),
  });
}

export function useCreateManualOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      channelType: string;
      customerName: string;
      orderDate: string;
      items: Array<{ variantId: string; quantity: number; unitPrice: number; discount?: number }>;
      shipping?: number;
      paymentMethod?: string;
      status?: string;
      notes?: string;
      skipStockMovement?: boolean;
    }) => apiFetch<OrderDetail>('/orders/manual', { method: 'POST', body: data }),
    onSuccess: (order, variables) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      // Feedback específico (seção 60 da Fase 4) — nunca um "Sucesso" genérico.
      toast({
        title: 'Venda registrada.',
        description: variables.skipStockMovement
          ? `Pedido ${order.externalOrderId ?? order.id.slice(0, 8)} — sem movimentação de estoque.`
          : `Pedido ${order.externalOrderId ?? order.id.slice(0, 8)} — estoque reservado.`,
      });
    },
    onError: onErrorToast('Não foi possível registrar a venda'),
  });
}
