import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';

import { ProcurementFilters } from './procurement-filters';
import {
  EMPTY_SEARCH_FILTERS,
  parseSearchFilters,
  searchHref,
  toProjectFilters,
} from './search-filter-values';

describe('ProcurementFilters', () => {
  test('renders the supported controls as one GET form', async () => {
    const user = userEvent.setup();
    render(<ProcurementFilters values={EMPTY_SEARCH_FILTERS} />);
    await user.click(screen.getByRole('button', { name: /ตัวกรอง/ }));

    const form = screen.getByRole('button', { name: 'ใช้ตัวกรอง' }).closest('form');
    expect(form).toHaveAttribute('action', '/search');
    expect(form).toHaveAttribute('method', 'get');
    expect(screen.getByLabelText('งบประมาณต่ำสุด (บาท)')).toHaveAttribute('name', 'minBudget');
    expect(screen.getByLabelText('กำหนดส่งถึง')).toHaveAttribute('name', 'deadlineTo');
    expect(screen.getByLabelText('เว็บแอปพลิเคชัน')).toHaveAttribute('name', 'targetPlatforms');
  });

  test('animates open and closed while removing closed controls from interaction', async () => {
    const user = userEvent.setup();
    render(<ProcurementFilters values={EMPTY_SEARCH_FILTERS} />);

    const toggle = screen.getByRole('button', { name: /ตัวกรอง/ });
    const fields = document.getElementById('procurement-filter-fields');
    const animatedPanel = fields?.parentElement;

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(fields).toHaveAttribute('aria-hidden', 'true');
    expect(fields).toHaveAttribute('inert');
    expect(animatedPanel).toHaveClass('grid-rows-[0fr]', 'opacity-0');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(fields).toHaveAttribute('aria-hidden', 'false');
    expect(fields).not.toHaveAttribute('inert');
    expect(animatedPanel).toHaveClass('grid-rows-[1fr]', 'opacity-100');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(animatedPanel).toHaveClass('grid-rows-[0fr]', 'opacity-0');
  });

  test('shows active state and clears filters without losing the search words', () => {
    const values = {
      ...EMPTY_SEARCH_FILTERS,
      query: 'ระบบโรงพยาบาล',
      minBudget: '500000',
      techStack: 'React, PostgreSQL',
      targetPlatforms: ['web_app' as const],
    };
    render(<ProcurementFilters values={values} />);

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ล้างตัวกรอง' })).toHaveAttribute(
      'href',
      '/search?q=%E0%B8%A3%E0%B8%B0%E0%B8%9A%E0%B8%9A%E0%B9%82%E0%B8%A3%E0%B8%87%E0%B8%9E%E0%B8%A2%E0%B8%B2%E0%B8%9A%E0%B8%B2%E0%B8%A5',
    );
    expect(screen.getByLabelText('เว็บแอปพลิเคชัน')).toBeChecked();
  });
});

test('URL filters become the exact server-side request and remain shareable', () => {
  const values = parseSearchFilters({
    q: 'ระบบ',
    minBudget: '500000',
    deadlineTo: '2026-10-15',
    techStack: 'React, PostgreSQL',
    targetPlatforms: 'web_app,mobile',
    industry: 'โรงพยาบาล',
  });

  expect(toProjectFilters(values, 20, 20)).toEqual({
    q: 'ระบบ',
    minBudget: 500000,
    deadlineTo: '2026-10-15',
    techStack: ['React', 'PostgreSQL'],
    targetPlatforms: ['web_app', 'mobile'],
    industry: 'โรงพยาบาล',
    limit: 20,
    offset: 20,
  });
  expect(searchHref(values, 2)).toContain('page=2');
  expect(searchHref(values, 2)).toContain('targetPlatforms=web_app%2Cmobile');
});
