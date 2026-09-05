'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { connectMercadoLivre, useMercadoLivreDisconnect } from '@/hooks/use-mercado-livre';
import type { MercadoLivreStatus } from '@/hooks/use-mercado-livre';

/**
 * Sincronização de pedidos (Bloco 1) já roda automaticamente para quem está conectado — a
 * publicação de produtos ainda é manual (scripts de CLI, ver docs/integrations/mercado-livre.md).
 */
export function MercadoLivreSettingsTab({ status }: { status: MercadoLivreStatus }) {
  const disconnect = useMercadoLivreDisconnect();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conexão</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {!status.configured ? (
          <p className="text-sm text-muted-foreground">
            Mercado Livre não configurado. Configure <code>MERCADOLIVRE_CLIENT_ID</code> e{' '}
            <code>MERCADOLIVRE_CLIENT_SECRET</code> para conectar sua conta.
          </p>
        ) : status.connected ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">
              Conectado{status.storeName ? ` — usuário ${status.storeName}` : ''}. Pedidos são sincronizados
              automaticamente a cada poucos minutos; publicação de produtos ainda é manual.
            </p>
            <Button variant="destructive" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>
              Desconectar
            </Button>
          </div>
        ) : (
          <Button onClick={connectMercadoLivre}>Conectar</Button>
        )}
      </CardContent>
    </Card>
  );
}
