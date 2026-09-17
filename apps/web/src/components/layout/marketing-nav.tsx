'use client';

import { usePathname } from 'next/navigation';

import { landingSections } from './nav-config';

/**
 * In-page jumps to the landing page's own sections.
 *
 * They render only on the landing page, because that is the only place the
 * targets exist — an anchor offered from `/search` would be a link that
 * silently does nothing.
 */
export function MarketingNav({
  onNavigate,
  className = 'hidden items-center gap-7 lg:flex',
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  if (pathname !== '/') return null;

  return (
    <nav aria-label="ส่วนต่าง ๆ ของหน้าแรก" className={className}>
      {landingSections.map(({ href, label }) => (
        <a
          key={href}
          href={href}
          onClick={onNavigate}
          className="text-muted-foreground hover:text-foreground focus-visible:outline-ring relative rounded-md px-1 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
