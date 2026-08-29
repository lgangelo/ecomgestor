'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { NOTIFICATION_CATEGORY_PRESENTATION } from '@ecommerce-manager/ui';
import { formatDate } from '@/lib/format';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
  type Notification,
} from '@/hooks/use-notifications';

type Tab = 'unread' | 'all';

/** Central de notificações no header (seções 41-44 da Fase 4) — dedup e reconciliação já
 * acontecem no backend; aqui só lista, marca como lida e navega. */
export function NotificationBell() {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>('unread');

  const { data: unreadCount } = useUnreadNotificationCount();
  const { data: notifications, isLoading } = useNotifications(tab === 'unread');
  const markAsRead = useMarkNotificationRead();
  const markAllAsRead = useMarkAllNotificationsRead();

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleItemClick(notification: Notification) {
    if (!notification.readAt) markAsRead.mutate(notification.id);
    setOpen(false);
  }

  const count = unreadCount?.count ?? 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-2 text-muted-foreground hover:bg-accent"
        aria-label="Notificações"
      >
        <Bell className="h-4.5 w-4.5" />
        {count > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-96 rounded-md border border-border bg-popover text-popover-foreground shadow-md">
          <div className="flex items-center justify-between border-b border-border p-2">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setTab('unread')}
                className={`rounded-md px-2 py-1 text-xs font-medium ${tab === 'unread' ? 'bg-accent' : 'text-muted-foreground hover:bg-accent'}`}
              >
                Não lidas
              </button>
              <button
                type="button"
                onClick={() => setTab('all')}
                className={`rounded-md px-2 py-1 text-xs font-medium ${tab === 'all' ? 'bg-accent' : 'text-muted-foreground hover:bg-accent'}`}
              >
                Todas
              </button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={count === 0 || markAllAsRead.isPending}
              onClick={() => markAllAsRead.mutate()}
            >
              Marcar todas como lidas
            </Button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <p className="p-4 text-center text-sm text-muted-foreground">Carregando...</p>
            ) : !notifications || notifications.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                {tab === 'unread' ? 'Nenhuma notificação não lida.' : 'Nenhuma notificação.'}
              </p>
            ) : (
              notifications.map((notification) => (
                <Link
                  key={notification.id}
                  href={notification.link ?? '#'}
                  onClick={() => handleItemClick(notification)}
                  className={`block border-b border-border p-3 text-sm hover:bg-accent last:border-b-0 ${
                    notification.readAt ? 'opacity-70' : ''
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <StatusBadge status={notification.category} map={NOTIFICATION_CATEGORY_PRESENTATION} />
                    {!notification.readAt && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                    <span className="ml-auto text-xs text-muted-foreground">{formatDate(notification.createdAt, true)}</span>
                  </div>
                  <p className="font-medium text-foreground">{notification.title}</p>
                  <p className="text-xs text-muted-foreground">{notification.message}</p>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
