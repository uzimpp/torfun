'use client';

import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ThemeToggle({ initialTheme }: { initialTheme: 'light' | 'dark' }) {
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
      variant="ghost"
      className="size-10"
      title={label}
      aria-label={label}
      onClick={toggleTheme}
    >
      {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}
