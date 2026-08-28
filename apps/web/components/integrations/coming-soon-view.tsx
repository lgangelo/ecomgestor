import Link from 'next/link';
import { ArrowLeft, Clock } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';

export function ComingSoonIntegrationView({ name }: { name: string }) {
  return (
    <div>
      <Link
        href="/integracoes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para integrações
      </Link>
      <PageHeader title={name} description="Esta integração ainda não está disponível." />
      <EmptyState
        icon={Clock}
        title="Em breve"
        description={`A integração com ${name} será implementada em uma etapa futura.`}
      />
    </div>
  );
}
