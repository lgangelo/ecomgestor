'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { connectShopee, useShopeeDisconnect } from '@/hooks/use-shopee';
import type { ShopeeStatus } from '@/hooks/use-shopee';

/**
 * Esqueleto — só conectar/desconectar por enquanto. Nenhuma tela de sincronização (produtos,
 * pedidos, estoque) ainda, porque nenhum desses endpoints da Shopee foi confirmado contra uma
 * conta real (ver docs/integrations/shopee.md).
 */
export function ShopeeSettingsTab({ status }: { status: ShopeeStatus }) {
  const disconnect = useShopeeDisconnect();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conexão</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {!status.configured ? (
          <p className="text-sm text-muted-foreground">
            Shopee não configurada. Configure <code>SHOPEE_PARTNER_ID</code> e <code>SHOPEE_PARTNER_KEY</code> para
            conectar sua loja.
          </p>
        ) : status.connected ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">
              Conectado{status.storeName ? ` — ${status.storeName}` : ''}. Sincronização de produtos/pedidos/estoque
              ainda não implementada (esqueleto).
            </p>
            <Button variant="destructive" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>
              Desconectar
            </Button>
          </div>
        ) : (
          <Button onClick={connectShopee}>Conectar</Button>
        )}
      </CardContent>
    </Card>
  );
}
