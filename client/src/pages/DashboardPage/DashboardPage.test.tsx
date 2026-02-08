import { render, screen } from '@testing-library/react';
import { DashboardPage } from './DashboardPage';

describe('DashboardPage', () => {
  it('renders Dashboard title', () => {
    render(<DashboardPage />);

    expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
  });

  it('renders descriptive welcome message', () => {
    render(<DashboardPage />);

    expect(
      screen.getByText(/welcome to cornerstone.*overview of your home building project/i),
    ).toBeInTheDocument();
  });
});
