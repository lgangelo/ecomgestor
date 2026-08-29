'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useRoles } from '@/hooks/use-roles';
import { useUpdateUser, type UserListItem } from '@/hooks/use-users';

export function UserEditDialog({ user, trigger }: { user: UserListItem; trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const { data: roles } = useRoles();
  const updateUser = useUpdateUser(user.id);

  const [form, setForm] = React.useState({ name: user.name, roleIds: user.roles.map((r) => r.id) });

  React.useEffect(() => {
    if (open) setForm({ name: user.name, roleIds: user.roles.map((r) => r.id) });
  }, [open, user]);

  function toggleRole(roleId: string) {
    setForm((f) => ({
      ...f,
      roleIds: f.roleIds.includes(roleId) ? f.roleIds.filter((id) => id !== roleId) : [...f.roleIds, roleId],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await updateUser.mutateAsync({ name: form.name, roleIds: form.roleIds });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Nome</Label>
            <Input
              id="edit-name"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <div className="space-y-2">
            <Label>Perfis (roles)</Label>
            {roles?.map((role) => (
              <label key={role.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.roleIds.includes(role.id)} onCheckedChange={() => toggleRole(role.id)} />
                {role.name}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={form.roleIds.length === 0 || updateUser.isPending}>
              {updateUser.isPending ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
