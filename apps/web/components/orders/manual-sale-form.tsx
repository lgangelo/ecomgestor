'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatBRL } from '@ecommerce-manager/shared';
import { toDateInputValue } from '@/lib/format';
import { useCreateManualOrder } from '@/hooks/use-orders';
import { VariantPickerDialog, type PickedVariant } from '@/components/shared/variant-picker-dialog';

interface Row extends PickedVariant {
  quantity: string;
  unitPrice: string;
  discount: string;
}

const MANUAL_CHANNELS = [
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'LOJA_FISICA', label: 'Loja física' },
  { value: 'OUTRO', label: 'Outro' },
];

export function ManualSaleForm() {
  const router = useRouter();
  const createManualOrder = useCreateManualOrder();

  const [channelType, setChannelType] = React.useState('INSTAGRAM');
  const [customerName, setCustomerName] = React.useState('');
  const [orderDate, setOrderDate] = React.useState(toDateInputValue(new Date()));
  const [shipping, setShipping] = React.useState('0');
  const [paymentMethod, setPaymentMethod] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [rows, setRows] = React.useState<Row[]>([]);

  function addRow(variant: PickedVariant) {
    setRows((r) => [...r, { ...variant, quantity: '1', unitPrice: String(variant.suggestedPrice), discount: '0' }]);
  }

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    setRows((r) => r.filter((_, i) => i !== index));
  }

  const total =
    rows.reduce(
      (sum, r) => sum + Number(r.quantity || 0) * Number(r.unitPrice || 0) - Number(r.discount || 0),
      0,
    ) + Number(shipping || 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const order = await createManualOrder.mutateAsync({
      channelType,
      customerName,
      orderDate,
      shipping: Number(shipping || 0),
      paymentMethod: paymentMethod || undefined,
      notes: notes || undefined,
      items: rows.map((r) => ({
        variantId: r.variantId,
        quantity: Number(r.quantity),
        unitPrice: Number(r.unitPrice),
        discount: Number(r.discount || 0),
      })),
    });
    router.push(`/vendas/pedidos/${order.id}`);
  }

  return (
    <div>
      <PageHeader title="Nova venda" description="Registre uma venda manual (fora dos marketplaces integrados)." />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardContent className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Canal</Label>
              <Select value={channelType} onValueChange={setChannelType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_CHANNELS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customerName">Cliente</Label>
              <Input id="customerName" required value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="orderDate">Data</Label>
              <Input id="orderDate" type="date" required value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paymentMethod">Forma de pagamento</Label>
              <Input
                id="paymentMethod"
                placeholder="Ex: Pix, Cartão de crédito"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shipping">Frete cobrado (R$)</Label>
              <Input
                id="shipping"
                type="number"
                min="0"
                step="0.01"
                value={shipping}
                onChange={(e) => setShipping(e.target.value)}
              />
            </div>
            <div className="col-span-full space-y-1.5">
              <Label htmlFor="notes">Observação</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center justify-between">
              <Label>Produtos</Label>
              <VariantPickerDialog
                onPick={addRow}
                trigger={
                  <Button type="button" variant="outline" size="sm">
                    <Plus className="h-4 w-4" />
                    Adicionar produto
                  </Button>
                }
              />
            </div>

            {rows.length === 0 ? (
              <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                Nenhum produto adicionado ainda.
              </p>
            ) : (
              <div className="space-y-2">
                {rows.map((row, index) => (
                  <div key={index} className="flex items-center gap-2 rounded-md border border-border p-2">
                    <div className="flex-1 text-sm">
                      <p className="font-medium">{row.sku}</p>
                      <p className="text-xs text-muted-foreground">{row.productName}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Qtd.</Label>
                      <Input
                        type="number"
                        min="1"
                        className="w-20"
                        value={row.quantity}
                        onChange={(e) => updateRow(index, { quantity: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Preço</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-24"
                        value={row.unitPrice}
                        onChange={(e) => updateRow(index, { unitPrice: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Desconto</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-24"
                        value={row.discount}
                        onChange={(e) => updateRow(index, { discount: e.target.value })}
                      />
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <p className="text-right text-lg font-semibold">Total: {formatBRL(total)}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={rows.length === 0 || createManualOrder.isPending}>
            {createManualOrder.isPending ? 'Registrando...' : 'Registrar venda'}
          </Button>
        </div>
      </form>
    </div>
  );
}
