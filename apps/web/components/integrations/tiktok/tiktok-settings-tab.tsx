'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { connectTikTok, useTikTokDisconnect, useTikTokSyncNow } from '@/hooks/use-tiktok';
import type { TikTokStatus } from '@/hooks/use-tiktok';
import { TikTokImportWizardDialog } from './tiktok-import-wizard-dialog';

export function TikTokSettingsTab({ status }: { status: TikTokStatus }) {
  const disconnect = useTikTokDisconnect();
  const syncNow = useTikTokSyncNow();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conexão</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {!status.configured ? (
          <p className="text-sm text-muted-foreground">
            TikTok Shop não configurado. Configure <code>TIKTOK_APP_KEY</code> e <code>TIKTOK_APP_SECRET</code> para
            conectar sua loja.
          </p>
        ) : status.connected ? (
          <div className="flex flex-wrap gap-2">
            <TikTokImportWizardDialog trigger={<Button variant="outline">Importar dados</Button>} />
            <Button variant="outline" disabled={syncNow.isPending} onClick={() => syncNow.mutate()}>
              Sincronizar agora
            </Button>
            <Button variant="destructive" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>
              Desconectar
            </Button>
          </div>
        ) : (
          <Button onClick={connectTikTok}>Conectar</Button>
        )}
      </CardContent>
    </Card>
  );
}
