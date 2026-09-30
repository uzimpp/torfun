import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_SCHEDULE, type ScheduleView } from '@torfun/types';

import { ApiError, SessionEndedError } from '@/lib/api';
import { ScheduleCard } from './schedule-card';

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

const off: ScheduleView = { ...DEFAULT_SCHEDULE, lastRunAt: null, nextRunAt: null };
const on: ScheduleView = {
  ...off,
  enabled: true,
  updatedAt: '2026-10-01T05:00:00.000Z',
  updatedBy: 'admin-1',
  lastRunAt: '2026-10-01T02:00:00.000Z',
  nextRunAt: '2026-10-01T19:00:00.000Z', // 02:00 on 2 Oct in Bangkok
};

beforeEach(() => vi.clearAllMocks());

async function renderLoaded(view: ScheduleView = off) {
  mocked.fetchSchedule.mockResolvedValue(view);
  render(<ScheduleCard />);
  await screen.findByRole('switch');
}

describe('while loading and when it cannot load', () => {
  test('holds the space with a busy placeholder rather than a spinner or a blank', () => {
    mocked.fetchSchedule.mockReturnValue(new Promise(() => {}));
    render(<ScheduleCard />);

    expect(screen.getByRole('status', { name: /กำลังโหลด/ })).toHaveAttribute('aria-busy', 'true');
  });

  test('a failure is announced, with a way to try again', async () => {
    mocked.fetchSchedule.mockRejectedValueOnce(new ApiError('Cannot reach the API', 0));
    render(<ScheduleCard />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the API');

    mocked.fetchSchedule.mockResolvedValueOnce(off);
    await userEvent.click(screen.getByRole('button', { name: 'ลองอีกครั้ง' }));
    expect(await screen.findByRole('switch')).toBeInTheDocument();
  });

  test('an ended session points to sign-in instead of offering a retry that cannot work', async () => {
    mocked.fetchSchedule.mockRejectedValue(new SessionEndedError());
    render(<ScheduleCard />);

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
  test('daily asks for a time and no interval; interval asks for hours and no time', async () => {
    await renderLoaded(off);

    expect(screen.getByLabelText(/เวลาเริ่มรอบ/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/เว้นระยะ/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'ทุก N ชั่วโมง' }));

    expect(screen.queryByLabelText(/เวลาเริ่มรอบ/)).not.toBeInTheDocument();
    const hours = screen.getByLabelText(/เว้นระยะ/);
    const offered = Array.from(hours.querySelectorAll('option')).map((option) => option.value);
    expect(offered).toEqual(['6', '8', '12', '24', '48']);
  });

  test('there is no way to pick fewer than six hours', async () => {
    await renderLoaded(off);
    await userEvent.click(screen.getByRole('radio', { name: 'ทุก N ชั่วโมง' }));

    const values = Array.from(screen.getByLabelText(/เว้นระยะ/).querySelectorAll('option')).map(
      (option) => Number(option.value),
    );
    expect(Math.min(...values)).toBe(6);
  });
});

describe('saving', () => {
  test('sends what was chosen, and confirms it in words', async () => {
    mocked.updateSchedule.mockResolvedValue({ ...on, mode: 'interval', everyHours: 12 });
    await renderLoaded(off);

    await userEvent.click(screen.getByRole('switch', { name: /เปิดใช้งาน/ }));
    await userEvent.click(screen.getByRole('radio', { name: 'ทุก N ชั่วโมง' }));
    await userEvent.selectOptions(screen.getByLabelText(/เว้นระยะ/), '12');
    await userEvent.click(screen.getByRole('button', { name: 'บันทึกตารางเวลา' }));

    expect(mocked.updateSchedule).toHaveBeenCalledWith({
      enabled: true,
      mode: 'interval',
      timeOfDay: '02:00',
      everyHours: 12,
    });
    expect(await screen.findByRole('status', { name: /บันทึก/ })).toHaveTextContent(
      'บันทึกตารางเวลาแล้ว',
    );
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
