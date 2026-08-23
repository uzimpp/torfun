'use client';

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto grid min-h-[360px] max-w-[700px] place-items-center text-center">
      <div>
        <h1 className="text-2xl font-semibold">ไม่สามารถแสดงข้อมูลได้</h1>
        <p className="mt-2 text-sm text-[#68758a]">
          กรุณาลองใหม่อีกครั้ง หากปัญหายังคงอยู่ โปรดติดต่อผู้ดูแลระบบ
        </p>
        <button
          className="mt-5 rounded-lg bg-[#202b45] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2d3a59] active:translate-y-px"
          onClick={reset}
        >
          ลองใหม่
        </button>
      </div>
    </div>
  );
}
