import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="bg-background flex flex-1 items-center justify-center px-6 py-12">
      <div className="bg-card w-full max-w-md rounded-2xl p-8 text-center shadow-sm">
        <p className="text-muted-foreground text-sm font-medium">404</p>

        <h1 className="text-foreground mt-2 text-xl font-semibold">ไม่พบหน้าที่ต้องการ</h1>

        <Link
          href="/"
          className="border-border text-foreground hover:bg-background mt-6 inline-block rounded-lg border px-4 py-3 text-sm font-medium transition"
        >
          กลับหน้าแรก
        </Link>
      </div>
    </main>
  );
}
