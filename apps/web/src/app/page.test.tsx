import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import Home from './page';

describe('Home', () => {
  test('renders the TOR finder heading in Thai', () => {
    render(<Home />);
    expect(screen.getByText('ระบบค้นหาประกาศ TOR')).toBeInTheDocument();
  });
});
