'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface SalesChannel {
  id: string;
  name: string;
  type: string;
  isManual: boolean;
  isActive: boolean;
}

export function useChannels() {
  return useQuery({ queryKey: ['channels'], queryFn: () => apiFetch<SalesChannel[]>('/channels') });
}
