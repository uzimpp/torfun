export default function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center bg-gray-50 py-12">
      <div
        role="status"
        aria-label="กำลังโหลด"
        className="size-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900"
      />
    </div>
  );
}
