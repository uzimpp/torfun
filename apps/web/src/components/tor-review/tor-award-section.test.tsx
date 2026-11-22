import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Contract, ContractSubmission } from '@torfun/types';

import { TorAwardSection } from './tor-award-section';
import { awardFor } from './use-tor-award';

vi.mock('@/lib/api', () => ({
  fetchTorContracts: vi.fn(),
  fetchTorContractSubmissions: vi.fn(),
}));

const api = await import('@/lib/api');
const mocked = vi.mocked(api);

// Fixtures only: the shapes the API publishes, with invented ids and names.
const line = (projectId: string, overrides: Partial<Contract> = {}): Contract => ({
  projectId,
  contractYear: 2569,
  contractNo: 'CN-1',
  winnerName: 'บริษัท เอ จำกัด',
  winnerTin: null,
  priceAgree: 2_830_000,
  contractDate: null,
  contractFinishDate: null,
  status: null,
  sumPriceAgree: 2_830_000,
  projectMoney: 3_000_000,
  priceBuild: 2_990_000,
  ...overrides,
});

const bid = (projectId: string, merchantName: string, submitPrice: number): ContractSubmission => ({
  projectId,
  contractYear: 2569,
  merchantName,
  seqNo: 1,
  seqNoDesc: 'รายการที่ 1',
  submitPrice,
});

beforeEach(() => vi.clearAllMocks());

describe('awardFor', () => {
  test('uses only lines whose project id equals the procurement id exactly', () => {
    const award = awardFor(
      'P1',
      [line('P1'), line('P2', { winnerName: 'บริษัท บี จำกัด' })],
      [bid('P1', 'บริษัท เอ จำกัด', 2_830_000), bid('P2', 'บริษัท บี จำกัด', 1)],
    );

    expect(award?.awards.map((entry) => entry.winnerName)).toEqual(['บริษัท เอ จำกัด']);
    expect(award?.items[0]?.bids).toHaveLength(1);
  });

  test('never falls back: lines of other projects alone give no award', () => {
    expect(awardFor('P1', [line('P2')], [bid('P2', 'บริษัท บี จำกัด', 1)])).toBeNull();
  });

  test('does not match a near id (prefix, suffix, padding, case)', () => {
    expect(awardFor('68129131752', [line('681291317520')], [])).toBeNull();
    expect(awardFor('68129131752', [line('8129131752')], [])).toBeNull();
    expect(awardFor('68129131752', [line(' 68129131752')], [])).toBeNull();
    expect(awardFor('abc', [line('ABC')], [])).toBeNull();
  });

  test('keeps every contract year under the exact id and does not pick one by date', () => {
    const award = awardFor(
      'P1',
      [
        line('P1', { contractYear: 2568, contractNo: 'OLD', contractDate: '1 ม.ค. 68' }),
        line('P1', {
          contractYear: 2569,
          contractNo: 'NEW',
          contractDate: '1 ม.ค. 69',
          winnerName: 'บริษัท บี จำกัด',
        }),
      ],
      [],
    );

    expect(award?.awards.map((entry) => entry.winnerName)).toEqual([
      'บริษัท เอ จำกัด',
      'บริษัท บี จำกัด',
    ]);
    expect(award?.contractYear).toBeNull();
  });

  test('nothing published gives null, not an empty summary', () => {
    expect(awardFor('P1', [], [])).toBeNull();
  });
});

describe('TorAwardSection', () => {
  test('asks for this project id only and shows its winner and prices', async () => {
    mocked.fetchTorContracts.mockResolvedValue({ items: [line('P1')] });
    mocked.fetchTorContractSubmissions.mockResolvedValue({
      items: [bid('P1', 'บริษัท เอ จำกัด', 2_830_000)],
    });
    render(<TorAwardSection projectId="P1" />);

    expect(await screen.findByText('ผู้ชนะและราคาของโครงการนี้')).toBeInTheDocument();
    expect(screen.getAllByText('บริษัท เอ จำกัด').length).toBeGreaterThan(0);
    expect(mocked.fetchTorContracts).toHaveBeenCalledWith('P1');
    expect(mocked.fetchTorContractSubmissions).toHaveBeenCalledWith('P1');
    expect(screen.getByText(/ระบบไม่ได้ยืนยันความถูกต้อง/)).toBeInTheDocument();
    expect(
      screen.getByText(/จับคู่กับโครงการนี้ด้วยเลขโครงการที่ตรงกันเท่านั้น/),
    ).toBeInTheDocument();
    expect(screen.getByText(/โครงการที่ประกาศซ้ำหรือสัญญาข้ามปี/)).toBeInTheDocument();
  });

  test('shows a clear empty state, and nobody else’s award, when no line carries its id', async () => {
    mocked.fetchTorContracts.mockResolvedValue({
      items: [line('P2', { winnerName: 'บริษัท บี จำกัด' })],
    });
    mocked.fetchTorContractSubmissions.mockResolvedValue({ items: [] });
    render(<TorAwardSection projectId="P1" />);

    expect(await screen.findByText('ยังไม่มีข้อมูลผู้ชนะและราคา')).toBeInTheDocument();
    expect(screen.queryByText('บริษัท บี จำกัด')).not.toBeInTheDocument();
  });

  test('shows the empty state when the API has nothing', async () => {
    mocked.fetchTorContracts.mockResolvedValue({ items: [] });
    mocked.fetchTorContractSubmissions.mockResolvedValue({ items: [] });
    render(<TorAwardSection projectId="P1" />);

    expect(await screen.findByText('ยังไม่มีข้อมูลผู้ชนะและราคา')).toBeInTheDocument();
  });

  test('a failed load is its own message and shows no award', async () => {
    mocked.fetchTorContracts.mockRejectedValue(new Error('boom'));
    mocked.fetchTorContractSubmissions.mockResolvedValue({ items: [] });
    render(<TorAwardSection projectId="P1" />);

    expect(await screen.findByText('โหลดข้อมูลผู้ชนะและราคาไม่สำเร็จ')).toBeInTheDocument();
    expect(screen.queryByText('ยังไม่มีข้อมูลผู้ชนะและราคา')).not.toBeInTheDocument();
  });

  test('says it is loading before the answer', () => {
    mocked.fetchTorContracts.mockReturnValue(new Promise(() => {}));
    mocked.fetchTorContractSubmissions.mockReturnValue(new Promise(() => {}));
    render(<TorAwardSection projectId="P1" />);

    expect(screen.getByRole('status')).toHaveTextContent('กำลังโหลดข้อมูลผู้ชนะและราคา');
  });

  test('moving to another project never shows the previous project’s award', async () => {
    mocked.fetchTorContracts.mockImplementation(async (id) => ({
      items: id === 'P1' ? [line('P1')] : [],
    }));
    mocked.fetchTorContractSubmissions.mockResolvedValue({ items: [] });
    const { rerender } = render(<TorAwardSection projectId="P1" />);
    expect(await screen.findByText('ผู้ชนะและราคาของโครงการนี้')).toBeInTheDocument();

    rerender(<TorAwardSection projectId="P2" />);
    expect(screen.queryByText('ผู้ชนะและราคาของโครงการนี้')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('ยังไม่มีข้อมูลผู้ชนะและราคา')).toBeInTheDocument(),
    );
  });
});
