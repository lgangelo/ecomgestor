'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatBRL } from '@ecommerce-manager/shared';
import { toDateInputValue } from '@/lib/format';
import { useSuppliers } from '@/hooks/use-suppliers';
import { useCreateStockEntry } from '@/hooks/use-stock-entries';
import { VariantPickerDialog, type PickedVariant } from '@/components/shared/variant-picker-dialog';

interface Row extends PickedVariant {
  quantity: string;
  unitCost: string;
}

export function StockEntryFormDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const { data: suppliers } = useSuppliers();
  const createEntry = useCreateStockEntry();

  const [supplierId, setSupplierId] = React.useState('');
  const [entryDate, setEntryDate] = React.useState(toDateInputValue(new Date()));
  const [invoiceNumber, setInvoiceNumber] = React.useState('');
  const [rows, setRows] = React.useState<Row[]>([]);

  function addRow(variant: PickedVariant) {
    setRows((r) => [...r, { ...variant, quantity: '1', unitCost: String(variant.suggestedPrice) }]);
  }

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    setRows((r) => r.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent, status: 'DRAFT' | 'CONFIRMED') {
    e.preventDefault();
    await createEntry.mutateAsync({
      supplierId: supplierId || undefined,
      entryDate,
      invoiceNumber: invoiceNumber || undefined,
      status,
      items: rows.map((r) => ({
        variantId: r.variantId,
        quantity: Number(r.quantity),
        unitCost: Number(r.unitCost),
      })),
    });
    setOpen(false);
    setRows([]);
    setInvoiceNumber('');
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova entrada de estoque</DialogTitle>
        </DialogHeader>
        <form className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Fornecedor</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entryDate">Data</Label>
              <Input id="entryDate" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoiceNumber">Nota fiscal</Label>
              <Input id="invoiceNumber" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Itens</Label>
              <VariantPickerDialog
                onPick={addRow}
                trigger={
                  <Button type="button" variant="outline" size="sm">
                    <Plus className="h-4 w-4" />
                    Adicionar item
                  </Button>
                }
              />
            </div>

            {rows.length === 0 ? (
              <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                Nenhum item adicionado ainda.
              </p>
            ) : (
              <div className="space-y-2">
                {rows.map((row, index) => (
                  <div key={index} className="flex items-center gap-2 rounded-md border border-border p-2">
                    <div className="flex-1 text-sm">
                      <p className="font-medium">{row.sku}</p>
                      <p className="text-xs text-muted-foreground">{row.productName}</p>
                    </div>
                    <Input
                      type="number"
                      min="1"
                      className="w-20"
                      value={row.quantity}
                      onChange={(e) => updateRow(index, { quantity: e.target.value })}
                      aria-label="Quantidade"
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-28"
                      value={row.unitCost}
                      onChange={(e) => updateRow(index, { unitCost: e.target.value })}
                      aria-label="Custo unitário"
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <p className="text-right text-sm text-muted-foreground">
                  Total:{' '}
                  {formatBRL(
                    rows.reduce((sum, r) => sum + Number(r.quantity || 0) * Number(r.unitCost || 0), 0),
                  )}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={createEntry.isPending || rows.length === 0}
              onClick={(e) => handleSubmit(e, 'DRAFT')}
            >
              Salvar como rascunho
            </Button>
            <Button
              type="button"
              disabled={createEntry.isPending || rows.length === 0}
              onClick={(e) => handleSubmit(e, 'CONFIRMED')}
            >
              Confirmar entrada
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
