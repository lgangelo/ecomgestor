'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { AuditLogItem } from '@/hooks/use-audit';

export function AuditLogDetailDialog({ log, trigger }: { log: AuditLogItem; trigger: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {log.action} · {log.entity}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Valor anterior</p>
            <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
              {log.oldValue ? JSON.stringify(log.oldValue, null, 2) : '—'}
            </pre>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Valor novo</p>
            <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
              {log.newValue ? JSON.stringify(log.newValue, null, 2) : '—'}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
