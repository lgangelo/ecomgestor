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
          {/* eslint-disable-next-line @next/next/no-img-element -- logo estático em /public, sem necessidade de otimização */}
          <img
            src="/venticelli.jpg"
            alt="Venticelli"
            className="mx-auto h-20 w-20 rounded-lg bg-white object-contain p-1 shadow-sm"
          />
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
