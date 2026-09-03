'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@/components/ui/use-toast';

export interface CategoryFiscalProfile {
  id: string;
  categoryId: string;
  channelType: string;
  ncm: string;
  cest: string | null;
  exTipi: string | null;
  naturezaOperacao: string;
  cfopIntraestadual: string;
  cfopInterestadual: string;
  pisCofinsCode: string;
  origem: string;
  csosn: string;
  unidadeMedida: string;
  recopi: string | null;
  fichaConteudoImportacao: string | null;
  aliquotaAproximada: string | null;
  dadosAdicionais: string | null;
}

export type CategoryFiscalProfileInput = Omit<CategoryFiscalProfile, 'id' | 'categoryId'>;

export function useCategoryFiscalProfiles(categoryId: string, enabled = true) {
  return useQuery({
    queryKey: ['category-fiscal-profiles', categoryId],
    queryFn: () => apiFetch<CategoryFiscalProfile[]>(`/categories/${categoryId}/fiscal-profiles`),
    enabled,
  });
}

export function useUpsertCategoryFiscalProfile(categoryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CategoryFiscalProfileInput) =>
      apiFetch<CategoryFiscalProfile>(`/categories/${categoryId}/fiscal-profiles`, { method: 'PUT', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['category-fiscal-profiles', categoryId] });
      toast({ title: 'Dados fiscais salvos.' });
    },
    onError: (error) => {
      toast({
        title: 'Não foi possível salvar os dados fiscais',
        description: error instanceof ApiError ? error.message : undefined,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteCategoryFiscalProfile(categoryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (channelType: string) =>
      apiFetch<void>(`/categories/${categoryId}/fiscal-profiles/${channelType}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['category-fiscal-profiles', categoryId] });
      toast({ title: 'Dados fiscais removidos.' });
    },
    onError: (error) => {
      toast({
        title: 'Não foi possível remover os dados fiscais',
        description: error instanceof ApiError ? error.message : undefined,
        variant: 'destructive',
      });
    },
  });
}
