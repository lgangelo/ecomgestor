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
import { resolveProductImageUrl, useUpdateProduct, useUpdateVariant, useUploadVariantImage } from '@/hooks/use-products';
import type { ProductDetail, ProductVariantDetail } from '@/hooks/use-products';
import { ImageUploadField } from './image-upload-field';

/** Fotos já existentes no produto (capa, galeria, outras variações) que dá pra reaproveitar sem
 * precisar enviar um arquivo novo — deduplicadas, na ordem: capa, galeria, outras variações. */
function collectExistingPhotos(product: ProductDetail, currentVariantId: string): string[] {
  const urls = [
    product.imageUrl,
    ...product.images.map((i) => i.url),
    ...product.variants.filter((v) => v.id !== currentVariantId).map((v) => v.imageUrl),
  ].filter((url): url is string => Boolean(url));
  return [...new Set(urls)];
}

export function VariantEditDialog({
  productId,
  product,
  variant,
  /** Produto com uma única variação: o SKU base do produto é o mesmo desta variação (é como a
   * criação a partir da TikTok Shop grava os dois) — editar aqui atualiza os dois juntos, senão
   * ficam dessincronizados. */
  syncBaseSku,
  trigger,
}: {
  productId: string;
  product: ProductDetail;
  variant: ProductVariantDetail;
  syncBaseSku?: boolean;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = React.useState(false);
  const updateVariant = useUpdateVariant(productId, variant.id);
  const updateProduct = useUpdateProduct(productId);
  const uploadImage = useUploadVariantImage(productId, variant.id);
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  // Mutuamente exclusivo com `imageFile`: ou envia um arquivo novo, ou reaproveita uma foto já
  // existente no produto (capa, galeria, outra variação) — nunca os dois ao mesmo tempo.
  const [selectedExistingUrl, setSelectedExistingUrl] = React.useState<string | null>(null);
  const existingPhotos = React.useMemo(() => collectExistingPhotos(product, variant.id), [product, variant.id]);

  const [form, setForm] = React.useState({
    sku: variant.sku,
    barcode: variant.barcode ?? '',
    color: variant.color ?? '',
    size: variant.size ?? '',
    suggestedPrice: variant.suggestedPrice,
    minStock: String(variant.minStock),
  });

  React.useEffect(() => {
    if (open) {
      setForm({
        sku: variant.sku,
        barcode: variant.barcode ?? '',
        color: variant.color ?? '',
        size: variant.size ?? '',
        suggestedPrice: variant.suggestedPrice,
        minStock: String(variant.minStock),
      });
      setSelectedExistingUrl(null);
    }
  }, [open, variant]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await updateVariant.mutateAsync({
      sku: form.sku,
      barcode: form.barcode || undefined,
      color: form.color || undefined,
      size: form.size || undefined,
      suggestedPrice: Number(form.suggestedPrice),
      minStock: Number(form.minStock),
      // Reaproveita uma foto já existente no produto (capa/galeria/outra variação) — nunca junto
      // com upload de arquivo novo, o usuário escolhe um ou outro.
      ...(selectedExistingUrl ? { imageUrl: selectedExistingUrl } : {}),
    });
    if (syncBaseSku && form.sku !== variant.sku) {
      await updateProduct.mutateAsync({ baseSku: form.sku });
    }
    if (imageFile) {
      await uploadImage.mutateAsync(imageFile);
      setImageFile(null);
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger as any}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar variação (SKU)</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-sku">SKU</Label>
              <Input id="edit-sku" required value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-barcode">Código de barras</Label>
              <Input
                id="edit-barcode"
                value={form.barcode}
                onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-color">Cor</Label>
              <Input id="edit-color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-size">Tamanho</Label>
              <Input id="edit-size" value={form.size} onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-suggestedPrice">Preço sugerido (R$)</Label>
              <Input
                id="edit-suggestedPrice"
                type="number"
                step="0.01"
                min="0"
                placeholder="Definir depois"
                value={form.suggestedPrice}
                onChange={(e) => setForm((f) => ({ ...f, suggestedPrice: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Pode ficar em branco — só é exigido na hora de ativar o produto.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-minStock">Estoque mínimo</Label>
              <Input
                id="edit-minStock"
                type="number"
                min="0"
                value={form.minStock}
                onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <ImageUploadField
                id="edit-variantImageFile"
                label="Foto desta variação (opcional)"
                existingUrl={selectedExistingUrl ?? resolveProductImageUrl(variant.imageUrl)}
                onFileSelect={(file) => {
                  setImageFile(file);
                  if (file) setSelectedExistingUrl(null);
                }}
              />
            </div>
            {existingPhotos.length > 0 && (
              <div className="col-span-2 space-y-1.5">
                <Label>Ou escolha uma foto já existente no produto</Label>
                <div className="flex flex-wrap gap-2">
                  {existingPhotos.map((url) => {
                    const isSelected = selectedExistingUrl === url;
                    return (
                      <button
                        key={url}
                        type="button"
                        onClick={() => {
                          setSelectedExistingUrl(isSelected ? null : url);
                          setImageFile(null);
                        }}
                        className={`rounded ${isSelected ? 'ring-2 ring-primary' : ''}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- foto já existente no produto, servida pela nossa própria API ou por um canal externo */}
                        <img src={resolveProductImageUrl(url)} alt="" className="h-14 w-14 rounded object-cover" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={updateVariant.isPending}>
              {updateVariant.isPending ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
