'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { TikTokCreateProductDialog } from '@/components/integrations/tiktok/tiktok-create-product-dialog';
import type { OrderItemDetail } from '@/hooks/use-orders';

/** Fallback para quando um item importado ficou "SKU sem vínculo" e o produto some do catálogo
 * da TikTok (nunca mais aparece na aba Produtos para "Vincular"/"Criar" de lá, ver
 * check-unmatched-sku) — usa os dados já salvos no próprio pedido (nome, preço) para criar o
 * produto interno manualmente, sem depender do catálogo externo. */
export function CreateProductFromOrderItemButton({ item }: { item: OrderItemDetail }) {
  const [open, setOpen] = React.useState(false);

  if (item.variantId || !item.externalSku) return null;

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Criar produto
      </Button>
      <TikTokCreateProductDialog
        open={open}
        onOpenChange={setOpen}
        product={{
          externalSku: item.externalSku,
          externalProductId: undefined,
          name: item.productName,
          price: item.unitPrice,
          stock: 0,
          ambiguous: false,
        }}
      />
    </>
  );
}
