import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_SCHEDULE, type ScheduleView } from '@torfun/types';

import { ApiError, SessionEndedError } from '@/lib/api';
import { ScheduleSettings } from './schedule-card';

/**
 * What a Site Administrator can see and do with the schedule: read when the
 * next run is due, switch it on, choose a time or an interval, and be told in
 * Thai — beside the field — when something is not allowed. The API does not
 * exist as far as these tests are concerned.
 */
vi.mock('@/lib/api-schedule', () => ({
  fetchSchedule: vi.fn(),
  updateSchedule: vi.fn(),
}));

const api = await import('@/lib/api-schedule');
const mocked = vi.mocked(api);

const off: ScheduleView = {
  ...DEFAULT_SCHEDULE,
  lastRunAt: null,
  nextRunAt: null,
  upcomingRunAts: [],
};
const on: ScheduleView = {
  ...off,
  enabled: true,
  mode: 'weekly',
  timeOfDay: '02:00',
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  updatedAt: '2026-10-01T05:00:00.000Z',
  updatedBy: 'admin-1',
  lastRunAt: '2026-10-01T02:00:00.000Z',
  nextRunAt: '2026-10-01T19:00:00.000Z', // 02:00 on 2 Oct in Bangkok
  upcomingRunAts: [
    '2026-10-01T19:00:00.000Z', // 02:00 on 2 Oct
    '2026-10-02T19:00:00.000Z', // 02:00 on 3 Oct
    '2026-10-03T19:00:00.000Z', // 02:00 on 4 Oct
  ],
};

beforeEach(() => vi.clearAllMocks());

async function renderLoaded(view: ScheduleView = off) {
  mocked.fetchSchedule.mockResolvedValue(view);
  render(<ScheduleSettings />);
  await screen.findByRole('switch');
}

