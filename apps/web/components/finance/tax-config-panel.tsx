'use client';

import * as React from 'react';
import { Plus, Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { formatDate } from '@/lib/format';
import { useCreateTaxConfiguration, useTaxConfigurations } from '@/hooks/use-finance';
import { EmptyState } from '@/components/shared/empty-state';

export function TaxConfigPanel() {
  const { data: configs, isLoading } = useTaxConfigurations();
  const createConfig = useCreateTaxConfiguration();

  const [open, setOpen] = React.useState(false);
  const [taxRegime, setTaxRegime] = React.useState('Simples Nacional');
  const [ratePercent, setRatePercent] = React.useState('');
  const [validFrom, setValidFrom] = React.useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createConfig.mutateAsync({
      taxRegime,
      estimatedRate: Number(ratePercent) / 100,
      validFrom,
    });
    setOpen(false);
    setRatePercent('');
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        A alíquota estimada usada no DRE gerencial vem sempre daqui — nunca é fixa no código.
      </p>
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              Nova configuração
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova configuração de imposto</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="taxRegime">Regime tributário</Label>
                <Input id="taxRegime" required value={taxRegime} onChange={(e) => setTaxRegime(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ratePercent">Alíquota estimada (%)</Label>
                <Input
                  id="ratePercent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  value={ratePercent}
                  onChange={(e) => setRatePercent(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="validFrom">Válida a partir de</Label>
                <Input id="validFrom" type="date" required value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createConfig.isPending}>
                  {createConfig.isPending ? 'Salvando...' : 'Criar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading || !configs ? null : configs.length === 0 ? (
        <EmptyState icon={Percent} title="Nenhuma configuração de imposto cadastrada" />
      ) : (
        <div className="space-y-2">
          {configs.map((config) => (
            <div key={config.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
              <div>
                <p className="font-medium">{config.taxRegime}</p>
                <p className="text-xs text-muted-foreground">
                  Vigente desde {formatDate(config.validFrom)}
                  {config.validTo ? ` até ${formatDate(config.validTo)}` : ''}
                </p>
              </div>
              <span className="font-medium">{(Number(config.estimatedRate) * 100).toFixed(2)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
