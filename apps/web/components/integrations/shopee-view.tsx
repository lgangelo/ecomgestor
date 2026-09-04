'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useShopeeStatus } from '@/hooks/use-shopee';
import { ShopeeSettingsTab } from './shopee/shopee-settings-tab';

/**
 * Esqueleto da integração Shopee — só conectar/desconectar (OAuth) por enquanto, sem abas de
 * produtos/pedidos/estoque/financeiro como a TikTok já tem: nenhum desses endpoints da Shopee
 * Open API foi confirmado contra uma conta real ainda (ver docs/integrations/shopee.md,
 * "Próximos passos"). Assim que isso acontecer, o padrão a seguir é `tiktok-view.tsx`.
 */
export function ShopeeIntegrationView() {
  const { data: status, isLoading } = useShopeeStatus();

  return (
    <div>
      <Link
        href="/integracoes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para integrações
      </Link>

      <PageHeader title="Shopee" description="Conexão via OAuth — sincronização de produtos/pedidos/estoque ainda não implementada." />

      {isLoading || !status ? (
        <Skeleton className="h-40" />
      ) : (
        <ShopeeSettingsTab status={status} />
      )}
    </div>
  );
}
