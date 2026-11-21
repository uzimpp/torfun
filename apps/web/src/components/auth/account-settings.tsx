'use client';

import { ChangePasswordSchema, UpdateProfileSchema } from '@torfun/types';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { FlowError, FlowField } from '@/components/onboarding/field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { ApiError, SessionEndedError, changePassword, updateProfile } from '@/lib/api';
import type { CurrentUser } from '@/lib/auth';

type SettingsUser = Pick<
  CurrentUser,
  'username' | 'first_name' | 'last_name' | 'has_local_password'
>;

export function AccountSettings({ user }: { user: SettingsUser }) {
  return (
    <div className="mt-8 space-y-6">
      <Card>
        <CardHeader>
          <h2 className="font-heading text-base font-medium">ข้อมูลส่วนตัว</h2>
          <CardDescription className="break-all">ชื่อผู้ใช้ {user.username}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm user={user} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-heading text-base font-medium">เปลี่ยนรหัสผ่าน</h2>
          <CardDescription>
            {user.has_local_password
              ? 'ยืนยันรหัสผ่านปัจจุบันก่อนตั้งรหัสผ่านใหม่'
              : 'บัญชีนี้เข้าสู่ระบบผ่าน Google คุณสามารถจัดการรหัสผ่านได้ในบัญชี Google'}
          </CardDescription>
        </CardHeader>
        {user.has_local_password && (
          <CardContent>
            <PasswordForm />
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function ProfileForm({ user }: { user: Pick<SettingsUser, 'first_name' | 'last_name'> }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const parsed = UpdateProfileSchema.safeParse(Object.fromEntries(fields));
    setSaved(false);
    setError('');
    if (!parsed.success) {
      setError('กรุณากรอกชื่อ และใช้ชื่อและนามสกุลไม่เกินช่องละ 100 ตัวอักษร');
      return;
    }

    setPending(true);
    try {
      await updateProfile(parsed.data);
      setSaved(true);
      router.refresh();
    } catch (cause) {
      if (cause instanceof SessionEndedError) router.replace('/login');
      else setError('บันทึกข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setPending(false);
    }
  }

  return (
    <form method="post" onSubmit={submit} onChange={() => setSaved(false)} className="space-y-4">
      <FlowField
        id="first_name"
        name="first_name"
        label="ชื่อ"
        defaultValue={user.first_name}
        autoComplete="given-name"
        maxLength={100}
        readOnly={pending}
        required
      />
      <FlowField
        id="last_name"
        name="last_name"
        label="นามสกุล"
        defaultValue={user.last_name}
        autoComplete="family-name"
        maxLength={100}
        readOnly={pending}
      />
      {error && <FlowError>{error}</FlowError>}
      {saved && (
        <p role="status" className="text-sm">
          บันทึกข้อมูลส่วนตัวแล้ว
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'กำลังบันทึก…' : 'บันทึกข้อมูลส่วนตัว'}
      </Button>
    </form>
  );
}

function PasswordForm() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const parsed = ChangePasswordSchema.safeParse({
      current_password: fields.get('current_password'),
      new_password: fields.get('new_password'),
    });
    setSaved(false);
    setError('');
    if (!parsed.success) {
      setError('กรุณาตรวจสอบรหัสผ่านปัจจุบันและความยาวของรหัสผ่านใหม่');
      return;
    }
    if (parsed.data.new_password !== fields.get('confirm_password')) {
      setError('รหัสผ่านใหม่และการยืนยันไม่ตรงกัน');
      return;
    }

    setPending(true);
    try {
      await changePassword(parsed.data);
      form.reset();
      setVisible(false);
      setSaved(true);
    } catch (cause) {
      if (cause instanceof SessionEndedError) router.replace('/login');
      else if (cause instanceof ApiError && cause.status === 400)
        setError('รหัสผ่านปัจจุบันไม่ถูกต้อง');
      else if (cause instanceof ApiError && cause.status === 429)
        setError('ลองหลายครั้งเกินไป กรุณารอสักครู่แล้วลองอีกครั้ง');
      else setError('เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setPending(false);
    }
  }

  const type = visible ? 'text' : 'password';
  return (
    <form method="post" onSubmit={submit} onChange={() => setSaved(false)} className="space-y-4">
      <FlowField
        id="current_password"
        name="current_password"
        label="รหัสผ่านปัจจุบัน"
        type={type}
        autoComplete="current-password"
        maxLength={128}
        readOnly={pending}
        required
      />
      <FlowField
        id="new_password"
        name="new_password"
        label="รหัสผ่านใหม่"
        hint="อย่างน้อย 8 ตัวอักษร และไม่เกิน 72 ไบต์"
        type={type}
        autoComplete="new-password"
        minLength={8}
        maxLength={72}
        readOnly={pending}
        required
      />
      <FlowField
        id="confirm_password"
        name="confirm_password"
        label="ยืนยันรหัสผ่านใหม่"
        type={type}
        autoComplete="new-password"
        minLength={8}
        maxLength={72}
        readOnly={pending}
        required
      />
      {error && <FlowError>{error}</FlowError>}
      {saved && (
        <p role="status" className="text-sm">
          เปลี่ยนรหัสผ่านแล้ว
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'กำลังเปลี่ยน…' : 'เปลี่ยนรหัสผ่าน'}
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          แสดงรหัสผ่าน
        </Button>
      </div>
    </form>
  );
}
