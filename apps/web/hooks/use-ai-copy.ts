'use client';

import { useMutation } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@/components/ui/use-toast';

export interface GenerateProductCopyInput {
  titleHint?: string;
  descriptionHint?: string;
  category?: string;
  color?: string;
  size?: string;
  brand?: string;
  /** Arquivo recém-selecionado (ainda não enviado) OU a foto já cadastrada, buscada como blob —
   * ver `resolveImageAsFile` em cada diálogo que usa este hook. */
  image?: File | Blob;
}

export interface GenerateProductCopyOutput {
  title: string;
  description: string;
}

/** Sempre devolve uma SUGESTÃO — quem chama decide se aplica aos campos do formulário (nunca
 * salva sozinho, o usuário ainda revisa/edita antes de submeter). */
export function useGenerateProductCopy() {
  return useMutation({
    mutationFn: (input: GenerateProductCopyInput) => {
      const form = new FormData();
      if (input.titleHint) form.append('titleHint', input.titleHint);
      if (input.descriptionHint) form.append('descriptionHint', input.descriptionHint);
      if (input.category) form.append('category', input.category);
      if (input.color) form.append('color', input.color);
      if (input.size) form.append('size', input.size);
      if (input.brand) form.append('brand', input.brand);
      if (input.image) form.append('file', input.image);
      return apiFetch<GenerateProductCopyOutput>('/ai/generate-product-copy', { method: 'POST', body: form });
    },
    onError: (error) => {
      toast({
        title: 'Não foi possível gerar título/descrição',
        description: error instanceof ApiError ? error.message : undefined,
        variant: 'destructive',
      });
    },
  });
}
