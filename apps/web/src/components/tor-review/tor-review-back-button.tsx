'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export function TorReviewBackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="text-primary hover:bg-primary/10 hover:text-primary focus-visible:ring-ring/50 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      กลับไปหน้าก่อนหน้า
    </button>
  );
}
