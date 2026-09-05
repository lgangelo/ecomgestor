'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCategories } from '@/hooks/use-categories';
import {
  MAX_PRODUCT_IMAGES,
  resolveProductImageUrl,
  useAddProductImage,
  useRemoveProductImage,
  useSetProductCoverImage,
  useUpdateProduct,
  useUploadProductImage,
  type ProductDetail,
} from '@/hooks/use-products';
import { useGenerateProductCopy } from '@/hooks/use-ai-copy';
import { ImageUploadField } from './image-upload-field';

export function ProductEditDialog({ product, trigger }: { product: ProductDetail; trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const { data: categories } = useCategories();
  const updateProduct = useUpdateProduct(product.id);
  const uploadImage = useUploadProductImage(product.id);
  const addImage = useAddProductImage(product.id);
  const removeImage = useRemoveProductImage(product.id);
  const setCoverImage = useSetProductCoverImage(product.id);
  const [removingImageId, setRemovingImageId] = React.useState<string | null>(null);
  const generateCopy = useGenerateProductCopy();
  const [imageFile, setImageFile] = React.useState<File | null>(null);

  const [form, setForm] = React.useState({
    name: product.name,
    baseSku: product.baseSku,
    brand: product.brand ?? '',
    description: product.description ?? '',
    categoryId: product.category?.id ?? '',
    imageUrl: product.imageUrl ?? '',
    status: product.status,
  });

  React.useEffect(() => {
    if (open) {
      setForm({
        name: product.name,
        baseSku: product.baseSku,
        brand: product.brand ?? '',
        description: product.description ?? '',
        categoryId: product.category?.id ?? '',
        imageUrl: product.imageUrl ?? '',
        status: product.status,
      });
    }
  }, [open, product]);

  const baseSkuChanged = form.baseSku !== product.baseSku;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await updateProduct.mutateAsync({
      name: form.name,
      baseSku: form.baseSku,
      brand: form.brand || undefined,
      description: form.description || undefined,
      categoryId: form.categoryId || undefined,
      imageUrl: form.imageUrl || undefined,
      status: form.status,
    });
    if (imageFile) {
      await uploadImage.mutateAsync(imageFile);
      setImageFile(null);
    }
    setOpen(false);
  }

  async function handleGenerateCopy() {
    const categoryName = categories?.find((c) => c.id === form.categoryId)?.name;
    // Usa o arquivo recém-selecionado se houver; senão busca a foto já cadastrada (mesma origem
    // — cookies de sessão acompanham o fetch normalmente) pra mandar junto mesmo sem reenviar.
    let image: File | Blob | undefined = imageFile ?? undefined;
    const existingUrl = resolveProductImageUrl(product.imageUrl);
    if (!image && existingUrl) {
      try {
        image = await fetch(existingUrl).then((r) => r.blob());
      } catch {
        // Best-effort — segue sem foto se a busca falhar (ex.: URL externa sem CORS liberado).
      }
    }
    // Tamanho e cor são atributos por variação, não do produto — juntam os valores distintos já
    // cadastrados (ex.: "P, M, G") pra dar contexto à IA sem fingir que o produto tem um só. A cor
    // vai só como contexto: o prompt já instrui a IA a nunca comprometer o título/descrição com
    // uma cor específica, já que o texto é compartilhado por todas as variações de cor.
    const distinctSizes = Array.from(new Set(product.variants.map((v) => v.size).filter((s): s is string => Boolean(s))));
    const sizeHint = distinctSizes.length > 0 ? distinctSizes.join(', ') : undefined;
    const distinctColors = Array.from(new Set(product.variants.map((v) => v.color).filter((c): c is string => Boolean(c))));
    const colorHint = distinctColors.length > 0 ? distinctColors.join(', ') : undefined;

    const result = await generateCopy.mutateAsync({
      titleHint: form.name || undefined,
      descriptionHint: form.description || undefined,
      category: categoryName,
      brand: form.brand || undefined,
      size: sizeHint,
      color: colorHint,
      image,
    });
    setForm((f) => ({ ...f, name: result.title, description: result.description }));
  }

  async function handleSetCover(imageId: string, url: string) {
    await setCoverImage.mutateAsync(imageId);
    // Mantém o campo de texto em sincronia — sem isso, salvar o formulário logo depois de
    // promover uma foto da galeria a capa reverteria a capa pro valor antigo do campo.
    setForm((f) => ({ ...f, imageUrl: url }));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar produto</DialogTitle>
          {product.variants.length > 1 && (
            <DialogDescription>
              Ao trocar o SKU base, as {product.variants.length} variações são renumeradas automaticamente para{' '}
              <code>{form.baseSku || 'SKU'}-1</code>, <code>{form.baseSku || 'SKU'}-2</code>, ...
            </DialogDescription>
          )}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="edit-name">Nome</Label>
              <Input
                id="edit-name"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-baseSku">SKU base</Label>
              <Input
                id="edit-baseSku"
                required
                value={form.baseSku}
                onChange={(e) => setForm((f) => ({ ...f, baseSku: e.target.value }))}
              />
              {baseSkuChanged && product.variants.length === 1 && (
                <p className="text-xs text-muted-foreground">A única variação também vai usar este SKU.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-brand">Marca</Label>
              <Input
                id="edit-brand"
                value={form.brand}
                onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof form.status }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Rascunho</SelectItem>
                  <SelectItem value="ACTIVE">Ativo</SelectItem>
                  <SelectItem value="INACTIVE">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <ImageUploadField
                id="edit-coverImageFile"
                label="Foto de capa"
                existingUrl={resolveProductImageUrl(form.imageUrl)}
                onFileSelect={setImageFile}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Galeria de fotos ({product.images.length}/{MAX_PRODUCT_IMAGES})</Label>
                {product.images.length < MAX_PRODUCT_IMAGES && (
                  <label className="cursor-pointer text-sm font-medium text-primary hover:underline">
                    {addImage.isPending ? 'Enviando...' : '+ Adicionar foto'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={addImage.isPending}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) addImage.mutate(file);
                      }}
                    />
                  </label>
                )}
              </div>
              {product.images.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {product.images.map((image) => {
                    const isCover = image.url === product.imageUrl;
                    return (
                      <div key={image.id} className="flex flex-col items-center gap-1">
                        <div className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element -- foto da galeria, servida pela nossa própria API */}
                          <img
                            src={resolveProductImageUrl(image.url)}
                            alt=""
                            className={`h-16 w-16 rounded object-cover ${isCover ? 'ring-2 ring-primary' : ''}`}
                          />
                          {!isCover && (
                            <button
                              type="button"
                              className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                              disabled={removingImageId === image.id}
                              onClick={() => {
                                setRemovingImageId(image.id);
                                removeImage.mutate(image.id, { onSettled: () => setRemovingImageId(null) });
                              }}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        {isCover ? (
                          <span className="text-xs text-muted-foreground">Capa atual</span>
                        ) : (
                          <button
                            type="button"
                            className="text-xs text-primary hover:underline"
                            disabled={setCoverImage.isPending}
                            onClick={() => handleSetCover(image.id, image.url)}
                          >
                            Usar como capa
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="col-span-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-description">Descrição</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={generateCopy.isPending || (!form.name && !form.description)}
                  onClick={handleGenerateCopy}
                >
                  <Sparkles className="h-4 w-4" />
                  {generateCopy.isPending ? 'Gerando...' : 'Gerar com IA'}
                </Button>
              </div>
              <Textarea
                id="edit-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Preenche nome e descrição a partir do que já foi digitado e da foto atual — revise antes de salvar.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={updateProduct.isPending}>
              {updateProduct.isPending ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
