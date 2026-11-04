'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export function TorReviewBackButton() {
  const router = useRouter();

  function goBack() {
    const returnTo = new URLSearchParams(window.location.search).get('returnTo');
    if (returnTo?.startsWith('/search')) {
      const destination = new URL(returnTo, window.location.origin);
      if (destination.origin === window.location.origin && destination.pathname === '/search') {
        router.replace(`${destination.pathname}${destination.search}${destination.hash}`);
        return;
      }
    }
    router.back();
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="text-primary hover:text-primary focus-visible:ring-ring/50 hover:before:bg-primary/10 relative inline-flex min-h-10 -translate-y-2 cursor-pointer items-center gap-2 rounded-lg px-0 text-sm font-medium transition-colors outline-none before:absolute before:-inset-x-3 before:-inset-y-0.5 before:rounded-lg before:bg-transparent focus-visible:ring-3"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      ย้อนกลับ
    </button>
  );
}
