import { describe, it, expect } from '@jest/globals';
import { screen } from '@testing-library/react';
import { NoAccessPage } from './NoAccessPage';
import { renderWithRouter } from '../../test/testUtils';

describe('NoAccessPage', () => {
  it('renders "No access" as the one and only level-1 heading', () => {
    renderWithRouter(<NoAccessPage />);

    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(/^No access$/);
    expect(screen.queryByText(/have access to this page/)).not.toBeInTheDocument();
  });

  it('sets the tab title without the section segment, even at an admin route', () => {
    // Mutation: dropping { section: false } would give "No access · Settings · Cornerstone".
    renderWithRouter(<NoAccessPage />, { initialEntries: ['/settings/users'] });

    expect(document.title).toBe('No access · Cornerstone');
  });

  it('renders the description', () => {
    renderWithRouter(<NoAccessPage />);

    expect(screen.getByText('Ask an administrator if you need it')).toBeInTheDocument();
  });

  it('links back to Home (/project)', () => {
    renderWithRouter(<NoAccessPage />);

    expect(screen.getByRole('link', { name: 'Back to Home' })).toHaveAttribute('href', '/project');
  });

  it('hides the lock icon from assistive technology', () => {
    const { container } = renderWithRouter(<NoAccessPage />);

    const iconWrapper = container.querySelector('[aria-hidden="true"]');
    expect(iconWrapper).not.toBeNull();
    expect(iconWrapper?.querySelector('svg')).not.toBeNull();
  });

  it('exposes the no-access-page test id', () => {
    renderWithRouter(<NoAccessPage />);

    expect(screen.getByTestId('no-access-page')).toBeInTheDocument();
  });
});
