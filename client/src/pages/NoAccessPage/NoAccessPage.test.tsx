import { describe, it, expect } from '@jest/globals';
import { screen } from '@testing-library/react';
import { NoAccessPage } from './NoAccessPage';
import { renderWithRouter } from '../../test/testUtils';

describe('NoAccessPage', () => {
  it('renders the message as the level-1 heading', () => {
    renderWithRouter(<NoAccessPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: "You don't have access to this page" }),
    ).toBeInTheDocument();
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
