import Link from 'next/link';
export function SiteFooter() {
  return (
    <footer className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
      <div>
        <Link href="/" className="text-lg font-semibold">
          Torfun
        </Link>
        <p className="text-muted-foreground mt-2">ระบบค้นหาและคัดกรองประกาศ TOR ด้านซอฟต์แวร์</p>
      </div>
      <Link href="/login" className="py-3 underline-offset-4 hover:underline">
        เข้าสู่ระบบ
      </Link>
    </footer>
  );
}
