/**
 * @jest-environment jsdom
 */
// The quiet group (Areas and History are served; Documents is still planned): proves the separator
// and the quiet link styling from the real NavConfig.
import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import { useMemo } from 'react';
import { screen } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { renderWithRouter } from '../../test/testUtils.js';

jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({ user: { id: '1', role: 'admin' }, logout: jest.fn() }),
}));

jest.unstable_mockModule('../../contexts/ThemeContext.js', () => ({
  useTheme: () => ({ theme: 'system', resolvedTheme: 'light', setTheme: jest.fn() }),
}));

let Host: () => React.JSX.Element;

beforeAll(async () => {
  const { Sidebar } = await import('./Sidebar.js');
  const { navSections } = await import('../../navigation/navConfig.js');
  const { resolveNavActive } = await import('../../navigation/navActive.js');
  // The shell computes the sections and the active entry and hands them down; mirror that here.
  Host = function Host() {
    const { pathname } = useLocation();
    const sections = useMemo(() => navSections({ role: 'admin', paperlessConfigured: false }), []);
    const active = useMemo(() => resolveNavActive(pathname, sections), [pathname, sections]);
    return <Sidebar sections={sections} active={active} />;
  };
});

describe('Sidebar quiet group', () => {
  it('renders a separator and a quiet-styled link for a secondary section', () => {
    const { container } = renderWithRouter(<Host />, {
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
    renderWithRouter(<Host />);

    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveClass('navLinkQuiet');
  });
});
