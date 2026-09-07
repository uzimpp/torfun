import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-medium text-gray-400">404</p>

        <h1 className="mt-2 text-xl font-semibold text-gray-900">ไม่พบหน้าที่ต้องการ</h1>

        <Link
          href="/"
          className="mt-6 inline-block rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          กลับหน้าแรก
        </Link>
      </div>
    </main>
  );
}
