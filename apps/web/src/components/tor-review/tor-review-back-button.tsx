'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export function TorReviewBackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="text-primary hover:text-primary focus-visible:ring-ring/50 relative inline-flex min-h-10 -translate-y-2 cursor-pointer items-center gap-2 rounded-lg px-0 text-sm font-medium transition-colors outline-none before:absolute before:-inset-x-3 before:-inset-y-0.5 before:rounded-lg before:bg-transparent hover:before:bg-primary/10 focus-visible:ring-3"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      ย้อนกลับ
    </button>
  );
}
