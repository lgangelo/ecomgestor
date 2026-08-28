'use client';

import { Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import type { TikTokStatus } from '@/hooks/use-tiktok';

export function TikTokFinanceTab({ status }: { status: TikTokStatus }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Wallet className="h-4 w-4 text-muted-foreground" />
        <CardTitle>Financeiro / Settlements</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0 text-sm text-muted-foreground">
        <p>
          A conciliação (venda bruta, descontos, taxas, comissões e receita líquida) fica disponível por pedido — abra
          o pedido na aba Pedidos e veja o card &quot;Conciliação TikTok Shop&quot;.
        </p>
        <p>
          Última sincronização financeira:{' '}
          {status.checkpoints?.financeSyncAt ? formatDate(status.checkpoints.financeSyncAt, true) : 'nunca'}.
        </p>
        <p>
          Pedidos sem transações de liquidação ainda mostram &quot;Pendente de liquidação&quot; — nunca R$ 0,00 — até a
          TikTok Shop reportar o repasse.
        </p>
      </CardContent>
    </Card>
  );
}
