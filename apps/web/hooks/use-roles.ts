'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface RoleWithPermissions {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
}

export interface PermissionDefinition {
  key: string;
  description: string | null;
}

export function useRoles() {
  return useQuery({ queryKey: ['roles'], queryFn: () => apiFetch<RoleWithPermissions[]>('/roles') });
}

export function usePermissions() {
  return useQuery({ queryKey: ['permissions'], queryFn: () => apiFetch<PermissionDefinition[]>('/permissions') });
}
