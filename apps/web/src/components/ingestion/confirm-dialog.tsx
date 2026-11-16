'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { LogIn, type LucideIcon } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { AdminAction } from './use-admin-action';

/**
 * The one confirmation every administrator action goes through. The dialog
 * primitive traps focus, returns it to what opened it and closes on Escape; this
 * adds the rest: a title that names the dialog, the request's pending state
 * (nothing can be sent twice or dismissed mid-flight), its error as an alert,
 * and — when the session has ended — a sign-in link in place of a pointless retry.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  confirmIcon: ConfirmIcon,
  destructive = false,
  action,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  confirmIcon?: LucideIcon;
  destructive?: boolean;
  action: Pick<AdminAction, 'pending' | 'error' | 'sessionEnded'>;
  onConfirm: () => void;
  onCancel: () => void;
  /** Extra controls, such as the delete dialog's choice, between the text and the buttons. */
  children?: ReactNode;
}) {
  const { pending, error, sessionEnded } = action;
  return (
    <Dialog open onOpenChange={(open) => (!open && !pending ? onCancel() : undefined)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onCancel}>
            ยกเลิก
          </Button>
          {sessionEnded ? (
            <Link href="/login" className={cn(buttonVariants())}>
              <LogIn className="size-4" aria-hidden="true" />
              เข้าสู่ระบบอีกครั้ง
            </Link>
          ) : (
            <Button
              variant={destructive ? 'destructive' : 'default'}
              disabled={pending}
              aria-busy={pending || undefined}
              onClick={onConfirm}
            >
              {ConfirmIcon ? <ConfirmIcon className="size-4" aria-hidden="true" /> : null}
              {pending ? 'กำลังดำเนินการ…' : confirmLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
