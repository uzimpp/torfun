import Link from 'next/link';
import { ScanLine } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The wordmark, and the only element that appears in the header, the footer and
 * the sign-in flow alike.
 *
 * `href` differs by context — the header sends a signed-in officer to their
 * workspace, the footer always goes home — while the name stays plain
 * "Torfun" everywhere, so a screen reader announces one recognisable landmark
 * rather than three variations on it.
 */
export function Brand({
  href = '/',
  size = 'md',
  className,
}: {
  href?: '/' | '/dashboard';
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="Torfun"
      className={cn(
        'text-foreground focus-visible:outline-ring group inline-flex items-center gap-2.5',
        'rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'bg-primary text-primary-foreground grid place-items-center rounded-lg',
          'transition-transform duration-300 ease-out group-hover:-rotate-6',
          size === 'md' ? 'size-8' : 'size-7',
        )}
      >
        <ScanLine className={size === 'md' ? 'size-5' : 'size-4'} />
      </span>
      <span
        aria-hidden="true"
        className={cn('font-semibold tracking-tighter', size === 'md' ? 'text-xl' : 'text-lg')}
      >
        Torfun
      </span>
    </Link>
  );
}
