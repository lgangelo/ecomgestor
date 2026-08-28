'use client';

import * as React from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompany, useUpdateCompany } from '@/hooks/use-company';

const TIMEZONES = ['America/Sao_Paulo', 'America/Manaus', 'America/Rio_Branco', 'America/Noronha'];

export function CompanyView() {
  const { data: company, isLoading } = useCompany();
  const updateCompany = useUpdateCompany();

  const [form, setForm] = React.useState({ name: '', legalName: '', cnpj: '', timezone: 'America/Sao_Paulo' });

  React.useEffect(() => {
    if (company) {
      setForm({
        name: company.name,
        legalName: company.legalName ?? '',
        cnpj: company.cnpj ?? '',
        timezone: company.timezone,
      });
    }
  }, [company]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await updateCompany.mutateAsync({
      name: form.name,
      legalName: form.legalName || undefined,
      cnpj: form.cnpj || undefined,
      timezone: form.timezone,
    });
  }

  if (isLoading || !company) return <Skeleton className="h-96" />;

  return (
    <div>
      <PageHeader title="Empresa" description="Dados cadastrais da empresa." />
      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome fantasia</Label>
              <Input id="name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="legalName">Razão social</Label>
              <Input
                id="legalName"
                value={form.legalName}
                onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input id="cnpj" value={form.cnpj} onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Fuso horário</Label>
              <Select value={form.timezone} onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-full flex justify-end">
              <Button type="submit" disabled={updateCompany.isPending}>
                {updateCompany.isPending ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
