'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Download, Eye, LoaderCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError, downloadTor } from '@/lib/api';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';

const TorPdfViewer = dynamic(() => import('./tor-pdf-viewer'), {
  ssr: false,
  loading: () => <p className="text-muted-foreground p-6 text-center text-sm">กำลังโหลดตัวแสดงเอกสาร</p>,
});

export function TorDownloadButton({ projectId }: { projectId: string }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<ArrayBuffer | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function handleOpen() {
    setOpening(true);
    setError(null);
    setPreviewData(null);
    setPreviewUrl(null);
    setOpen(true);
    try {
      const blob = await downloadTor(projectId);
      const data = await blob.arrayBuffer();
      setPreviewUrl(URL.createObjectURL(blob));
      setPreviewData(data);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'เปิดเอกสาร TOR ไม่สำเร็จ');
    } finally {
      setOpening(false);
    }
  }

  function handleDownload() {
    if (!previewUrl) return;

    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = `tor-${projectId}.pdf`;
    link.click();
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <Button type="button" size="lg" className="w-full min-w-0" onClick={handleOpen} disabled={opening}>
        <Eye aria-hidden="true" />
        {opening ? 'กำลังเปิดเอกสาร' : 'ดูเอกสาร TOR'}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setOpening(false);
            setError(null);
            setPreviewUrl(null);
            setPreviewData(null);
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="h-[min(88dvh,960px)] grid-rows-[minmax(0,1fr)_auto] overflow-visible rounded-xl border border-border/40 p-3 shadow-md ring-0 sm:max-w-4xl sm:p-4"
        >
          <DialogClose
            aria-label="ปิด"
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className="absolute -top-10 right-0 rounded-full bg-popover shadow-md"
              />
            }
          >
            <X aria-hidden="true" />
          </DialogClose>
          <DialogTitle className="sr-only">ตัวอย่างเอกสาร TOR</DialogTitle>
          {previewData && (
            <div className="min-h-0 overflow-hidden">
              <TorPdfViewer data={previewData} />
            </div>
          )}
          {opening && (
            <div role="status" className="text-muted-foreground flex min-h-0 items-center justify-center gap-3 text-sm">
              <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
              กำลังโหลดเอกสาร TOR
            </div>
          )}
          {error && (
            <p role="alert" className="text-destructive flex min-h-0 items-center justify-center p-6 text-center text-sm">
              {error}
            </p>
          )}
          <DialogFooter className="justify-end border-border/60">
            <Button type="button" onClick={handleDownload} disabled={!previewUrl}>
              <Download aria-hidden="true" />
              ดาวน์โหลด TOR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