describe('while loading and when it cannot load', () => {
  test('holds the space with a busy placeholder rather than a spinner or a blank', () => {
    mocked.fetchSchedule.mockReturnValue(new Promise(() => {}));
    render(<ScheduleSettings />);

    expect(screen.getByRole('status', { name: /กำลังโหลด/ })).toHaveAttribute('aria-busy', 'true');
  });

  test('a failure is announced, with a way to try again', async () => {
    mocked.fetchSchedule.mockRejectedValueOnce(new ApiError('Cannot reach the API', 0));
    render(<ScheduleSettings />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the API');

    mocked.fetchSchedule.mockResolvedValueOnce(off);
    await userEvent.click(screen.getByRole('button', { name: 'ลองอีกครั้ง' }));
    expect(await screen.findByRole('switch')).toBeInTheDocument();
  });

  test('an ended session points to sign-in instead of offering a retry that cannot work', async () => {
    mocked.fetchSchedule.mockRejectedValue(new SessionEndedError());
    render(<ScheduleSettings />);

    expect(await screen.findByRole('link', { name: 'เข้าสู่ระบบอีกครั้ง' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.queryByRole('button', { name: 'ลองอีกครั้ง' })).not.toBeInTheDocument();
  });
});

describe('reading the schedule', () => {
  test('off by default: says so in words, and names no next run', async () => {
    await renderLoaded(off);

    expect(screen.getByRole('switch', { name: /เปิดใช้งาน/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByText('ปิดอยู่')).toBeInTheDocument();
    expect(screen.getByText('ยังไม่เคยเริ่มรอบ')).toBeInTheDocument();
  });

  test('on: shows the next and last run in Bangkok time', async () => {
    await renderLoaded(on);

    expect(screen.getByRole('switch', { name: /เปิดใช้งาน/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const next = screen.getByText('รอบถัดไป').nextElementSibling;
    expect(next).toHaveTextContent('02:00');
    const last = screen.getByText('รอบล่าสุด').nextElementSibling;
    expect(last).toHaveTextContent('09:00'); // 02:00Z is 09:00 in Bangkok
  });

  test('states the six-hour floor and the time zone, so nobody guesses', async () => {
    await renderLoaded(off);

    expect(screen.getByText(/ไม่ถี่กว่าทุก 6 ชั่วโมง/)).toBeInTheDocument();
    expect(screen.getByText(/เวลาประเทศไทย/)).toBeInTheDocument();
  });
});

describe('choosing when', () => {
  test('an interval asks for hours, with presets, and for no days or time', async () => {
    await renderLoaded(off);
    await userEvent.click(screen.getByRole('radio', { name: 'ทุก N ชั่วโมง' }));

    expect(screen.getByRole('radio', { name: 'ทุก N ชั่วโมง' })).toBeChecked();
    expect(screen.getByLabelText(/เว้นระยะ/)).toHaveValue(24);
    for (const hours of [24, 48, 72, 168]) {
      expect(screen.getByRole('button', { name: `${hours} ชั่วโมง` })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: '24 ชั่วโมง' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByLabelText(/เวลาเริ่มรอบ/)).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /วันที่เริ่มรอบ/ })).not.toBeInTheDocument();
  });

  test('a preset fills in the hours, and any other number can be typed', async () => {
    await renderLoaded(off);
    await userEvent.click(screen.getByRole('radio', { name: 'ทุก N ชั่วโมง' }));

    await userEvent.click(screen.getByRole('button', { name: '72 ชั่วโมง' }));
    expect(screen.getByLabelText(/เว้นระยะ/)).toHaveValue(72);
    expect(screen.getByRole('button', { name: '72 ชั่วโมง' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.clear(screen.getByLabelText(/เว้นระยะ/));
    await userEvent.type(screen.getByLabelText(/เว้นระยะ/), '36');
    expect(screen.getByLabelText(/เว้นระยะ/)).toHaveValue(36);
    expect(screen.getByRole('button', { name: '72 ชั่วโมง' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('a fresh schedule opens on weekdays Monday to Friday at 13:00, with all seven days offered', async () => {
    await renderLoaded(off);

    expect(screen.getByRole('radio', { name: 'ตามวันในสัปดาห์' })).toBeChecked();
    const days = within(screen.getByRole('group', { name: /วันที่เริ่มรอบ/ }));
    expect(days.getAllByRole('checkbox')).toHaveLength(7);
    for (const day of ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์']) {
      expect(days.getByRole('checkbox', { name: day })).toBeChecked();
    }
    for (const day of ['อาทิตย์', 'เสาร์']) {
      expect(days.getByRole('checkbox', { name: day })).not.toBeChecked();
    }
    expect(screen.getByLabelText(/เวลาเริ่มรอบ/)).toHaveValue('13:00');
    expect(screen.queryByLabelText(/เว้นระยะ/)).not.toBeInTheDocument();
  });

  test('"every day" is not a mode of its own: there are two choices', async () => {
    await renderLoaded(off);

    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.queryByRole('radio', { name: 'ทุกวัน' })).not.toBeInTheDocument();
  });
});

describe('what the schedule means', () => {
  test('lists the next three runs in Bangkok time', async () => {
    await renderLoaded(on);

    const list = screen.getByRole('list', { name: /สามรอบถัดไป/ });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('02:00');
  });
});

describe('saving', () => {
  test('sends what was chosen, and confirms it in words', async () => {
    mocked.updateSchedule.mockResolvedValue({ ...on, mode: 'weekly', weekdays: [1, 3, 5] });
    await renderLoaded(off);

    await userEvent.click(screen.getByRole('switch', { name: /เปิดใช้งาน/ }));
    const days = within(screen.getByRole('group', { name: /วันที่เริ่มรอบ/ }));
    for (const day of ['อังคาร', 'พฤหัสบดี']) {
      await userEvent.click(days.getByRole('checkbox', { name: day }));
    }
    await userEvent.click(screen.getByRole('button', { name: 'บันทึกตารางเวลา' }));

    expect(mocked.updateSchedule).toHaveBeenCalledWith({
      enabled: true,
      mode: 'weekly',
      timeOfDay: '13:00',
      weekdays: [1, 3, 5],
      everyHours: 24,
    });
    expect(await screen.findByRole('status', { name: /บันทึก/ })).toHaveTextContent(
      'บันทึกตารางเวลาแล้ว',
    );
  });

  test('an interval under six hours is refused in Thai beside the field, and nothing is sent', async () => {
    await renderLoaded(on);
    await userEvent.click(screen.getByRole('radio', { name: 'ทุก N ชั่วโมง' }));

    await userEvent.clear(screen.getByLabelText(/เว้นระยะ/));
    await userEvent.type(screen.getByLabelText(/เว้นระยะ/), '4');
    await userEvent.click(screen.getByRole('button', { name: 'บันทึกตารางเวลา' }));

    const field = screen.getByLabelText(/เว้นระยะ/);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    const message = screen.getByText(/อย่างน้อย 6 ชั่วโมง/);
    expect(field.getAttribute('aria-describedby')).toContain(message.id);
    expect(mocked.updateSchedule).not.toHaveBeenCalled();
  });

  test('weekly with every day cleared is refused beside the days, and nothing is sent', async () => {
    await renderLoaded(on);
    const days = within(screen.getByRole('group', { name: /วันที่เริ่มรอบ/ }));
    for (const day of days.getAllByRole('checkbox')) await userEvent.click(day);

    await userEvent.click(screen.getByRole('button', { name: 'บันทึกตารางเวลา' }));

    const message = screen.getByText('กรุณาเลือกอย่างน้อยหนึ่งวัน');
    expect(
      screen.getByRole('group', { name: /วันที่เริ่มรอบ/ }).getAttribute('aria-describedby'),
    ).toContain(message.id);
    expect(mocked.updateSchedule).not.toHaveBeenCalled();
  });

  test('a cleared time is refused in Thai beside the field, and nothing is sent', async () => {
    await renderLoaded(on);

    await userEvent.clear(screen.getByLabelText(/เวลาเริ่มรอบ/));
    await userEvent.click(screen.getByRole('button', { name: 'บันทึกตารางเวลา' }));

    const field = screen.getByLabelText(/เวลาเริ่มรอบ/);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    const message = screen.getByText(/กรุณาระบุเวลาที่ถูกต้อง/);
    expect(field.getAttribute('aria-describedby')).toContain(message.id);
    expect(mocked.updateSchedule).not.toHaveBeenCalled();
  });

  test('a save the server refuses is announced, and the form keeps what was typed', async () => {
    mocked.updateSchedule.mockRejectedValue(new ApiError('Validation failed', 400));
    await renderLoaded(off);

    await userEvent.click(screen.getByRole('switch', { name: /เปิดใช้งาน/ }));
    await userEvent.click(screen.getByRole('button', { name: 'บันทึกตารางเวลา' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Validation failed');
    expect(screen.getByRole('switch', { name: /เปิดใช้งาน/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('the button says it is working and cannot be pressed twice', async () => {
    let finish: (view: ScheduleView) => void = () => {};
    mocked.updateSchedule.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await renderLoaded(off);

    await userEvent.click(screen.getByRole('button', { name: 'บันทึกตารางเวลา' }));

    const working = await screen.findByRole('button', { name: 'กำลังบันทึก…' });
    expect(working).toBeDisabled();

    finish(on);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'บันทึกตารางเวลา' })).toBeEnabled(),
    );
  });

  test("after a save, the next run shown is the server's answer", async () => {
    mocked.updateSchedule.mockResolvedValue(on);
    await renderLoaded(off);

    await userEvent.click(screen.getByRole('button', { name: 'บันทึกตารางเวลา' }));

    await waitFor(() =>
      expect(screen.getByText('รอบถัดไป').nextElementSibling).toHaveTextContent('02:00'),
    );
  });
});
