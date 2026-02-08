import { screen } from '@testing-library/react';
import { NotFoundPage } from './NotFoundPage';
import { renderWithRouter } from '../../test/testUtils';

describe('NotFoundPage', () => {
  it('renders 404 title', () => {
    renderWithRouter(<NotFoundPage />);

    expect(screen.getByRole('heading', { name: /404.*not found/i })).toBeInTheDocument();
  });

  it('renders descriptive message', () => {
    renderWithRouter(<NotFoundPage />);

    expect(
      screen.getByText(/the page you are looking for does not exist or has been moved/i),
    ).toBeInTheDocument();
  });

  it('contains link back to Dashboard', () => {
    renderWithRouter(<NotFoundPage />);

    const homeLink = screen.getByRole('link', { name: /go back to dashboard/i });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute('href', '/');
  });
});
