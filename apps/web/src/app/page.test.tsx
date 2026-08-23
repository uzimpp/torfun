import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { HomePage } from '@/features/tors/pages/home-page';

describe('Home', () => {
  test('renders the recommended TOR section', async () => {
    render(await HomePage());
    expect(screen.getByRole('heading', { name: 'หน้าหลัก' })).toBeInTheDocument();
    expect(screen.getByText('TOR แนะนำ')).toBeInTheDocument();
  });
});
