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
import { useCreateSupplier, type Supplier } from '@/hooks/use-suppliers';

export function SupplierFormDialog({
  trigger,
  onCreated,
}: {
  trigger: React.ReactNode;
  onCreated?: (supplier: Supplier) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const createSupplier = useCreateSupplier();

  const [form, setForm] = React.useState({ name: '', document: '', email: '', phone: '' });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supplier = await createSupplier.mutateAsync({
      name: form.name,
      document: form.document || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
    });
    setOpen(false);
    setForm({ name: '', document: '', email: '', phone: '' });
    onCreated?.(supplier);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo fornecedor</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="supplier-name">Nome</Label>
            <Input
              id="supplier-name"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="supplier-document">CNPJ/CPF</Label>
              <Input
                id="supplier-document"
                value={form.document}
                onChange={(e) => setForm((f) => ({ ...f, document: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-phone">Telefone</Label>
              <Input
                id="supplier-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="supplier-email">E-mail</Label>
              <Input
                id="supplier-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createSupplier.isPending}>
              {createSupplier.isPending ? 'Salvando...' : 'Criar fornecedor'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
