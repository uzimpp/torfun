/**
 * The route-level pending state.
 *
 * Deliberately quiet: a route transition is usually over in a few hundred
 * milliseconds, and a full-page spinner that flashes on every navigation reads
 * as slower than no indicator at all.
 */
export default function Loading() {
  return (
    <div className="page-fill flex flex-1 items-center justify-center py-12">
      <div
        role="status"
        aria-label="กำลังโหลด"
        className="border-border border-t-primary size-8 animate-spin rounded-full border-2"
      />
    </div>
  );
}
