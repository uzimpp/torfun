'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadTor } from '@/lib/api';
import { messageFor } from '@/lib/api-errors';
import { saveBlob, torFilename } from '@/lib/tor-file';

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
      saveBlob(await downloadTor(projectId), torFilename(projectId));
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
