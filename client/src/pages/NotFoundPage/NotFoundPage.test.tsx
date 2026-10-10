import { describe, it, expect } from '@jest/globals';
import { screen } from '@testing-library/react';
import { NotFoundPage } from './NotFoundPage';
import { renderWithRouter } from '../../test/testUtils';

describe('NotFoundPage', () => {
  it('renders exactly one level-1 heading, "Page not found" (no "404 -")', () => {
    renderWithRouter(<NotFoundPage />);

    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(/^Page not found$/);
    expect(screen.queryByText(/404/)).not.toBeInTheDocument();
  });

  it('sets the tab title to "Page not found · Cornerstone" outside every section', () => {
    renderWithRouter(<NotFoundPage />, { initialEntries: ['/does-not-exist'] });

    expect(document.title).toBe('Page not found · Cornerstone');
  });

  it('renders descriptive message', () => {
    renderWithRouter(<NotFoundPage />);

    expect(
      screen.getByText(/the page you are looking for does not exist or has been moved/i),
    ).toBeInTheDocument();
  });

  it('offers "Go to Home" (not "Back to", a 404 has no back) pointing at the home route (/)', () => {
    renderWithRouter(<NotFoundPage />);

    const homeLink = screen.getByRole('link', { name: 'Go to Home' });
    expect(homeLink).toHaveAttribute('href', '/');
    expect(screen.queryByText(/Back to/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Project Overview/)).not.toBeInTheDocument();
  });
});
