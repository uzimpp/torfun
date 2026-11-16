import Link from 'next/link';
import { AlertTriangle, LogIn, RotateCw } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import type { LoadError, LoadErrorKind } from '@/lib/api-errors';
import { cn } from '@/lib/utils';

const TITLES: Record<LoadErrorKind, string> = {
  unreachable: 'เชื่อมต่อ API ไม่สำเร็จ',
  broken: 'โหลดข้อมูลไม่สำเร็จ',
  sessionEnded: 'เซสชันหมดอายุ',
};

/**
 * An inline row for a failed read. An ended session offers sign-in instead of a
 * retry, since retrying would only repeat the refusal.
 */
export function AdminLoadError({
  error,
  onRetry,
  title,
  className,
}: {
  error: LoadError;
  onRetry?: () => void;
  /** Replaces the headline, e.g. for a refused action; an ended session keeps its own. */
  title?: string;
  className?: string;
}) {
  const ended = error.kind === 'sessionEnded';
  const headline = ended ? TITLES.sessionEnded : (title ?? TITLES[error.kind]);

  return (
    <div
      role="alert"
      className={cn(
        'border-destructive flex flex-wrap items-center gap-x-4 gap-y-2 border-l-[3px] py-2 pl-4',
        className,
      )}
    >
      <AlertTriangle className="text-destructive size-4 shrink-0" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-destructive text-sm font-medium">{headline}</p>
        {error.message !== headline ? (
          <p className="text-muted-foreground text-sm break-words">{error.message}</p>
        ) : null}
      </div>
      {ended ? (
        <Link href="/login" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
          <LogIn className="size-4" aria-hidden="true" />
          เข้าสู่ระบบอีกครั้ง
        </Link>
      ) : onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw className="size-4" aria-hidden="true" />
          ลองอีกครั้ง
        </Button>
      ) : null}
    </div>
  );
}
