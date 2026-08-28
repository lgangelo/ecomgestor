'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type { Paginated } from '@/lib/types/pagination';

export interface AuditLogItem {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  ip: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
  oldValue: unknown;
  newValue: unknown;
}

export function useAuditLogs(filters: {
  entity?: string;
  action?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}) {
  const query = buildQueryString({ page: filters.page ?? 1, pageSize: filters.pageSize ?? 20, ...filters });
  return useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => apiFetch<Paginated<AuditLogItem>>(`/audit-logs${query}`),
  });
}
