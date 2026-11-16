import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { TorReviewBackButton } from './tor-review-back-button';

const { back, replace } = vi.hoisted(() => ({
  back: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back, replace }),
}));

describe('TorReviewBackButton', () => {
  beforeEach(() => {
    back.mockReset();
    replace.mockReset();
    window.history.replaceState(
      null,
      '',
      '/tor/project-1?returnTo=%2Fsearch%3Forder%3DbudgetDesc%26page%3D2',
    );
  });

  test('returns to search with its selected sorting and page', () => {
    render(<TorReviewBackButton />);

    fireEvent.click(screen.getByRole('button', { name: 'ย้อนกลับ' }));

    expect(replace).toHaveBeenCalledWith('/search?order=budgetDesc&page=2');
    expect(back).not.toHaveBeenCalled();
  });

  test('uses browser history when no search return URL was provided', () => {
    window.history.replaceState(null, '', '/tor/project-1');
    render(<TorReviewBackButton />);

    fireEvent.click(screen.getByRole('button', { name: 'ย้อนกลับ' }));

    expect(back).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
  });
});
