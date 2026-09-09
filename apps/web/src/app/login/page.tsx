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
    <main className="landing-grid bg-background flex flex-1 items-center justify-center px-6 py-10">
      <div className="bg-card border-border w-full max-w-md rounded-2xl border p-8 shadow-sm">
        <div className="mb-8">
          <h1 className="text-foreground text-3xl font-semibold tracking-tight">
            ยินดีต้อนรับสู่ Torfun
          </h1>

          <p className="text-muted-foreground mt-2 text-sm">กรอกข้อมูลของคุณเพื่อเข้าสู่ระบบ</p>
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
              className="border-border focus:border-ring focus:ring-ring/30 min-h-12 w-full rounded-lg border px-4 py-3 transition outline-none focus:ring-2"
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
              className="border-border focus:border-ring focus:ring-ring/30 min-h-12 w-full rounded-lg border px-4 py-3 transition outline-none focus:ring-2"
              placeholder="กรอกรหัสผ่าน"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="bg-destructive/10 text-destructive rounded-lg px-4 py-3 text-sm"
            >
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
          variant="outline"
          className="border-border hover:bg-muted min-h-12 w-full gap-3 rounded-lg px-4 py-3 font-medium transition"
        >
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 24 24"
            className="size-5"
            fill="currentColor"
          >
            <path d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36ZM12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22ZM6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.07a10 10 0 0 0 0 9.02l3.34-2.59ZM12 5.96c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59C7.2 7.72 9.4 5.96 12 5.96Z" />
          </svg>
          เข้าสู่ระบบด้วย Google
        </Button>

        <p className="text-muted-foreground mt-6 text-center text-sm">
          ยังไม่มีบัญชีผู้ใช้?{' '}
          <Link href="/register" className="text-primary font-medium hover:underline">
            สร้างบัญชีผู้ใช้
          </Link>
        </p>
      </div>
    </main>
  );
}
