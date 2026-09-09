'use client';

import { type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { FlowShell } from '@/components/onboarding/flow-shell';
import { FlowField, FlowError } from '@/components/onboarding/field';
import { GoogleButton, OrDivider } from '@/components/onboarding/google-button';
import { FLOW_ACTION } from '@/components/onboarding/controls';
import { cn } from '@/lib/utils';
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
    // No step: signing in is not a stage of registration, and showing a progress
    // bar to a returning officer would claim otherwise.
    <FlowShell
      title="ยินดีต้อนรับสู่ Torfun"
      description="กรอกข้อมูลของคุณเพื่อเข้าสู่ระบบ"
      footer={
        <>
          ยังไม่มีบัญชีผู้ใช้?{' '}
          <Link href="/register" className="text-primary font-medium hover:underline">
            สร้างบัญชีผู้ใช้
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid gap-5">
        <FlowField
          id="username"
          label="ชื่อผู้ใช้"
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
          placeholder="กรอกชื่อผู้ใช้"
        />

        <FlowField
          id="password"
          label="รหัสผ่าน"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          placeholder="กรอกรหัสผ่าน"
        />

        {error && <FlowError>{error}</FlowError>}

        <Button type="submit" disabled={loading} className={cn(FLOW_ACTION, 'w-full font-medium')}>
          {loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
        </Button>
      </form>

      <OrDivider />

      <GoogleButton intent="signin" />

      <p className="text-muted-foreground mt-3 text-center text-xs leading-relaxed">
        ใช้ Google ครั้งแรกจะสร้างบัญชีให้อัตโนมัติ
      </p>
    </FlowShell>
  );
}
