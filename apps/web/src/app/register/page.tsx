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

export default function RegisterPage() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError('');

    if (password !== confirmPassword) {
      setError('รหัสผ่านไม่ตรงกัน');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${apiUrl}/api/auth/register`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
          confirm_password: confirmPassword,
          first_name: firstName,
          last_name: lastName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message ?? 'สร้างบัญชีไม่สำเร็จ');
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
    <FlowShell
      step="account"
      title="สร้างบัญชีผู้ใช้"
      description="เริ่มต้นค้นหาโอกาสงานจัดซื้อจัดจ้างกับ Torfun"
      footer={
        <>
          มีบัญชีผู้ใช้อยู่แล้ว?{' '}
          <Link href="/login" className="text-primary font-medium hover:underline">
            เข้าสู่ระบบ
          </Link>
        </>
      }
    >
      {/* Google first: it is one click against five fields, and burying it under
          the form is what made people miss that it exists at all. */}
      <GoogleButton intent="signup" />

      <OrDivider label="หรือกรอกข้อมูลเอง" />

      <form onSubmit={handleSubmit} className="grid gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <FlowField
            id="firstName"
            label="ชื่อ"
            type="text"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            required
            maxLength={100}
            placeholder="ชื่อ"
          />

          <FlowField
            id="lastName"
            label="นามสกุล"
            type="text"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            required
            maxLength={100}
            placeholder="นามสกุล"
          />
        </div>

        <FlowField
          id="username"
          label="ชื่อผู้ใช้"
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
          minLength={3}
          maxLength={50}
          placeholder="ตั้งชื่อผู้ใช้"
        />

        <FlowField
          id="password"
          label="รหัสผ่าน"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
          maxLength={128}
          placeholder="ตั้งรหัสผ่าน"
          hint="ต้องมีอย่างน้อย 8 ตัวอักษร"
        />

        <FlowField
          id="confirmPassword"
          label="ยืนยันรหัสผ่าน"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          minLength={8}
          maxLength={128}
          placeholder="กรอกรหัสผ่านอีกครั้ง"
        />

        {error && <FlowError>{error}</FlowError>}

        <Button type="submit" disabled={loading} className={cn(FLOW_ACTION, 'w-full font-medium')}>
          {loading ? 'กำลังสร้างบัญชี…' : 'สร้างบัญชีผู้ใช้'}
        </Button>
      </form>
    </FlowShell>
  );
}
