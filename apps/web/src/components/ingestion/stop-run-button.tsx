'use client';

import { useState } from 'react';
import { Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Stopping asks first, because it is not undone: the run ends once the records
 * in hand are finished, and the rest wait for the next one.
 */
export function StopRunButton({
  stopping,
  onStop,
}: {
  /** The API already has the request. */
  stopping: boolean;
  onStop: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const pending = sending || stopping;

  const confirm = async () => {
    setConfirming(false);
    setSending(true);
    try {
      await onStop();
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => setConfirming(true)}
      >
        <Square data-icon="inline-start" className="size-4" aria-hidden="true" />
        {pending ? 'กำลังหยุด' : 'หยุดรอบนี้'}
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>หยุดรอบนี้?</DialogTitle>
            <DialogDescription>
              รายการที่กำลังทำอยู่จะทำต่อจนเสร็จ ที่เหลือจะยังอยู่ในคิว
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              ไม่หยุด
            </Button>
            <Button variant="destructive" onClick={() => void confirm()}>
              <Square className="size-4" aria-hidden="true" />
              หยุดรอบนี้
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
