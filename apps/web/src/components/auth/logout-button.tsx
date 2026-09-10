'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { api_url as apiUrl } from '@/lib/config';

/**
 * `className` carries the account menu's row shape in from the menu itself, so
 * this row is inset and spaced exactly like the ones above it rather than
 * keeping a second copy of those numbers here.
 */
export function LogoutButton({
  menuItem = false,
  className,
}: {
  menuItem?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function handleLogout() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${apiUrl}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        setError('ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง');
        return;
      }
      router.push('/login');
      router.refresh();
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองอีกครั้ง');
    } finally {
      setLoading(false);
    }
  }
  return (
    <div>
      {menuItem ? (
        <DropdownMenuItem
          closeOnClick={false}
          className={className}
          onClick={handleLogout}
          disabled={loading}
        >
          <LogOut aria-hidden="true" className="size-4" />
          {loading ? 'กำลังออกจากระบบ…' : 'ออกจากระบบ'}
        </DropdownMenuItem>
      ) : (
        <Button variant="outline" className="min-h-11" onClick={handleLogout} disabled={loading}>
          {loading ? 'กำลังออกจากระบบ…' : 'ออกจากระบบ'}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-destructive mt-2 px-3 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
