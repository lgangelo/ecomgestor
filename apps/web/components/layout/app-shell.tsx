'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { SidebarNav } from './sidebar-nav';
import { Topbar } from './topbar';
import type { SessionUser } from '@/lib/types/auth';
import { cn } from '@/lib/utils';

export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Sidebar desktop */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-background lg:flex">
        <SidebarBrand />
        <SidebarNav permissions={user.permissions} />
      </aside>

      {/* Sidebar mobile (overlay) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-50 flex h-full w-64 flex-col bg-background shadow-xl">
            <div className="flex items-center justify-between">
              <SidebarBrand />
              <button
                type="button"
                className="mr-3 rounded-md p-2 text-muted-foreground hover:bg-accent"
                onClick={() => setMobileOpen(false)}
                aria-label="Fechar menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarNav permissions={user.permissions} />
          </aside>
        </div>
      )}

      <div className={cn('flex min-w-0 flex-1 flex-col')}>
        <Topbar user={user} onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function SidebarBrand() {
  return (
    <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
        E
      </span>
      <span className="text-sm font-semibold tracking-tight">E-commerce Manager</span>
    </div>
  );
}
