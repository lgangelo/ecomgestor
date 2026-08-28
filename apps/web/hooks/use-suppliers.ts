'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@/components/ui/use-toast';

export interface Supplier {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
}

export function useSuppliers() {
  return useQuery({ queryKey: ['suppliers'], queryFn: () => apiFetch<Supplier[]>('/suppliers') });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; document?: string; email?: string; phone?: string }) =>
      apiFetch<Supplier>('/suppliers', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast({ title: 'Fornecedor criado com sucesso.' });
    },
    onError: (error) =>
      toast({
        title: 'Não foi possível criar o fornecedor',
        description: error instanceof ApiError ? error.message : undefined,
        variant: 'destructive',
      }),
  });
}
