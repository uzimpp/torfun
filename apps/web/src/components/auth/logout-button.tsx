'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { api_url as apiUrl } from '@/lib/config';

export function LogoutButton({ menuItem = false }: { menuItem?: boolean }) {
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
          className="min-h-11"
          onClick={handleLogout}
          disabled={loading}
        >
          {loading ? 'กำลังออกจากระบบ…' : 'ออกจากระบบ'}
        </DropdownMenuItem>
      ) : (
        <Button variant="outline" className="min-h-11" onClick={handleLogout} disabled={loading}>
          {loading ? 'กำลังออกจากระบบ…' : 'ออกจากระบบ'}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-destructive mt-2 max-w-48 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
