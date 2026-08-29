'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useOnboardingStatus } from '@/hooks/use-onboarding';

const DISMISSED_KEY = 'ecm_onboarding_dismissed';

/** Checklist de primeira utilização (seção 64 da Fase 4) — nunca bloqueia o uso do sistema, só
 * mostra progresso; "ocultar" é uma preferência só deste navegador (localStorage). */
export function OnboardingChecklist() {
  const { data } = useOnboardingStatus();
  const [dismissed, setDismissed] = React.useState(true); // começa oculto até checar o localStorage (evita flash)

  React.useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === 'true');
    } catch {
      setDismissed(false);
    }
  }, []);

  function handleDismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // localStorage indisponível (modo privado, etc.) — só não persiste entre sessões.
    }
  }

  if (dismissed || !data || data.completedCount === data.totalCount) return null;

  const percent = Math.round((data.completedCount / data.totalCount) * 100);

  return (
    <Card className="mb-6">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle>Primeiros passos</CardTitle>
          <p className="text-xs text-muted-foreground">
            {data.completedCount} de {data.totalCount} concluídos
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleDismiss} aria-label="Ocultar">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {data.steps.map((step) => (
            <Link
              key={step.key}
              href={step.href}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              {step.completed ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className={step.completed ? 'text-muted-foreground line-through' : 'text-foreground'}>
                {step.label}
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
