'use client';

import { Check } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useRoles } from '@/hooks/use-roles';

export function PermissionsView() {
  const { data: roles, isLoading } = useRoles();

  if (isLoading || !roles) return <Skeleton className="h-96" />;

  const allPermissions = Array.from(new Set(roles.flatMap((r) => r.permissions))).sort();

  return (
    <div>
      <PageHeader title="Permissões" description="Matriz de permissões por perfil (role)." />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Permissão</TableHead>
            {roles.map((role) => (
              <TableHead key={role.id} className="text-center">
                {role.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {allPermissions.map((permission) => (
            <TableRow key={permission}>
              <TableCell className="font-mono text-xs">{permission}</TableCell>
              {roles.map((role) => (
                <TableCell key={role.id} className="text-center">
                  {role.permissions.includes(permission) && (
                    <Check className="mx-auto h-4 w-4 text-success" />
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
