'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useMercadoLivreStatus } from '@/hooks/use-mercado-livre';
import { MercadoLivreSettingsTab } from './mercado-livre/mercado-livre-settings-tab';

/**
 * Esqueleto da integração Mercado Livre — só conectar/desconectar (OAuth) por enquanto, sem
 * abas de produtos/pedidos/estoque/financeiro como a TikTok já tem: nenhum desses endpoints foi
 * confirmado contra uma conta real ainda (ver docs/integrations/mercado-livre.md, "Próximos
 * passos"). Assim que isso acontecer, o padrão a seguir é `tiktok-view.tsx`.
 */
export function MercadoLivreIntegrationView() {
  const { data: status, isLoading } = useMercadoLivreStatus();

  return (
    <div>
      <Link
        href="/integracoes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para integrações
      </Link>

      <PageHeader
        title="Mercado Livre"
        description="Conexão via OAuth — sincronização de produtos/pedidos/estoque ainda não implementada."
      />

      {isLoading || !status ? <Skeleton className="h-40" /> : <MercadoLivreSettingsTab status={status} />}
    </div>
  );
}
