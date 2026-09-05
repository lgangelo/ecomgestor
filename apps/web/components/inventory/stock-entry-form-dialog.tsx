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
import { Checkbox } from '@/components/ui/checkbox';
import { formatBRL } from '@ecommerce-manager/shared';
import { toDateInputValue } from '@/lib/format';
import { useSuppliers } from '@/hooks/use-suppliers';
import { useCreateStockEntry } from '@/hooks/use-stock-entries';
import { VariantPickerDialog, type PickedVariant } from '@/components/shared/variant-picker-dialog';
import { SupplierFormDialog } from './supplier-form-dialog';

interface Row extends PickedVariant {
  quantity: string;
  unitCost: string;
}

export function StockEntryFormDialog({ trigger }: { trigger: React.ReactElement }) {
  const [open, setOpen] = React.useState(false);
  const { data: suppliers } = useSuppliers();
  const createEntry = useCreateStockEntry();

  const [supplierId, setSupplierId] = React.useState('');
  const [entryDate, setEntryDate] = React.useState(toDateInputValue(new Date()));
  const [invoiceNumber, setInvoiceNumber] = React.useState('');
  const [shippingCost, setShippingCost] = React.useState('0');
  const [otherCosts, setOtherCosts] = React.useState('0');
  const [allocationMethod, setAllocationMethod] = React.useState<'BY_VALUE' | 'BY_QUANTITY'>('BY_VALUE');
  const [skipStockMovement, setSkipStockMovement] = React.useState(false);
  const [rows, setRows] = React.useState<Row[]>([]);

  const itemsValue = rows.reduce((sum, r) => sum + Number(r.quantity || 0) * Number(r.unitCost || 0), 0);
  const extraCosts = Number(shippingCost || 0) + Number(otherCosts || 0);

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
      shippingCost: Number(shippingCost || 0),
      otherCosts: Number(otherCosts || 0),
      allocationMethod,
      status,
      skipStockMovement,
      items: rows.map((r) => ({
        variantId: r.variantId,
        quantity: Number(r.quantity),
        unitCost: Number(r.unitCost),
      })),
    });
    setOpen(false);
    setRows([]);
    setInvoiceNumber('');
    setShippingCost('0');
    setOtherCosts('0');
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger as any}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova entrada de estoque</DialogTitle>
        </DialogHeader>
        <form className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Fornecedor</Label>
              <div className="flex gap-2">
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
                <SupplierFormDialog
                  onCreated={(supplier) => setSupplierId(supplier.id)}
                  trigger={
                    <Button type="button" variant="outline" size="icon" aria-label="Novo fornecedor">
                      <Plus className="h-4 w-4" />
                    </Button>
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entryDate">Data</Label>
              <Input id="entryDate" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoiceNumber">Nota fiscal</Label>
              <Input id="invoiceNumber" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shippingCost">Frete (R$)</Label>
              <Input
                id="shippingCost"
                type="number"
                min="0"
                step="0.01"
                value={shippingCost}
                onChange={(e) => setShippingCost(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="otherCosts">Outras despesas (R$)</Label>
              <Input
                id="otherCosts"
                type="number"
                min="0"
                step="0.01"
                value={otherCosts}
                onChange={(e) => setOtherCosts(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Método de rateio</Label>
              <Select value={allocationMethod} onValueChange={(v) => setAllocationMethod(v as 'BY_VALUE' | 'BY_QUANTITY')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BY_VALUE">Por valor dos itens</SelectItem>
                  <SelectItem value="BY_QUANTITY">Por quantidade</SelectItem>
                </SelectContent>
              </Select>
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
                <div className="space-y-1 text-right text-sm text-muted-foreground">
                  <p>Valor dos itens: {formatBRL(itemsValue)}</p>
                  {extraCosts > 0 && <p>Frete + outras despesas a ratear: {formatBRL(extraCosts)}</p>}
                  <p className="font-medium text-foreground">Custo total da entrada: {formatBRL(itemsValue + extraCosts)}</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-md border border-border p-3">
            <Checkbox
              id="skipStockMovement"
              checked={skipStockMovement}
              onCheckedChange={(checked) => setSkipStockMovement(checked === true)}
            />
            <Label htmlFor="skipStockMovement" className="text-sm font-normal leading-snug">
              Só registrar o custo, sem movimentar o estoque físico — use quando o saldo já vem de
              outra origem (ex.: carga inicial via TikTok Shop) e uma entrada normal duplicaria a
              quantidade.
            </Label>
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
