'use client';

import { type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { api_url as apiUrl } from '@/lib/config';

export default function RegisterPage() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [companyName, setCompanyName] = useState('');

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
          company_name: companyName,
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
    <main className="bg-background flex flex-1 items-center justify-center px-6 py-10">
      <div className="bg-card w-full max-w-md rounded-2xl p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-foreground text-3xl font-bold tracking-tight">สร้างบัญชีผู้ใช้</h1>

          <p className="text-muted-foreground mt-2 text-sm">
            เริ่มต้นค้นหาโอกาสงานจัดซื้อจัดจ้างกับ Torfun
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="firstName" className="text-foreground mb-2 block text-sm font-medium">
                ชื่อ
              </Label>

              <Input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                required
                maxLength={100}
                className="border-border min-h-12 w-full rounded-lg border px-4 py-3 transition outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
                placeholder="ชื่อ"
              />
            </div>

            <div>
              <Label htmlFor="lastName" className="text-foreground mb-2 block text-sm font-medium">
                นามสกุล
              </Label>

              <Input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                required
                maxLength={100}
                className="border-border min-h-12 w-full rounded-lg border px-4 py-3 transition outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
                placeholder="นามสกุล"
              />
            </div>
          </div>

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
              minLength={3}
              maxLength={50}
              className="border-border min-h-12 w-full rounded-lg border px-4 py-3 transition outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
              placeholder="ตั้งชื่อผู้ใช้"
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
              minLength={8}
              maxLength={128}
              className="border-border min-h-12 w-full rounded-lg border px-4 py-3 transition outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
              placeholder="ตั้งรหัสผ่าน"
            />

            <p className="text-muted-foreground mt-1 text-xs">ต้องมีอย่างน้อย 8 ตัวอักษร</p>
          </div>

          <div>
            <Label
              htmlFor="confirmPassword"
              className="text-foreground mb-2 block text-sm font-medium"
            >
              ยืนยันรหัสผ่าน
            </Label>

            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={8}
              maxLength={128}
              className="border-border min-h-12 w-full rounded-lg border px-4 py-3 transition outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
              placeholder="กรอกรหัสผ่านอีกครั้ง"
            />
          </div>

          <div>
            <Label htmlFor="companyName" className="text-foreground mb-2 block text-sm font-medium">
              ชื่อบริษัท / ธุรกิจ
            </Label>

            <Input
              id="companyName"
              type="text"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              required
              maxLength={200}
              className="border-border min-h-12 w-full rounded-lg border px-4 py-3 transition outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
              placeholder="กรอกชื่อบริษัท"
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
            {loading ? 'กำลังสร้างบัญชี…' : 'สร้างบัญชีผู้ใช้'}
          </Button>
        </form>

        <p className="text-muted-foreground mt-6 text-center text-sm">
          มีบัญชีผู้ใช้อยู่แล้ว?{' '}
          <Link href="/login" className="text-foreground font-medium hover:underline">
            เข้าสู่ระบบ
          </Link>
        </p>
      </div>
    </main>
  );
}
