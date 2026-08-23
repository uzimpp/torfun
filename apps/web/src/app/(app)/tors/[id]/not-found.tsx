import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="mx-auto grid min-h-[360px] max-w-[700px] place-items-center text-center">
      <div>
        <h1 className="text-2xl font-semibold">ไม่พบ TOR นี้</h1>
        <p className="mt-2 text-sm text-[#68758a]">
          TOR อาจถูกลบ ย้าย หรือไม่มีอยู่ในข้อมูลตัวอย่าง
        </p>
        <Link
          className="mt-5 inline-flex rounded-lg bg-[#202b45] px-4 py-2 text-sm font-medium text-white"
          href="/search"
        >
          ไปหน้าค้นหา
        </Link>
      </div>
    </div>
  );
}
