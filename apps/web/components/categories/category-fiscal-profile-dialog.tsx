'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useCategoryFiscalProfiles,
  useDeleteCategoryFiscalProfile,
  useUpsertCategoryFiscalProfile,
  type CategoryFiscalProfileInput,
} from '@/hooks/use-category-fiscal-profiles';

// Só plataformas que emitem NF-e via marketplace têm requisito fiscal por categoria — canal
// manual (Instagram, WhatsApp...) não tem esse conceito, a nota é emitida por fora.
const PLATFORM_OPTIONS = [
  { value: 'TIKTOK_SHOP', label: 'TikTok Shop' },
  { value: 'SHOPEE', label: 'Shopee' },
  { value: 'MERCADO_LIVRE', label: 'Mercado Livre' },
];

const EMPTY_FORM: CategoryFiscalProfileInput = {
  channelType: 'TIKTOK_SHOP',
  ncm: '',
  cest: '',
  exTipi: '',
  naturezaOperacao: '',
  cfopIntraestadual: '',
  cfopInterestadual: '',
  pisCofinsCode: '',
  origem: '',
  csosn: '',
  unidadeMedida: '',
  recopi: '',
  fichaConteudoImportacao: '',
  aliquotaAproximada: '',
  dadosAdicionais: '',
};

export function CategoryFiscalProfileDialog({
  categoryId,
  categoryName,
  trigger,
}: {
  categoryId: string;
  categoryName: string;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = React.useState(false);
  const [platform, setPlatform] = React.useState('TIKTOK_SHOP');
  const [form, setForm] = React.useState<CategoryFiscalProfileInput>(EMPTY_FORM);

  const { data: profiles } = useCategoryFiscalProfiles(categoryId, open);
  const upsert = useUpsertCategoryFiscalProfile(categoryId);
  const remove = useDeleteCategoryFiscalProfile(categoryId);

  // Troca de plataforma (ou abertura do diálogo) sempre carrega o que já existe pra aquela
  // plataforma — nunca mistura dado de uma plataforma com o formulário de outra.
  React.useEffect(() => {
    if (!open) return;
    const existing = profiles?.find((p) => p.channelType === platform);
    setForm(
      existing
        ? { ...existing, cest: existing.cest ?? '', exTipi: existing.exTipi ?? '', recopi: existing.recopi ?? '', fichaConteudoImportacao: existing.fichaConteudoImportacao ?? '', aliquotaAproximada: existing.aliquotaAproximada ?? '', dadosAdicionais: existing.dadosAdicionais ?? '' }
        : { ...EMPTY_FORM, channelType: platform },
    );
  }, [open, platform, profiles]);

  function set<K extends keyof CategoryFiscalProfileInput>(key: K, value: CategoryFiscalProfileInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await upsert.mutateAsync({
      ...form,
      channelType: platform,
      aliquotaAproximada: form.aliquotaAproximada || null,
      cest: form.cest || null,
      exTipi: form.exTipi || null,
      recopi: form.recopi || null,
      fichaConteudoImportacao: form.fichaConteudoImportacao || null,
      dadosAdicionais: form.dadosAdicionais || null,
    });
  }

  const hasExisting = profiles?.some((p) => p.channelType === platform);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger as any}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dados fiscais — {categoryName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Plataforma</Label>
          <Select value={platform} onValueChange={setPlatform}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLATFORM_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Todo produto desta categoria usa estes dados para emitir NF-e nesta plataforma.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="fp-ncm">NCM</Label>
              <Input id="fp-ncm" required value={form.ncm} onChange={(e) => set('ncm', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fp-cest">CEST</Label>
              <Input id="fp-cest" value={form.cest ?? ''} onChange={(e) => set('cest', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fp-extipi">Ex TIPI</Label>
              <Input id="fp-extipi" value={form.exTipi ?? ''} onChange={(e) => set('exTipi', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fp-natureza">Natureza da operação</Label>
              <Input
                id="fp-natureza"
                required
                value={form.naturezaOperacao}
                onChange={(e) => set('naturezaOperacao', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fp-cfop-intra">CFOP para intraestaduais</Label>
              <Input
                id="fp-cfop-intra"
                required
                value={form.cfopIntraestadual}
                onChange={(e) => set('cfopIntraestadual', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fp-cfop-inter">CFOP para interestaduais</Label>
              <Input
                id="fp-cfop-inter"
                required
                value={form.cfopInterestadual}
                onChange={(e) => set('cfopInterestadual', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fp-piscofins">Código de Situação Tributária do PIS e COFINS</Label>
              <Input
                id="fp-piscofins"
                required
                value={form.pisCofinsCode}
                onChange={(e) => set('pisCofinsCode', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fp-origem">Origem</Label>
              <Input id="fp-origem" required value={form.origem} onChange={(e) => set('origem', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fp-csosn">CSOSN</Label>
              <Input id="fp-csosn" required value={form.csosn} onChange={(e) => set('csosn', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fp-unidade">Unidade de medida</Label>
              <Input
                id="fp-unidade"
                required
                value={form.unidadeMedida}
                onChange={(e) => set('unidadeMedida', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fp-recopi">RECOPI</Label>
              <Input id="fp-recopi" value={form.recopi ?? ''} onChange={(e) => set('recopi', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fp-ficha">Número da Ficha de Conteúdo de Importação</Label>
              <Input
                id="fp-ficha"
                value={form.fichaConteudoImportacao ?? ''}
                onChange={(e) => set('fichaConteudoImportacao', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fp-aliquota">Alíquota de imposto aproximada %</Label>
              <Input
                id="fp-aliquota"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.aliquotaAproximada ?? ''}
                onChange={(e) => set('aliquotaAproximada', e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fp-dados">Dados adicionais do produto</Label>
            <Textarea
              id="fp-dados"
              value={form.dadosAdicionais ?? ''}
              onChange={(e) => set('dadosAdicionais', e.target.value)}
            />
          </div>
          <DialogFooter className="flex items-center justify-between sm:justify-between">
            {hasExisting ? (
              <Button
                type="button"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => remove.mutate(platform)}
              >
                Remover dados desta plataforma
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Fechar
              </Button>
              <Button type="submit" disabled={upsert.isPending}>
                {upsert.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
