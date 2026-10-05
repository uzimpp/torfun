import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { downloadTor } from '@/lib/api';
import { TorDownloadButton } from './tor-download-button';

vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {},
  downloadTor: vi.fn(),
}));

vi.mock('./tor-pdf-viewer', () => ({
  default: ({ data }: { data: ArrayBuffer }) => <div data-testid="pdf-viewer" data-length={data.byteLength} />,
}));

const pdf = new Blob(['Real TOR PDF bytes'], { type: 'application/pdf' });
Object.defineProperty(pdf, 'arrayBuffer', {
  value: vi.fn(() => Promise.resolve(new TextEncoder().encode('Real TOR PDF bytes').buffer)),
});
const createObjectURL = vi.fn(() => 'blob:tor-document');
const revokeObjectURL = vi.fn();

beforeEach(() => {
  vi.mocked(downloadTor).mockResolvedValue(pdf);
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('previews the TOR before offering download and releases the preview on close', async () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  let resolveDownload!: (blob: Blob) => void;
  vi.mocked(downloadTor).mockReturnValue(
    new Promise((resolve) => {
      resolveDownload = resolve;
    }),
  );
  render(<TorDownloadButton projectId="project-123" />);

  fireEvent.click(screen.getByRole('button', { name: 'ดูเอกสาร TOR' }));

  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('กำลังโหลดเอกสาร TOR');
  expect(screen.getByRole('button', { name: 'ดาวน์โหลด TOR' })).toBeDisabled();

  await act(async () => resolveDownload(pdf));
  expect(await screen.findByTestId('pdf-viewer')).toHaveAttribute('data-length', '18');
  expect(screen.queryByRole('iframe')).not.toBeInTheDocument();
  expect(downloadTor).toHaveBeenCalledWith('project-123');
  expect(createObjectURL).toHaveBeenCalledWith(pdf);

  fireEvent.click(screen.getByRole('button', { name: 'ดาวน์โหลด TOR' }));
  expect(click).toHaveBeenCalledOnce();

  fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));
  await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:tor-document'));
});
