'use client';

import { useEffect } from 'react';

/**
 * Route-level error boundary. Next requires this to be a client component.
 *
 * The thrown error's message is not rendered: in production Next replaces it
 * with a generic string anyway, and in development showing it here just
 * duplicates the overlay. `digest` is what correlates a report with the server
 * log, so that is what a user can usefully quote.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="page-fill bg-background flex flex-1 items-center justify-center px-6 py-12">
      <div className="bg-card w-full max-w-md rounded-2xl p-8 text-center shadow-sm">
        <h1 className="text-foreground text-xl font-semibold">เกิดข้อผิดพลาด</h1>

        <p className="text-muted-foreground mt-2 text-sm">
          ระบบไม่สามารถแสดงหน้านี้ได้ กรุณาลองใหม่อีกครั้ง
        </p>

        {error.digest ? (
          <code className="text-muted-foreground mt-4 block text-xs">{error.digest}</code>
        ) : null}

        <button
          type="button"
          onClick={reset}
          className="bg-primary text-primary-foreground hover:bg-primary/90 mt-6 w-full rounded-lg px-4 py-3 font-medium transition"
        >
          ลองอีกครั้ง
        </button>
      </div>
    </main>
  );
}
