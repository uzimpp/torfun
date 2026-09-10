import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';

import { OnboardingSteps } from './steps';

afterEach(cleanup);

/**
 * The stepper carries no state of its own, so what is worth asserting is the
 * mapping from "which step am I on" to what a person — and a screen reader —
 * can tell about the other two.
 */

const stepNamed = (label: string) =>
  screen.getByText(new RegExp(`^ขั้นตอนที่ \\d+: ${label}`)).closest('li')!;

test('the step being worked on is the only one marked current', () => {
  render(<OnboardingSteps current="company" />);
  expect(stepNamed('บริษัท')).toHaveAttribute('aria-current', 'step');
  expect(stepNamed('บัญชีผู้ใช้')).not.toHaveAttribute('aria-current');
  expect(stepNamed('ผลงาน')).not.toHaveAttribute('aria-current');
});

test('steps before the current one read as finished, later ones do not', () => {
  render(<OnboardingSteps current="experiences" />);
  expect(stepNamed('บัญชีผู้ใช้')).toHaveTextContent('เสร็จแล้ว');
  expect(stepNamed('บริษัท')).toHaveTextContent('เสร็จแล้ว');
  expect(stepNamed('ผลงาน')).not.toHaveTextContent('เสร็จแล้ว');
  expect(stepNamed('ผลงาน')).toHaveTextContent('กำลังทำ');
});

test('the first step has nothing finished before it', () => {
  render(<OnboardingSteps current="account" />);
  expect(screen.queryByText(/เสร็จแล้ว/)).not.toBeInTheDocument();
});

test('a finished step shows a mark instead of its number', () => {
  render(<OnboardingSteps current="company" />);
  // Step one is done, so "1" is gone; step three is still ahead, so "3" remains.
  expect(screen.queryByText('1')).not.toBeInTheDocument();
  expect(screen.getByText('3')).toBeInTheDocument();
});
