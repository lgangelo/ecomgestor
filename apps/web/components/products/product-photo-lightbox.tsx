'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { resolveProductImageUrl, useProduct } from '@/hooks/use-products';

/**
 * Visualizador de fotos do produto (capa + galeria + fotos de variação, deduplicadas) com
 * navegação por seta — aberto ao clicar na miniatura da lista de produtos. `productId: null`
 * mantém o diálogo fechado (`open` some sozinho via `Dialog`).
 */
export function ProductPhotoLightbox({
  productId,
  open,
  onOpenChange,
}: {
  productId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: product } = useProduct(productId ?? undefined);
  const [index, setIndex] = React.useState(0);

  const photos = React.useMemo(() => {
    if (!product) return [];
    const urls = [product.imageUrl, ...product.images.map((i) => i.url), ...product.variants.map((v) => v.imageUrl)].filter(
      (u): u is string => Boolean(u),
    );
    return [...new Set(urls)];
  }, [product]);

  React.useEffect(() => {
    if (open) setIndex(0);
  }, [open, productId]);

  React.useEffect(() => {
    if (!open || photos.length === 0) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % photos.length);
      else if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + photos.length) % photos.length);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, photos.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {photos.length > 0 && (
          <>
            <div className="relative flex items-center justify-center">
              {photos.length > 1 && (
                <button
                  type="button"
                  aria-label="Foto anterior"
                  onClick={() => setIndex((i) => (i - 1 + photos.length) % photos.length)}
                  className="absolute left-0 rounded-full bg-background/80 p-2 hover:bg-background"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element -- foto do produto, servida pela nossa própria API ou por um canal externo */}
              <img
                src={resolveProductImageUrl(photos[index])}
                alt=""
                className="max-h-[70vh] max-w-full rounded object-contain"
              />
              {photos.length > 1 && (
                <button
                  type="button"
                  aria-label="Próxima foto"
                  onClick={() => setIndex((i) => (i + 1) % photos.length)}
                  className="absolute right-0 rounded-full bg-background/80 p-2 hover:bg-background"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </div>
            {photos.length > 1 && (
              <p className="text-center text-sm text-muted-foreground">
                {index + 1} / {photos.length}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
