/**
 * @jest-environment jsdom
 */
// The quiet group (Areas, History, Documents) has no served page yet, so NavConfig is patched to
// serve one secondary section and the separator and quiet link styling can be proven.
import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import { screen } from '@testing-library/react';
import { renderWithRouter } from '../../test/testUtils.js';
import type * as SidebarTypes from './Sidebar.js';

jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({ user: { id: '1', role: 'admin' }, logout: jest.fn() }),
}));
jest.unstable_mockModule('../../contexts/ThemeContext.js', () => ({
  useTheme: () => ({ theme: 'system', resolvedTheme: 'light', setTheme: jest.fn() }),
}));

let Sidebar: typeof SidebarTypes.Sidebar;

beforeAll(async () => {
  const actual = await import('../../navigation/navConfig.js');
  jest.unstable_mockModule('../../navigation/navConfig.js', () => ({
    ...actual,
    navSections: (ctx: Parameters<typeof actual.navSections>[0]) => {
      const served = actual.navSections(ctx);
      // Areas is planned in the real map; give the fixture a served route in the quiet group.
      const photos = served.find((s) => s.id === 'photos');
      if (!photos) throw new Error('fixture needs the photos section');
      return [
        ...served,
        {
          ...photos,
          id: 'areas',
          group: 'secondary',
          labelKey: 'navigation.areas',
          views: [],
        },
      ];
    },
  }));
  ({ Sidebar } = await import('./Sidebar.js'));
});

describe('Sidebar quiet group', () => {
  it('renders a separator and a quiet-styled link for a secondary section', () => {
    const { container } = renderWithRouter(<Sidebar isOpen={false} onClose={jest.fn()} />, {
      initialEntries: ['/project/work-items'],
    });

    expect(container.querySelector('[class*="navSeparator"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    const quiet = screen.getByRole('link', { name: 'Areas' });
    expect(quiet).toHaveClass('navLinkQuiet');
    expect(quiet.closest('ul')).not.toBe(screen.getByRole('link', { name: 'Home' }).closest('ul'));
  });

  it('keeps primary links without the quiet class', () => {
    renderWithRouter(<Sidebar isOpen={false} onClose={jest.fn()} />);

    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveClass('navLinkQuiet');
  });
});
