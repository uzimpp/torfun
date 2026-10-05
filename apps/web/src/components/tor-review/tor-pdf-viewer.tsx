'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ArrowLeft, ArrowRight, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export default function TorPdfViewer({ data }: { data: ArrayBuffer }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const pageStackRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageStackHeight, setPageStackHeight] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(scale);
  const zoomOriginRef = useRef<{ x: number; y: number } | null>(null);
  const [zoomOrigin, setZoomOrigin] = useState<{ x: number; y: number } | null>(null);
  const zoomTranslationRef = useRef({ x: 0, y: 0 });
  const [zoomTranslation, setZoomTranslation] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const pages = pagesRef.current;
    if (!pages) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === pages) setPageWidth(entry.contentRect.width);
        if (entry.target === pageStackRef.current) setPageStackHeight(entry.contentRect.height);
      }
    });
    resizeObserver.observe(pages);
    if (pageStackRef.current) resizeObserver.observe(pageStackRef.current);
    return () => resizeObserver.disconnect();
  }, [pageCount, pageWidth]);

  useEffect(() => {
    const pages = pagesRef.current;
    if (!pages) return;

    function handlePinchZoom(event: globalThis.WheelEvent) {
      if (!event.ctrlKey) return;

      event.preventDefault();
      const pageStack = pageStackRef.current;
      if (!pageStack) return;

      const currentScale = scaleRef.current;
      const nextScale = Math.min(2, Math.max(0.5, currentScale * Math.exp(-event.deltaY * 0.008)));
      if (nextScale === currentScale) return;

      const rect = pageStack.getBoundingClientRect();
      const pointer = {
        x: (event.clientX - rect.left) / currentScale,
        y: (event.clientY - rect.top) / currentScale,
      };
      const currentOrigin = zoomOriginRef.current;
      const previousOrigin = currentOrigin ?? {
        x: Math.max(0, pageStack.offsetWidth / 2),
        y: 0,
      };
      const nextOrigin = currentOrigin ?? pointer;
      const originAdjustment = {
        x: (1 - currentScale) * (previousOrigin.x - nextOrigin.x),
        y: (1 - currentScale) * (previousOrigin.y - nextOrigin.y),
      };
      const currentTranslation = zoomTranslationRef.current;
      const nextTranslation = {
        x: currentTranslation.x + originAdjustment.x + (currentScale - nextScale) * (pointer.x - nextOrigin.x),
        y: currentTranslation.y + originAdjustment.y + (currentScale - nextScale) * (pointer.y - nextOrigin.y),
      };

      scaleRef.current = nextScale;
      zoomOriginRef.current = nextOrigin;
      zoomTranslationRef.current = nextTranslation;
      setScale(nextScale);
      setZoomOrigin(nextOrigin);
      setZoomTranslation(nextTranslation);
    }

    pages.addEventListener('wheel', handlePinchZoom, { passive: false });
    return () => pages.removeEventListener('wheel', handlePinchZoom);
  }, []);

  function changeScale(nextScale: number) {
    if (nextScale < scaleRef.current) {
      zoomOriginRef.current = null;
      setZoomOrigin(null);
      zoomTranslationRef.current = { x: 0, y: 0 };
      setZoomTranslation({ x: 0, y: 0 });
    }
    scaleRef.current = nextScale;
    setScale(nextScale);
  }

  const handleLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setPageCount(numPages);
    setCurrentPage(1);
    setError(null);
  }, []);

  function goToPage(page: number) {
    const targetPage = Math.min(pageCount, Math.max(1, page));
    setCurrentPage(targetPage);

    const pages = pagesRef.current;
    const pageElement = pages?.querySelector<HTMLElement>(`[data-page-number="${targetPage}"]`);
    if (!pages || !pageElement) return;

    const top = pages.scrollTop + pageElement.getBoundingClientRect().top - pages.getBoundingClientRect().top;
    if (typeof pages.scrollTo === 'function') {
      pages.scrollTo({ top, behavior: 'smooth' });
    } else {
      pages.scrollTop = top;
    }
  }

  function handlePagesScroll() {
    const pages = pagesRef.current;
    if (!pages) return;

    const viewport = pages.getBoundingClientRect();
    const viewportCenter = viewport.top + viewport.height / 2;
    const visiblePages = Array.from(pages.querySelectorAll<HTMLElement>('[data-page-number]'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const isVisible = rect.bottom > viewport.top && rect.top < viewport.bottom;
        return {
          page: Number(element.dataset.pageNumber),
          distance: Math.abs(rect.top + rect.height / 2 - viewportCenter),
          isVisible,
        };
      })
      .filter(({ isVisible }) => isVisible)
      .sort((a, b) => a.distance - b.distance);

    const page = visiblePages[0]?.page;
    if (page) setCurrentPage((current) => (current === page ? current : page));
  }

  return (
    <div ref={containerRef} className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div
        aria-label="ควบคุมเอกสาร"
        className="bg-background flex shrink-0 items-center justify-center gap-1 border-b border-border/60 px-2 py-1.5"
      >
        <div role="group" aria-label="เปลี่ยนหน้าเอกสาร" className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="หน้าก่อนหน้า"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
          <span aria-live="polite" className="text-muted-foreground min-w-14 text-center text-xs font-medium tabular-nums">
            {currentPage} / {pageCount || '—'}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="หน้าถัดไป"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= pageCount}
          >
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="ย่อเอกสาร"
          onClick={() => changeScale(Math.max(0.5, scaleRef.current - 0.25))}
          disabled={scale <= 0.5}
        >
          <ZoomOut aria-hidden="true" />
        </Button>
        <span aria-live="polite" className="text-muted-foreground min-w-12 text-center text-xs font-medium tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="ขยายเอกสาร"
          onClick={() => changeScale(Math.min(2, scaleRef.current + 0.25))}
          disabled={scale >= 2}
        >
          <ZoomIn aria-hidden="true" />
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-destructive p-6 text-center text-sm">
          {error}
        </p>
      ) : (
        <Document
          file={data}
          className="flex min-h-0 flex-1 flex-col"
          onLoadSuccess={handleLoadSuccess}
          onLoadError={() => setError('ไม่สามารถแสดงตัวอย่างเอกสาร TOR ได้')}
          loading={<p className="text-muted-foreground p-6 text-sm">กำลังโหลดเอกสาร TOR</p>}
          error={<p role="alert" className="text-destructive p-6 text-sm">ไม่สามารถแสดงตัวอย่างเอกสาร TOR ได้</p>}
          noData={<p role="alert" className="text-destructive p-6 text-sm">ไม่พบเอกสาร TOR</p>}
        >
          <div
            ref={pagesRef}
            data-testid="pdf-pages"
            onScroll={handlePagesScroll}
            className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain bg-muted/40 p-3 [overflow-anchor:none]"
          >
            <div
              data-testid="pdf-zoom-stage"
              className="relative mx-auto min-h-full min-w-full shrink-0"
              style={{
                width: pageWidth ? pageWidth * scale : '100%',
                height: pageStackHeight * scale,
              }}
            >
              <div
                ref={pageStackRef}
                className="absolute top-0 left-1/2 flex flex-col items-center gap-5"
                style={{
                  width: pageWidth || '100%',
                  top:
                    scale < 1 && !zoomOrigin
                      ? `calc(50% - ${pageStackHeight * scale / 2}px)`
                      : 0,
                  transform: `translate(calc(-50% + ${zoomTranslation.x}px), ${zoomTranslation.y}px) scale(${scale})`,
                  transformOrigin: zoomOrigin ? `${zoomOrigin.x}px ${zoomOrigin.y}px` : '50% 0px',
                }}
              >
                {pageWidth > 0 &&
                  Array.from({ length: pageCount }, (_, index) => (
                    <div key={index + 1} data-page-number={index + 1} className="scroll-mt-3">
                      <Page
                        pageNumber={index + 1}
                        width={pageWidth}
                        renderTextLayer
                        renderAnnotationLayer
                        className="overflow-hidden rounded-sm shadow-sm"
                      />
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </Document>
      )}
    </div>
  );
}
