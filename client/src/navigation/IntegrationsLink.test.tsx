/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { UserRole } from '@cornerstone/shared';
import type * as LinkTypes from './IntegrationsLink.js';

let authState: { user: { id: string; role: UserRole } | null } = { user: null };

jest.unstable_mockModule('../contexts/AuthContext.js', () => ({
  useAuth: () => authState,
}));

describe('IntegrationsLink', () => {
  let mod: typeof LinkTypes;

  beforeEach(async () => {
    mod ??= await import('./IntegrationsLink.js');
    authState = { user: null };
  });

  function renderLink(anchor: LinkTypes.IntegrationAnchor = 'paperless', className?: string) {
    return render(
      <MemoryRouter>
        <mod.IntegrationsLink anchor={anchor} testId="link" className={className} />
      </MemoryRouter>,
    );
  }

  it('lists the nine card anchors in page order', () => {
    expect([...mod.INTEGRATION_ANCHORS]).toEqual([
      'paperless',
      'ai',
      'single-sign-on',
      'calendar-contacts',
      'automatic-backups',
      'history',
      'currency-vat',
      'photos',
      'public-address',
    ]);
  });

  it('links an admin to the card on the Integrations page', () => {
    authState = { user: { id: '1', role: 'admin' } };

    renderLink('paperless');

    const link = screen.getByTestId('link');
    expect(link).toHaveAttribute('href', '/settings/integrations#paperless');
    expect(link).toHaveTextContent('See Integrations');
  });

  it('uses the requested anchor and merges an extra class name', () => {
    authState = { user: { id: '1', role: 'admin' } };

    renderLink('automatic-backups', 'extra');

    const link = screen.getByTestId('link');
    expect(link).toHaveAttribute('href', '/settings/integrations#automatic-backups');
    expect(link).toHaveClass('extra');
  });

  it('renders nothing for a member', () => {
    authState = { user: { id: '2', role: 'member' } };

    const { container } = renderLink();

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when nobody is signed in', () => {
    const { container } = renderLink();

    expect(container).toBeEmptyDOMElement();
  });
});
