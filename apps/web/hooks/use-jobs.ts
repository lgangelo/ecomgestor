'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type { Paginated } from '@/lib/types/pagination';
import { toast } from '@/components/ui/use-toast';

export interface JobListItem {
  id: string;
  queue: string;
  type: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  relatedExternalId: string | null;
  attempts: number;
  maxAttempts: number;
  errorCategory: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface JobFilters {
  status?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export function useJobs(filters: JobFilters) {
  const query = buildQueryString({ page: filters.page ?? 1, pageSize: filters.pageSize ?? 20, ...filters });
  return useQuery({
    queryKey: ['jobs', filters],
    queryFn: () => apiFetch<Paginated<JobListItem>>(`/jobs${query}`),
  });
}

export function useRetryJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<JobListItem>(`/jobs/${id}/retry`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast({ title: 'Job enviado para nova tentativa.' });
    },
    onError: (error) =>
      toast({
        title: 'Não foi possível reprocessar o job',
        description: error instanceof ApiError ? error.message : undefined,
        variant: 'destructive',
      }),
  });
}
