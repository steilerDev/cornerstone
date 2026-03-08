import { screen } from '@testing-library/react';
import { renderWithRouter } from '../../test/testUtils';
import { DashboardPage } from './DashboardPage';

describe('DashboardPage', () => {
  it('renders Overview title', () => {
    renderWithRouter(<DashboardPage />);

    expect(screen.getByRole('heading', { name: /^overview$/i })).toBeInTheDocument();
  });

  it('renders descriptive welcome message', () => {
    renderWithRouter(<DashboardPage />);

    expect(
      screen.getByText(/welcome to cornerstone.*overview of your home building project/i),
    ).toBeInTheDocument();
  });
});
