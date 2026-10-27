import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { ThemeToggle } from './theme-toggle';

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark', 'light');
  document.cookie = 'torfun-theme=; Path=/; Max-Age=0';
});

test('switches both ways and persists the selection', () => {
  render(<ThemeToggle initialTheme="light" />);
  fireEvent.click(screen.getByRole('button', { name: 'สลับโหมดกลางคืน' }));
  expect(document.documentElement).toHaveClass('dark');
  expect(document.cookie).toContain('torfun-theme=dark');
  fireEvent.click(screen.getByRole('button', { name: 'สลับโหมดกลางวัน' }));
  expect(document.documentElement).not.toHaveClass('dark');
  expect(document.cookie).toContain('torfun-theme=light');
});

test('restored dark theme offers the light theme action', () => {
  document.documentElement.classList.add('dark');
  render(<ThemeToggle initialTheme="dark" />);
  fireEvent.click(screen.getByRole('button', { name: 'สลับโหมดกลางวัน' }));
  expect(document.documentElement).not.toHaveClass('dark');
  expect(document.cookie).toContain('torfun-theme=light');
});
