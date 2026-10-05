import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';

import { ChartCard } from './chart-card';

const rows = [
  { day: '5 ต.ค.', count: 3 },
  { day: '4 ต.ค.', count: 0 },
];

const card = (empty: string | null) => (
  <ChartCard
    id="found"
    title="ประกาศที่พบต่อวัน"
    subtitle="นับตามวันที่ระบบพบครั้งแรก"
    empty={empty}
    rows={rows}
    rowKey={(row) => row.day}
    columns={[
      { header: 'วันที่', cell: (row) => row.day },
      { header: 'จำนวน', cell: (row) => row.count },
    ]}
  >
    <svg data-testid="plot" />
  </ChartCard>
);

describe('ChartCard', () => {
  test('is a figure named by its title and described by its subtitle', () => {
    render(card(null));

    const figure = screen.getByRole('figure', { name: 'ประกาศที่พบต่อวัน' });
    expect(figure).toHaveAccessibleDescription('นับตามวันที่ระบบพบครั้งแรก');
  });

  test('offers the same numbers as a table, one click away', async () => {
    render(card(null));

    await userEvent.click(screen.getByText('ดูเป็นตาราง'));

    const table = screen.getByRole('table');
    expect(
      within(table)
        .getAllByRole('row')
        .map((row) => row.textContent),
    ).toEqual(['วันที่จำนวน', '5 ต.ค.3', '4 ต.ค.0']);
  });

  test('with nothing to plot, says why and offers no table of zeros', () => {
    render(card('ไม่พบประกาศใหม่ใน 30 วัน'));

    expect(screen.getByText('ไม่พบประกาศใหม่ใน 30 วัน')).toBeInTheDocument();
    expect(screen.queryByText('ดูเป็นตาราง')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
