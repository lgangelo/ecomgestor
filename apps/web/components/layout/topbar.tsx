'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Menu, Moon, Sun, LogOut, User as UserIcon } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import type { SessionUser } from '@/lib/types/auth';
import { cn } from '@/lib/utils';

export function Topbar({
  user,
  onMenuClick,
}: {
  user: SessionUser;
  onMenuClick: () => void;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  async function handleLogout() {
    await apiFetch('/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-md p-2 text-muted-foreground hover:bg-accent lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="hidden lg:block" />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="rounded-md p-2 text-muted-foreground hover:bg-accent"
          aria-label="Alternar tema"
        >
          {mounted && resolvedTheme === 'dark' ? (
            <Sun className="h-4.5 w-4.5" />
          ) : (
            <Moon className="h-4.5 w-4.5" />
          )}
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UserIcon className="h-4 w-4" />
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium leading-tight">
                {user.name ?? user.email}
              </span>
              <span className="block text-xs leading-tight text-muted-foreground">
                {user.roles.join(', ')}
              </span>
            </span>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div
                className={cn(
                  'absolute right-0 top-full z-20 mt-2 w-48 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md',
                )}
              >
                <div className="px-2 py-1.5 text-xs text-muted-foreground">{user.email}</div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <LogOut className="h-4 w-4" />
                  Sair
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
