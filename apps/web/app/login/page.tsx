import { redirect } from 'next/navigation';
import { apiServerFetch } from '@/lib/api-server';
import type { SessionUser } from '@/lib/types/auth';
import { LoginForm } from '@/components/auth/login-form';

export const metadata = { title: 'Entrar — E-commerce Manager' };

export default async function LoginPage() {
  const session = await apiServerFetch<{ user: SessionUser }>('/auth/me');
  if (session?.user) redirect('/');

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
            E
          </div>
          <h1 className="text-xl font-semibold tracking-tight">E-commerce Manager</h1>
          <p className="text-sm text-muted-foreground">Entre com sua conta para continuar</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <LoginForm />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Acesso restrito a usuários autorizados da empresa.
        </p>
      </div>
    </div>
  );
}
