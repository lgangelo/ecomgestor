'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@/components/ui/use-toast';

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  productCount: number;
}

export function useCategories(search?: string) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  return useQuery({
    queryKey: ['categories', search ?? ''],
    queryFn: () => apiFetch<Category[]>(`/categories?${params.toString()}`),
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; parentId?: string }) =>
      apiFetch<Category>('/categories', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast({ title: 'Categoria criada com sucesso.' });
    },
    onError: (error) => {
      toast({
        title: 'Não foi possível criar a categoria',
        description: error instanceof ApiError ? error.message : undefined,
        variant: 'destructive',
      });
    },
  });
}
