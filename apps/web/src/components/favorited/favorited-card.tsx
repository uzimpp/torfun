'use client';

import { useState } from 'react';
import {
  Banknote,
  BookmarkX,
  Building2,
  CalendarDays,
  Download,
  Layers3,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError, downloadTor } from '@/lib/api';
import type { FavoritedTor } from './use-favorited-data';

function formatThb(amount: number): string {
  return `${amount.toLocaleString('th-TH')} บาท`;
}

export function FavoritedCard({
  tor,
  removing,
  onRemove,
}: {
  tor: FavoritedTor;
  /** True while this card's own unfavorite request is in flight. */
  removing: boolean;
  onRemove: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const blob = await downloadTor(tor.projectId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tor-${tor.projectId}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setDownloadError(caught instanceof ApiError ? caught.message : 'ดาวน์โหลด TOR ไม่สำเร็จ');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card className="h-full shadow-soft transition-transform duration-200 hover:-translate-y-1">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <CardTitle className="min-w-0 text-lg leading-relaxed">{tor.title}</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="bg-primary/10 text-primary hover:bg-destructive/10 hover:text-destructive size-9 shrink-0 rounded-full"
            aria-label="นำออกจากรายการที่บันทึกไว้"
            title="นำออกจากรายการที่บันทึกไว้"
            disabled={removing}
            onClick={onRemove}
          >
            {removing ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <BookmarkX aria-hidden="true" className="size-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="min-w-0 text-xs">
          <p className="text-muted-foreground flex items-center gap-2 font-medium">
            <Building2 aria-hidden="true" className="size-3.5 shrink-0" />
            หน่วยงานเจ้าของโครงการ
          </p>
          <p className="mt-1 text-sm leading-relaxed">{tor.agency}</p>
        </div>

        {tor.technologyStack.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-1.5 flex items-center gap-2 text-xs font-medium">
              <Layers3 aria-hidden="true" className="size-3.5" />
              เทคโนโลยีที่ต้องการ
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tor.technologyStack.map((technology) => (
                <Badge
                  key={technology}
                  variant="outline"
                  className="border-primary/20 bg-primary/5 text-primary"
                >
                  {technology}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <CardDescription className="line-clamp-2 leading-relaxed">
          {tor.summary ?? 'ยังไม่มีข้อมูลการวิเคราะห์ TOR'}
        </CardDescription>

        <div className="text-sm">
          <p className="flex items-center gap-2">
            <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
            <span>
              <span className="text-muted-foreground text-xs font-medium">ปิดรับข้อเสนอ:</span>{' '}
              {tor.submissionDeadline ?? 'ยังไม่มีข้อมูล'}
            </span>
          </p>
        </div>

        <div className="bg-muted/50 mt-auto flex items-center gap-3 rounded-lg px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Banknote aria-hidden="true" className="text-primary size-4 shrink-0" />
            <span className="text-muted-foreground text-xs">งบประมาณ</span>
            <span className="text-sm font-semibold tabular-nums">
              {tor.budget === null ? 'ไม่มีข้อมูล' : formatThb(tor.budget)}
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            className="ms-auto"
            onClick={handleDownload}
            disabled={downloading}
          >
            <Download aria-hidden="true" />
            {downloading ? 'กำลังดาวน์โหลด' : 'ดาวน์โหลด TOR'}
          </Button>
        </div>
        {downloadError && (
          <p role="alert" className="text-destructive text-xs leading-relaxed">
            {downloadError}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
