'use client';

import { useState } from 'react';
import { Play, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { RunPhase } from './status-tracking';

const TOGGLE = 'size-10 shrink-0 rounded-full';

/**
 * One button for the run: Play starts one when idle; Square stops the one in
 * flight. Stopping asks first, because it is not undone: the run ends once the
 * records in hand are finished, and the rest wait for the next one.
 */
export function RunToggle({
  phase,
  starting,
  onStart,
  onStop,
}: {
  phase: RunPhase;
  /** A start has been sent and not yet answered. */
  starting: boolean;
  onStart: () => void;
  onStop: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  if (phase === 'idle') {
    return (
      <Button
        size="icon-lg"
        className={TOGGLE}
        aria-label="เริ่มรอบดึงข้อมูล"
        disabled={starting}
        aria-busy={starting || undefined}
        onClick={onStart}
      >
        <Play className="size-4" aria-hidden="true" />
      </Button>
    );
  }

  const pending = sending || phase === 'stopping';
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
        size="icon-lg"
        className={TOGGLE}
        aria-label={pending ? 'กำลังหยุด' : 'หยุดรอบนี้'}
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => setConfirming(true)}
      >
        <Square className="size-4" aria-hidden="true" />
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
