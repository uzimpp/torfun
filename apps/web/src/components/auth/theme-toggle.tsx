'use client';

import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The light/dark switch.
 *
 * `withLabel` is for the footer, where the control sits among links rather than
 * icons and a bare glyph would read as decoration. `onDarkSurface` goes with
 * it: the footer is a saturated slab, and the stock outline button paints
 * itself in the page background, which on that slab is a white pill.
 */
export function ThemeToggle({
  initialTheme,
  withLabel = false,
  onDarkSurface = false,
}: {
  initialTheme: 'light' | 'dark';
  withLabel?: boolean;
  onDarkSurface?: boolean;
}) {
  const [theme, setTheme] = useState(initialTheme);
  const label = theme === 'dark' ? 'สลับโหมดกลางวัน' : 'สลับโหมดกลางคืน';

  function toggleTheme() {
    const nextTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    document.documentElement.classList.toggle('light', nextTheme === 'light');
    document.cookie = `torfun-theme=${nextTheme}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    setTheme(nextTheme);
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        'rounded-xl',
        withLabel ? 'min-h-11 gap-2 px-3 text-sm font-normal' : 'size-10',
        onDarkSurface &&
          'border-current/25 bg-current/10 text-current hover:bg-current/20 focus-visible:ring-current/40 dark:bg-current/10 dark:hover:bg-current/20',
      )}
      title={label}
      aria-label={label}
      onClick={toggleTheme}
    >
      {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      {withLabel && (
        <span aria-hidden="true">{theme === 'dark' ? 'โหมดกลางวัน' : 'โหมดกลางคืน'}</span>
      )}
    </Button>
  );
}
