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
}

export function useCompany() {
  return useQuery({ queryKey: ['company'], queryFn: () => apiFetch<Company>('/company') });
}

export function useUpdateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Pick<Company, 'name' | 'legalName' | 'cnpj' | 'timezone'>>) =>
      apiFetch<Company>('/company', { method: 'PATCH', body: data }),
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
