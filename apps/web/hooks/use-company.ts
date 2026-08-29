'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@/components/ui/use-toast';

export interface Company {
  id: string;
  name: string;
  legalName: string | null;
  cnpj: string | null;
  timezone: string;
  currency: string;
  slowMovingDays: number;
  restockCoverageDays: number;
  /** Seção 56 da Fase 4 — desligado por padrão; só some ADMIN pode ligar. Some ao gate global
   * `TIKTOK_INVENTORY_PUSH_ENABLED` (o outbox só envia de fato com os dois ligados). */
  inventoryAutoSyncEnabled: boolean;
}

export function useCompany() {
  return useQuery({ queryKey: ['company'], queryFn: () => apiFetch<Company>('/company') });
}

export function useUpdateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Partial<
        Pick<
          Company,
          | 'name'
          | 'legalName'
          | 'cnpj'
          | 'timezone'
          | 'currency'
          | 'slowMovingDays'
          | 'restockCoverageDays'
          | 'inventoryAutoSyncEnabled'
        >
      >,
    ) => apiFetch<Company>('/company', { method: 'PATCH', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company'] });
      toast({ title: 'Dados da empresa atualizados.' });
    },
    onError: (error) =>
      toast({
        title: 'Não foi possível atualizar a empresa',
        description: error instanceof ApiError ? error.message : undefined,
        variant: 'destructive',
      }),
  });
}
