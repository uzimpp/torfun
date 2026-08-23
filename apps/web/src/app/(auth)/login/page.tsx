'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';

export default function LoginPage() {
  const [submitted, setSubmitted] = useState(false);
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#f6f7fb] p-5">
      <section className="w-full max-w-md rounded-2xl border border-[#e1e5ed] bg-white p-7 shadow-[0_18px_45px_rgba(31,41,66,0.1)] sm:p-9">
        <Link href="/" className="flex items-center gap-3 font-medium text-[#111827]">
          <span className="grid size-10 place-items-center rounded-xl bg-[#1f2942] text-lg text-white">
            T
          </span>
          <span className="text-lg">TORFUN</span>
        </Link>
        <div className="mt-9">
          <span className="grid size-10 place-items-center rounded-xl bg-[#edf1f8] text-[#445a7b]">
            <LockKeyhole className="size-5" />
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-[-0.03em]">เข้าสู่ระบบ</h1>
          <p className="mt-2 text-sm leading-6 text-[#68758a]">
            ใช้บัญชีบริษัทเพื่อดู TOR ที่เหมาะกับความเชี่ยวชาญของคุณ
          </p>
        </div>
        <form
          className="mt-7 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
          }}
        >
          <label className="grid gap-2 text-sm font-medium">
            อีเมล
            <input
              type="email"
              required
              autoComplete="email"
              className="h-11 rounded-lg border border-[#d7dce5] px-3 outline-none focus:border-[#3974d8] focus:ring-3 focus:ring-[#3974d8]/15"
              placeholder="name@company.co.th"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            รหัสผ่าน
            <input
              type="password"
              required
              autoComplete="current-password"
              className="h-11 rounded-lg border border-[#d7dce5] px-3 outline-none focus:border-[#3974d8] focus:ring-3 focus:ring-[#3974d8]/15"
            />
          </label>
          {submitted && (
            <p role="status" className="rounded-lg bg-[#eef6ff] p-3 text-sm text-[#2b5d9b]">
              การเข้าสู่ระบบจะเชื่อมต่อเมื่อ API พร้อมใช้งาน
            </p>
          )}
          <button
            className="mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#202b45] px-4 text-sm font-medium text-white transition hover:bg-[#2d3a59] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3974d8] active:translate-y-px"
            type="submit"
          >
            เข้าสู่ระบบ <ArrowRight className="size-4" />
          </button>
        </form>
      </section>
    </main>
  );
}
