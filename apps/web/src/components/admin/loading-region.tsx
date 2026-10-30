import type { ReactNode } from 'react';

/**
 * A skeleton placeholder that says, to a screen reader, what the shapes only
 * show: something is loading here. The shapes themselves are hidden from it.
 */
export function LoadingRegion({
  label = 'กำลังโหลด',
  className,
  children,
}: {
  label?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children ? (
        <div aria-hidden="true" className="contents">
          {children}
        </div>
      ) : null}
    </div>
  );
}
