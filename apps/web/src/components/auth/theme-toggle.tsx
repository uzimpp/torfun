'use client';

import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The light/dark switch.
 *
 * `withLabel` is for the footer, where the control sits among links rather than
 * icons and a bare glyph would read as decoration. The icon-only form is kept
 * for the mobile sheet, where the row is already labelled.
 */
export function ThemeToggle({
  initialTheme,
  withLabel = false,
}: {
  initialTheme: 'light' | 'dark';
  withLabel?: boolean;
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
