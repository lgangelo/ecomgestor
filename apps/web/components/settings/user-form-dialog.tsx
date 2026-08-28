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
import { useCreateUser } from '@/hooks/use-users';

export function UserFormDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const { data: roles } = useRoles();
  const createUser = useCreateUser();
  const [generatedPassword, setGeneratedPassword] = React.useState<string | null>(null);

  const [form, setForm] = React.useState({ name: '', email: '', roleIds: [] as string[] });

  function toggleRole(roleId: string) {
    setForm((f) => ({
      ...f,
      roleIds: f.roleIds.includes(roleId) ? f.roleIds.filter((id) => id !== roleId) : [...f.roleIds, roleId],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = await createUser.mutateAsync(form);
    if (result.generatedPassword) setGeneratedPassword(result.generatedPassword);
    setForm({ name: '', email: '', roleIds: [] });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setGeneratedPassword(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
        </DialogHeader>

        {generatedPassword ? (
          <div className="space-y-4">
            <p className="text-sm">
              Usuário criado. Copie a senha gerada abaixo agora — ela não será exibida novamente.
            </p>
            <div className="rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm">
              {generatedPassword}
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Concluir</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
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
              <Button type="submit" disabled={form.roleIds.length === 0 || createUser.isPending}>
                {createUser.isPending ? 'Criando...' : 'Criar usuário'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
