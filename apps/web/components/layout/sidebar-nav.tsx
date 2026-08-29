'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { NAV_GROUPS, type NavGroup } from '@/lib/nav-config';
import { cn } from '@/lib/utils';

function hasPermission(permissions: string[], required?: string): boolean {
  if (!required) return true;
  return permissions.includes(required);
}

/**
 * Um grupo aparece se o usuário tem a permissão do próprio grupo OU a de pelo menos um item
 * dentro dele — nunca esconder um item cuja permissão o usuário JÁ tem só porque o grupo como um
 * todo também exige outra permissão mais ampla (bug encontrado ao adicionar "Jobs" em
 * Configurações, seção 61 da Fase 4: um MANAGER com `integration.jobs.read`/`audit.read` mas sem
 * `settings.manage` nunca via "Auditoria" nem veria "Jobs").
 */
function isGroupVisible(group: NavGroup, permissions: string[]): boolean {
  if (hasPermission(permissions, group.permission)) return true;
  return (group.items ?? []).some((item) => hasPermission(permissions, item.permission));
}

function GroupLink({ group, active }: { group: NavGroup; active: boolean }) {
  return (
    <Link
      href={group.href!}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <group.icon className="h-4 w-4 shrink-0" />
      {group.label}
    </Link>
  );
}

function CollapsibleGroup({
  group,
  permissions,
  pathname,
}: {
  group: NavGroup;
  permissions: string[];
  pathname: string;
}) {
  const items = (group.items ?? []).filter((item) => hasPermission(permissions, item.permission));
  const isActiveGroup = items.some((item) => pathname === item.href);
  const [open, setOpen] = React.useState(isActiveGroup);

  React.useEffect(() => {
    if (isActiveGroup) setOpen(true);
  }, [isActiveGroup]);

  if (items.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActiveGroup
            ? 'text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        )}
      >
        <span className="flex items-center gap-3">
          <group.icon className="h-4 w-4 shrink-0" />
          {group.label}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="ml-3.5 mt-1 space-y-0.5 border-l border-border pl-3.5">
          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'block rounded-md px-2.5 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SidebarNav({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-4">
      {NAV_GROUPS.filter((g) => isGroupVisible(g, permissions)).map((group) =>
        group.href ? (
          <GroupLink key={group.label} group={group} active={pathname === group.href} />
        ) : (
          <CollapsibleGroup
            key={group.label}
            group={group}
            permissions={permissions}
            pathname={pathname}
          />
        ),
      )}
    </nav>
  );
}
