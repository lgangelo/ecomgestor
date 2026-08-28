import { redirect } from 'next/navigation';
import { apiServerFetch } from '@/lib/api-server';
import type { SessionUser } from '@/lib/types/auth';
import { AppShell } from '@/components/layout/app-shell';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await apiServerFetch<{ user: SessionUser }>('/auth/me');
  if (!session?.user) redirect('/login');

  return <AppShell user={session.user}>{children}</AppShell>;
}
