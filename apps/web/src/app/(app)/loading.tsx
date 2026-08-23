export default function Loading() {
  return (
    <div className="mx-auto max-w-[1320px] animate-pulse">
      <div className="h-10 w-36 rounded-lg bg-[#e8ecf3]" />
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-[244px] rounded-xl border border-[#e1e5ed] bg-white p-5">
            <div className="h-5 w-20 rounded-full bg-[#edf1f6]" />
            <div className="mt-5 h-5 w-4/5 rounded bg-[#e8ecf3]" />
            <div className="mt-4 h-4 w-3/5 rounded bg-[#edf1f6]" />
            <div className="mt-8 h-px bg-[#edf1f6]" />
          </div>
        ))}
      </div>
    </div>
  );
}
