'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@/components/ui/use-toast';

export interface UserListItem {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  lastLoginAt: string | null;
  roles: Array<{ id: string; name: string }>;
}

export interface CreateUserResult extends UserListItem {
  generatedPassword?: string;
}

function onErrorToast(title: string) {
  return (error: unknown) =>
    toast({ title, description: error instanceof ApiError ? error.message : undefined, variant: 'destructive' });
}

export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: () => apiFetch<UserListItem[]>('/users') });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; email: string; password?: string; roleIds: string[] }) =>
      apiFetch<CreateUserResult>('/users', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: onErrorToast('Não foi possível criar o usuário'),
  });
}

export function useUpdateUser(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name?: string; isActive?: boolean; roleIds?: string[] }) =>
      apiFetch<UserListItem>(`/users/${id}`, { method: 'PATCH', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'Usuário atualizado.' });
    },
    onError: onErrorToast('Não foi possível atualizar o usuário'),
  });
}
