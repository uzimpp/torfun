'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError, downloadTor } from '@/lib/api';

export function TorDownloadButton({ projectId }: { projectId: string }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      const blob = await downloadTor(projectId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tor-${projectId}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'ดาวน์โหลด TOR ไม่สำเร็จ');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <Button type="button" size="lg" className="w-full min-w-0" onClick={handleDownload} disabled={downloading}>
        <Download aria-hidden="true" />
        {downloading ? 'กำลังดาวน์โหลด' : 'ดาวน์โหลด TOR'}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-xs leading-relaxed">
          {error}
        </p>
      )}
    </div>
  );
}
