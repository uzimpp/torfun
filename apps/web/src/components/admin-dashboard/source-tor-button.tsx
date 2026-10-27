'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadTor } from '@/lib/api';
import { messageFor } from '@/lib/api-errors';

/**
 * The original TOR PDF, fetched with the session (the API is another origin, so
 * a plain link would not carry it) and handed to the browser as a file.
 */
export function SourceTorButton({ projectId }: { projectId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setPending(true);
    setError(null);
    try {
      const url = URL.createObjectURL(await downloadTor(projectId));
      const link = document.createElement('a');
      link.href = url;
      link.download = `tor-${projectId}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(messageFor(caught, 'ดาวน์โหลด TOR ต้นฉบับไม่สำเร็จ'));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => void download()}
      >
        <Download className="size-4" aria-hidden="true" />
        ดาวน์โหลด TOR ต้นฉบับ
      </Button>
      {error ? (
        <p role="alert" className="text-destructive basis-full text-xs">
          {error}
        </p>
      ) : null}
    </>
  );
}
