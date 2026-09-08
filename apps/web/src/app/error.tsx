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
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">เกิดข้อผิดพลาด</h1>

        <p className="mt-2 text-sm text-gray-500">
          ระบบไม่สามารถแสดงหน้านี้ได้ กรุณาลองใหม่อีกครั้ง
        </p>

        {error.digest ? (
          <code className="mt-4 block text-xs text-gray-400">{error.digest}</code>
        ) : null}

        <button
          type="button"
          onClick={reset}
          className="mt-6 w-full rounded-lg bg-gray-900 px-4 py-3 font-medium text-white transition hover:bg-gray-800"
        >
          ลองอีกครั้ง
        </button>
      </div>
    </main>
  );
}
