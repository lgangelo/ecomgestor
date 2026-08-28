'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function TikTokFiscalTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Documentos fiscais</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0 text-sm text-muted-foreground">
        <p>
          A pesquisa oficial (ver <code>docs/integrations/tiktok.md</code>, item 19) confirmou que a TikTok Shop não
          emite nem disponibiliza XML de NF-e para download — o modelo é o inverso: o vendedor gera a própria NF-e
          e faz upload dela na TikTok Shop.
        </p>
        <p>Por isso, o fluxo fiscal para pedidos TikTok é o mesmo já usado para os demais canais: upload manual do XML.</p>
        <Button asChild variant="outline">
          <Link href="/fiscal">
            <FileText className="h-4 w-4" />
            Ir para o módulo Fiscal
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
