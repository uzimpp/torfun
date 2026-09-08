'use client';

import { type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { api_url as apiUrl } from '@/lib/config';

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message ?? 'เข้าสู่ระบบไม่สำเร็จ');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="bg-background flex flex-1 items-center justify-center px-6 py-10">
      <div className="bg-card w-full max-w-md rounded-2xl p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-foreground text-3xl font-bold tracking-tight">Torfun</h1>

          <p className="text-muted-foreground mt-2 text-sm">ระบบค้นหาและคัดกรองประกาศ TOR</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label htmlFor="username" className="text-foreground mb-2 block text-sm font-medium">
              ชื่อผู้ใช้
            </Label>

            <Input
              id="username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              className="border-border min-h-12 w-full rounded-lg border px-4 py-3 transition outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
              placeholder="กรอกชื่อผู้ใช้"
            />
          </div>

          <div>
            <Label htmlFor="password" className="text-foreground mb-2 block text-sm font-medium">
              รหัสผ่าน
            </Label>

            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="border-border min-h-12 w-full rounded-lg border px-4 py-3 transition outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
              placeholder="กรอกรหัสผ่าน"
            />
          </div>

          {error && (
            <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="bg-primary text-primary-foreground hover:bg-primary/90 min-h-12 w-full rounded-lg px-4 py-3 font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-4">
          <div className="bg-border h-px flex-1" />
          <span className="text-muted-foreground text-sm">หรือ</span>
          <div className="bg-border h-px flex-1" />
        </div>

        <Button
          type="button"
          onClick={() => {
            window.location.assign(new URL('/api/auth/google', apiUrl).toString());
          }}
          className="border-border text-foreground hover:bg-background min-h-12 w-full rounded-lg border px-4 py-3 font-medium transition"
        >
          เข้าสู่ระบบด้วย Google
        </Button>

        <p className="text-muted-foreground mt-6 text-center text-sm">
          ยังไม่มีบัญชีผู้ใช้?{' '}
          <Link href="/register" className="text-foreground font-medium hover:underline">
            สร้างบัญชีผู้ใช้
          </Link>
        </p>
      </div>
    </main>
  );
}
