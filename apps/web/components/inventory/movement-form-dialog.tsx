'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateMovement } from '@/hooks/use-inventory';
import { VariantPickerDialog, type PickedVariant } from '@/components/shared/variant-picker-dialog';

const MOVEMENT_TYPES = [
  { value: 'ADJUSTMENT', label: 'Ajuste (pode ser positivo ou negativo)' },
  { value: 'DAMAGE', label: 'Avaria' },
  { value: 'LOSS', label: 'Perda' },
  { value: 'RESERVATION', label: 'Reserva' },
  { value: 'RELEASE', label: 'Liberação de reserva' },
];

export function MovementFormDialog({
  variantId,
  sku,
  trigger,
}: {
  variantId?: string;
  sku?: string;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = React.useState(false);
  const createMovement = useCreateMovement();
  // Preenchido só quando o diálogo é aberto sem `variantId`/`sku` já definidos (botão global
  // "Novo ajuste") — o usuário busca por nome ou SKU e escolhe a variação, nunca digita o ID
  // interno (UUID) na mão. Achado real: o campo antigo aceitava texto livre rotulado "SKU", mas
  // enviava esse texto direto como `variantId` pro backend — sempre falhava com erro de UUID
  // inválido pra qualquer SKU real digitado.
  const [picked, setPicked] = React.useState<PickedVariant | null>(null);

  const [form, setForm] = React.useState({
    type: 'ADJUSTMENT',
    quantity: '',
    reason: '',
    note: '',
  });

  const effectiveVariantId = variantId ?? picked?.variantId;
  const effectiveLabel = sku ?? (picked ? `${picked.sku} — ${picked.productName}` : undefined);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveVariantId) return;
    await createMovement.mutateAsync({
      variantId: effectiveVariantId,
      type: form.type,
      quantity: Number(form.quantity),
      reason: form.reason,
      note: form.note || undefined,
    });
    setOpen(false);
    setPicked(null);
    setForm({ type: 'ADJUSTMENT', quantity: '', reason: '', note: '' });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setPicked(null);
      }}
    >
      <DialogTrigger asChild>{trigger as any}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova movimentação {effectiveLabel ? `— ${effectiveLabel}` : ''}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!variantId && (
            <div className="space-y-1.5">
              <Label>Produto</Label>
              {picked ? (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{picked.sku}</span>{' '}
                    <span className="text-muted-foreground">— {picked.productName}</span>
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPicked(null)}>
                    Trocar
                  </Button>
                </div>
              ) : (
                <VariantPickerDialog
                  onPick={setPicked}
                  trigger={
                    <Button type="button" variant="outline" className="w-full justify-start">
                      <Search className="h-4 w-4" />
                      Buscar produto por nome ou SKU...
                    </Button>
                  }
                />
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOVEMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quantity">
              Quantidade {form.type === 'ADJUSTMENT' && '(use valor negativo para reduzir)'}
            </Label>
            <Input
              id="quantity"
              type="number"
              required
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Motivo (obrigatório)</Label>
            <Input
              id="reason"
              required
              minLength={3}
              placeholder="Ex: Conferência de estoque encontrou divergência"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">Observação (opcional)</Label>
            <Textarea id="note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={createMovement.isPending || form.reason.trim().length < 3 || !effectiveVariantId}
            >
              {createMovement.isPending ? 'Salvando...' : 'Registrar movimentação'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
