'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type { Paginated } from '@/lib/types/pagination';
import { toast } from '@/components/ui/use-toast';

export interface ExpenseCategory {
  id: string;
  name: string;
}

export interface ExpenseListItem {
  id: string;
  categoryName: string;
  description: string;
  amount: string;
  date: string;
  competenceDate: string;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  isRecurring: boolean;
  paymentMethod: string | null;
}

export interface TaxConfiguration {
  id: string;
  taxRegime: string;
  estimatedRate: string;
  validFrom: string;
  validTo: string | null;
}

export interface RecurringExpenseTemplate {
  id: string;
  description: string;
  amount: string;
  dayOfMonth: number;
  isActive: boolean;
  paymentMethod: string | null;
  category: { name: string };
}

export interface FinanceOverview {
  grossRevenue: number;
  discounts: number;
  returnsAmount: number;
  netRevenue: number;
  cmv: number;
  grossProfit: number;
  fees: number;
  marketing: number;
  packaging: number;
  otherExpenses: number;
  estimatedTaxes: number;
  managementResult: number;
  disclaimer: string;
}

export interface MonthlyClosing extends Omit<FinanceOverview, 'disclaimer'> {
  id: string;
  referenceMonth: string;
  status: 'OPEN' | 'CLOSED';
  closedAt: string | null;
}

export interface FeeListItem {
  id: string;
  channelName: string;
  orderId: string | null;
  feeType: string;
  amount: string;
  createdAt: string;
}

function onErrorToast(title: string) {
  return (error: unknown) =>
    toast({ title, description: error instanceof ApiError ? error.message : undefined, variant: 'destructive' });
}

export function useExpenseCategories() {
  return useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => apiFetch<ExpenseCategory[]>('/finance/expense-categories'),
  });
}

export function useCreateExpenseCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) =>
      apiFetch<ExpenseCategory>('/finance/expense-categories', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      toast({ title: 'Categoria de despesa criada.' });
    },
    onError: onErrorToast('Não foi possível criar a categoria'),
  });
}

export function useExpenses(filters: { dateFrom?: string; dateTo?: string; categoryId?: string; page?: number; pageSize?: number }) {
  const query = buildQueryString({ page: filters.page ?? 1, pageSize: filters.pageSize ?? 20, ...filters });
  return useQuery({
    queryKey: ['expenses', filters],
    queryFn: () => apiFetch<Paginated<ExpenseListItem>>(`/finance/expenses${query}`),
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      categoryId: string;
      description: string;
      amount: number;
      date: string;
      competenceDate?: string;
      status?: 'PENDING' | 'PAID' | 'CANCELLED';
      paymentMethod?: string;
    }) => apiFetch<ExpenseListItem>('/finance/expenses', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['finance-overview'] });
      toast({ title: 'Despesa registrada.' });
    },
    onError: onErrorToast('Não foi possível registrar a despesa'),
  });
}

export function useFinanceOverview(filters: { dateFrom?: string; dateTo?: string }) {
  const query = buildQueryString(filters);
  return useQuery({
    queryKey: ['finance-overview', filters],
    queryFn: () => apiFetch<FinanceOverview>(`/finance/overview${query}`),
  });
}

export function useFees(filters: { dateFrom?: string; dateTo?: string; channelId?: string; page?: number; pageSize?: number }) {
  const query = buildQueryString({ page: filters.page ?? 1, pageSize: filters.pageSize ?? 20, ...filters });
  return useQuery({
    queryKey: ['fees', filters],
    queryFn: () => apiFetch<Paginated<FeeListItem>>(`/finance/fees${query}`),
  });
}

export function useMonthlyClosings() {
  return useQuery({
    queryKey: ['monthly-closings'],
    queryFn: () => apiFetch<MonthlyClosing[]>('/finance/monthly-closings'),
  });
}

export function useMonthlyClosing(id: string | undefined) {
  return useQuery({
    queryKey: ['monthly-closings', id],
    queryFn: () => apiFetch<MonthlyClosing>(`/finance/monthly-closings/${id}`),
    enabled: Boolean(id),
  });
}

export function useCloseMonth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (referenceMonth: string) =>
      apiFetch<MonthlyClosing>(`/finance/monthly-closings/${referenceMonth}/close`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly-closings'] });
      toast({ title: 'Mês fechado com sucesso.' });
    },
    onError: onErrorToast('Não foi possível fechar o mês'),
  });
}

export function useReopenClosing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch<MonthlyClosing>(`/finance/monthly-closings/${id}/reopen`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly-closings'] });
      toast({ title: 'Período reaberto.' });
    },
    onError: onErrorToast('Não foi possível reabrir o período'),
  });
}

export function useTaxConfigurations() {
  return useQuery({
    queryKey: ['tax-configurations'],
    queryFn: () => apiFetch<TaxConfiguration[]>('/finance/tax-configurations'),
  });
}

export function useCreateTaxConfiguration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { taxRegime: string; estimatedRate: number; validFrom: string; validTo?: string }) =>
      apiFetch<TaxConfiguration>('/finance/tax-configurations', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-configurations'] });
      queryClient.invalidateQueries({ queryKey: ['finance-overview'] });
      toast({ title: 'Configuração de imposto criada.' });
    },
    onError: onErrorToast('Não foi possível criar a configuração'),
  });
}

export function useRecurringExpenses() {
  return useQuery({
    queryKey: ['recurring-expenses'],
    queryFn: () => apiFetch<RecurringExpenseTemplate[]>('/finance/recurring-expenses'),
  });
}

export function useCreateRecurringExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { categoryId: string; description: string; amount: number; dayOfMonth: number; paymentMethod?: string }) =>
      apiFetch<RecurringExpenseTemplate>('/finance/recurring-expenses', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] });
      toast({ title: 'Despesa recorrente criada.' });
    },
    onError: onErrorToast('Não foi possível criar a despesa recorrente'),
  });
}

export function useSetRecurringExpenseActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch(`/finance/recurring-expenses/${id}`, { method: 'PATCH', body: { isActive } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] });
    },
    onError: onErrorToast('Não foi possível atualizar a despesa recorrente'),
  });
}
