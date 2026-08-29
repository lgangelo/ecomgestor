import Link from 'next/link';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AttentionItem } from '@/hooks/use-reports';

/** Seção 63 da Fase 4 — "Precisa da sua atenção": cada item é clicável e leva direto para a tela
 * onde o usuário resolve. Só aparece quando há algo para resolver (a API já filtra count = 0). */
export function AttentionSection({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Precisa da sua atenção</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">Nenhuma pendência no momento.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Precisa da sua atenção</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.link}
            className="flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
          >
            <span className="flex items-center gap-2 text-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              {item.count} {item.label}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
