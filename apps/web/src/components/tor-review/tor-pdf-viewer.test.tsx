import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import TorPdfViewer from './tor-pdf-viewer';

vi.mock('react-pdf', () => ({
  Document: ({
    children,
    onLoadSuccess,
  }: {
    children: ReactNode;
    onLoadSuccess: (document: { numPages: number }) => void;
  }) => {
    useEffect(() => onLoadSuccess({ numPages: 25 }), [onLoadSuccess]);
    return <div>{children}</div>;
  },
  Page: ({ pageNumber }: { pageNumber: number }) => <div data-testid="pdf-page">{pageNumber}</div>,
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
}));

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class implements ResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [{ target, contentRect: { width: 600, height: 1000 } } as ResizeObserverEntry],
          this,
        );
      }
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('lets the user zoom the PDF preview with toolbar controls and trackpad pinch', () => {
  render(<TorPdfViewer data={new ArrayBuffer(0)} />);
  const pages = screen.getByTestId('pdf-pages');

  expect(screen.getByText('100%')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'ขยายเอกสาร' }));
  expect(screen.getByText('125%')).toBeInTheDocument();
  const pageStack = screen.getByTestId('pdf-zoom-stage').firstElementChild as HTMLElement;
  expect(pageStack).not.toHaveClass('transition-transform');
  vi.spyOn(pageStack, 'getBoundingClientRect').mockReturnValue(new DOMRect(50, 100, 750, 1250));
  Object.defineProperty(pageStack, 'offsetWidth', { configurable: true, value: 600 });

  const pinch = new WheelEvent('wheel', {
    ctrlKey: true,
    deltaY: -20,
    clientX: 400,
    clientY: 350,
    bubbles: true,
    cancelable: true,
  });
  act(() => pages.dispatchEvent(pinch));

  expect(pinch.defaultPrevented).toBe(true);
  expect(pageStack).toHaveStyle({
    transformOrigin: '280px 200px',
  });
  expect(screen.getByText('147%')).toBeInTheDocument();

  const nextPinch = new WheelEvent('wheel', {
    ctrlKey: true,
    deltaY: -10,
    bubbles: true,
    cancelable: true,
  });
  act(() => pages.dispatchEvent(nextPinch));
  expect(nextPinch.defaultPrevented).toBe(true);
  expect(screen.queryByRole('button', { name: 'รีเซ็ตขนาดเอกสาร' })).not.toBeInTheDocument();
});

test('keeps regular wheel scrolling from triggering zoom or canceling the event', () => {
  render(<TorPdfViewer data={new ArrayBuffer(0)} />);
  const scroll = new WheelEvent('wheel', { deltaY: -20, bubbles: true, cancelable: true });

  screen.getByTestId('pdf-pages').dispatchEvent(scroll);

  expect(scroll.defaultPrevented).toBe(false);
  expect(screen.getByText('100%')).toBeInTheDocument();
});

test('centers the PDF vertically in the viewport when zooming out', () => {
  render(<TorPdfViewer data={new ArrayBuffer(0)} />);

  fireEvent.click(screen.getByRole('button', { name: 'ย่อเอกสาร' }));

  expect(screen.getByText('75%')).toBeInTheDocument();
  expect(screen.getByTestId('pdf-zoom-stage')).toHaveClass('min-h-full', 'min-w-full');
  expect(screen.getByTestId('pdf-zoom-stage')).toHaveStyle({ width: '450px', height: '750px' });
  expect(screen.getByTestId('pdf-zoom-stage').firstElementChild).toHaveStyle({
    top: 'calc(50% - 375px)',
    transform: 'translate(calc(-50% + 0px), 0px) scale(0.75)',
    transformOrigin: '50% 0px',
  });
});

test('does not treat non-wheel gestures as pinch zoom', () => {
  render(<TorPdfViewer data={new ArrayBuffer(0)} />);
  const pages = screen.getByTestId('pdf-pages');

  pages.dispatchEvent(new Event('gesturestart', { bubbles: true, cancelable: true }));
  pages.dispatchEvent(new Event('gesturechange', { bubbles: true, cancelable: true }));

  expect(screen.getByText('100%')).toBeInTheDocument();
});

test('navigates PDF pages and disables navigation at the document boundaries', async () => {
  render(<TorPdfViewer data={new ArrayBuffer(0)} />);

  expect(await screen.findByText('1 / 25')).toBeInTheDocument();
  expect(screen.getAllByTestId('pdf-page')).toHaveLength(25);
  expect(screen.getAllByTestId('pdf-page')[0]).toHaveTextContent('1');
  expect(screen.getByRole('button', { name: 'หน้าก่อนหน้า' })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: 'หน้าถัดไป' }));
  expect(screen.getByText('2 / 25')).toBeInTheDocument();
  expect(screen.getAllByTestId('pdf-page')[1]).toHaveTextContent('2');

  for (let page = 2; page < 25; page += 1) {
    fireEvent.click(screen.getByRole('button', { name: 'หน้าถัดไป' }));
  }
  expect(screen.getByText('25 / 25')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'หน้าถัดไป' })).toBeDisabled();
});

test('updates the current page when scrolling through the document', async () => {
  render(<TorPdfViewer data={new ArrayBuffer(0)} />);
  expect(await screen.findByText('1 / 25')).toBeInTheDocument();

  const pages = screen.getByTestId('pdf-pages');
  const pageElements = Array.from(pages.querySelectorAll<HTMLElement>('[data-page-number]'));
  vi.spyOn(pages, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 600, 500));
  pageElements.forEach((element, index) => {
    const top = index === 1 ? 100 : index * 600 + 600;
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, top, 600, 300));
  });

  act(() => pages.dispatchEvent(new Event('scroll', { bubbles: true })));

  expect(screen.getByText('2 / 25')).toBeInTheDocument();
});
