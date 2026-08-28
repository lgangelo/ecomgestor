'use client';

import { Plus, Users as UsersIcon } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import { useUpdateUser, useUsers, type UserListItem } from '@/hooks/use-users';
import { UserFormDialog } from './user-form-dialog';

function UserRow({ user }: { user: UserListItem }) {
  const updateUser = useUpdateUser(user.id);
  return (
    <TableRow>
      <TableCell className="font-medium">{user.name}</TableCell>
      <TableCell>{user.email}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {user.roles.map((r) => (
            <Badge key={r.id} tone="info">
              {r.name}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell>{formatDate(user.lastLoginAt, true)}</TableCell>
      <TableCell>
        <Switch checked={user.isActive} onCheckedChange={(v) => updateUser.mutate({ isActive: v })} />
      </TableCell>
    </TableRow>
  );
}

export function UsersView() {
  const { data, isLoading } = useUsers();

  return (
    <div>
      <PageHeader
        title="Usuários"
        description="Usuários com acesso ao sistema."
        actions={
          <UserFormDialog
            trigger={
              <Button>
                <Plus className="h-4 w-4" />
                Novo usuário
              </Button>
            }
          />
        }
      />

      {isLoading || !data ? (
        <div className="rounded-lg border border-border">
          <TableSkeleton />
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={UsersIcon} title="Nenhum usuário cadastrado" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Perfis</TableHead>
              <TableHead>Último acesso</TableHead>
              <TableHead>Ativo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((user) => (
              <UserRow key={user.id} user={user} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
