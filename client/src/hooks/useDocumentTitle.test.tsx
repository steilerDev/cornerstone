/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter, Link, Route, Routes } from 'react-router-dom';
import i18n from '../i18n/index.js';
import type * as UseDocumentTitleTypes from './useDocumentTitle.js';
import type * as RouteTitleFallbackTypes from '../navigation/RouteTitleFallback.js';

// The house name is driven by a plain variable so no auth/settings plumbing is needed here.
const houseState: { name: string | null } = { name: null };
jest.unstable_mockModule('../contexts/HouseNameContext.js', () => ({
  useHouseName: () => ({ houseName: houseState.name, setHouseName: () => {} }),
}));

let useDocumentTitle: typeof UseDocumentTitleTypes.useDocumentTitle;
let RouteTitleFallback: typeof RouteTitleFallbackTypes.RouteTitleFallback;

beforeAll(async () => {
  ({ useDocumentTitle } = await import('./useDocumentTitle.js'));
  ({ RouteTitleFallback } = await import('../navigation/RouteTitleFallback.js'));
});

function Page({
  title,
  options,
}: {
  title: string | null | undefined;
  options?: UseDocumentTitleTypes.DocumentTitleOptions;
}) {
  useDocumentTitle(title, options);
  return <div>page</div>;
}

describe('useDocumentTitle', () => {
  beforeEach(() => {
    houseState.name = null;
    document.title = 'initial';
  });

  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage('en');
  });

  it('falls back to the product name without a house (page equals section collapses)', () => {
    render(
      <MemoryRouter initialEntries={['/project/work-items']}>
        <Page title="Tasks" />
      </MemoryRouter>,
    );

    expect(document.title).toBe('Tasks · Cornerstone');
  });

  it('composes page, section and house for an object page', () => {
    houseState.name = 'Synthetic House';

    render(
      <MemoryRouter initialEntries={['/project/milestones/7']}>
        <Page title="Synthetic milestone" />
      </MemoryRouter>,
    );

    expect(document.title).toBe('Synthetic milestone · Tasks · Synthetic House');
  });

  it('omits the section outside every section', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Page title="Sign in" />
      </MemoryRouter>,
    );

    expect(document.title).toBe('Sign in · Cornerstone');
  });

  it('omits the section on a path the route map does not know', () => {
    render(
      <MemoryRouter initialEntries={['/no-such-page']}>
        <Page title="Synthetic" />
      </MemoryRouter>,
    );
    expect(document.title).toBe('Synthetic · Cornerstone');
  });

  it('puts the prefix option before the title (#2231)', () => {
    houseState.name = 'Testhaus';
    render(
      <MemoryRouter initialEntries={['/']}>
        <Page title="Home" options={{ prefix: '(3)' }} />
      </MemoryRouter>,
    );
    expect(document.title).toBe('(3) Home · Testhaus');
  });

  it('adds and drops the prefix as the option changes', () => {
    houseState.name = 'Testhaus';
    const ui = (prefix: string | null) => (
      <MemoryRouter initialEntries={['/']}>
        <Page title="Home" options={{ prefix }} />
      </MemoryRouter>
    );
    const { rerender } = render(ui(null));
    expect(document.title).toBe('Home · Testhaus');
    rerender(ui('(2)'));
    expect(document.title).toBe('(2) Home · Testhaus');
    rerender(ui(null));
    expect(document.title).toBe('Home · Testhaus');
  });

  it('updates when the page title changes (a rename)', () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/project/work-items/w-1']}>
        <Page title="Old name" />
      </MemoryRouter>,
    );
    expect(document.title).toBe('Old name · Tasks · Cornerstone');

    rerender(
      <MemoryRouter initialEntries={['/project/work-items/w-1']}>
        <Page title="New name" />
      </MemoryRouter>,
    );

    expect(document.title).toBe('New name · Tasks · Cornerstone');
  });

  it('re-labels the section word when the language changes', async () => {
    render(
      <MemoryRouter initialEntries={['/project/work-items/w-1']}>
        <Page title="Synthetic task" />
      </MemoryRouter>,
    );
    expect(document.title).toBe('Synthetic task · Tasks · Cornerstone');

    await act(async () => {
      await i18n.changeLanguage('de');
    });

    expect(document.title).toBe('Synthetic task · Aufgaben · Cornerstone');
  });

  it('uses no page segment for null and undefined', () => {
    houseState.name = 'X';
    const { rerender } = render(
      <MemoryRouter initialEntries={['/project/milestones']}>
        <Page title={null} />
      </MemoryRouter>,
    );
    expect(document.title).toBe('Tasks · X');

    rerender(
      <MemoryRouter initialEntries={['/project/milestones']}>
        <Page title={undefined} />
      </MemoryRouter>,
    );
    expect(document.title).toBe('Tasks · X');
  });

  it('re-asserts the title when navigating between two objects with the same page title', () => {
    function App() {
      return (
        <MemoryRouter initialEntries={['/project/work-items/a']}>
          <RouteTitleFallback />
          <Link to="/project/work-items/b">next</Link>
          <Routes>
            <Route path="/project/work-items/:id" element={<Page title="Same name" />} />
          </Routes>
        </MemoryRouter>
      );
    }
    const { getByText } = render(<App />);
    expect(document.title).toBe('Same name · Tasks · Cornerstone');

    act(() => {
      getByText('next').click();
    });

    // The fallback ran (layout effect) and reset the title; the page must win again.
    expect(document.title).toBe('Same name · Tasks · Cornerstone');
  });

  it('wins over the root fallback on the initial commit', () => {
    render(
      <MemoryRouter initialEntries={['/project/work-items/a']}>
        <RouteTitleFallback />
        <Page title="Page title" />
      </MemoryRouter>,
    );

    expect(document.title).toBe('Page title · Tasks · Cornerstone');
  });

  describe('options (#2204)', () => {
    it('keeps the section by default at a settings route (contrast for section: false)', () => {
      houseState.name = 'Synthetic House';

      render(
        <MemoryRouter initialEntries={['/settings/users']}>
          <Page title="No access" />
        </MemoryRouter>,
      );

      expect(document.title).toBe('No access · Settings · Synthetic House');
    });

    it('section: false drops the section segment but keeps the house', () => {
      houseState.name = 'Synthetic House';

      render(
        <MemoryRouter initialEntries={['/settings/users']}>
          <Page title="No access" options={{ section: false }} />
        </MemoryRouter>,
      );

      expect(document.title).toBe('No access · Synthetic House');
    });

    it('house: false uses the product name even when a house name is known', () => {
      houseState.name = 'Synthetic House';

      render(
        <MemoryRouter initialEntries={['/login']}>
          <Page title="Sign In" options={{ section: false, house: false }} />
        </MemoryRouter>,
      );

      expect(document.title).toBe('Sign In · Cornerstone');
    });

    it('house: false alone keeps the section and swaps the house for the product name', () => {
      houseState.name = 'Synthetic House';

      render(
        <MemoryRouter initialEntries={['/settings/users']}>
          <Page title="Users" options={{ house: false }} />
        </MemoryRouter>,
      );

      expect(document.title).toBe('Users · Settings · Cornerstone');
    });

    it('re-asserts the title when an option toggles (the booleans are effect dependencies)', () => {
      houseState.name = 'Synthetic House';
      const tree = (section: boolean) => (
        <MemoryRouter initialEntries={['/settings/users']}>
          <Page title="No access" options={{ section }} />
        </MemoryRouter>
      );
      const { rerender } = render(tree(true));
      expect(document.title).toBe('No access · Settings · Synthetic House');

      rerender(tree(false));
      expect(document.title).toBe('No access · Synthetic House');

      rerender(tree(true));
      expect(document.title).toBe('No access · Settings · Synthetic House');
    });

    it('does not rewrite the title on a rerender with an equal options object', () => {
      houseState.name = 'Synthetic House';
      const tree = (
        <MemoryRouter initialEntries={['/settings/users']}>
          <Page title="No access" options={{ section: false }} />
        </MemoryRouter>
      );
      const { rerender } = render(tree);
      document.title = 'changed by someone else';

      rerender(tree);

      expect(document.title).toBe('changed by someone else');
    });
  });
});

describe('useDocumentTitle real-location key (#2212)', () => {
  beforeEach(() => {
    houseState.name = null;
  });

  afterEach(() => {
    cleanup();
  });

  it('re-asserts the title when only the real location key changes (a dialog opens over the page)', async () => {
    const { RealLocationKeyContext } = await import('../navigation/realLocation.js');
    const tree = (key: string) => (
      <MemoryRouter initialEntries={['/project/work-items']}>
        <RealLocationKeyContext value={key}>
          <Page title="Tasks" />
        </RealLocationKeyContext>
      </MemoryRouter>
    );
    const { rerender } = render(tree('k1'));
    expect(document.title).toBe('Tasks · Cornerstone');

    // A root fallback resets the title while the display location stays the same.
    document.title = 'reset by someone else';
    rerender(tree('k1'));
    expect(document.title).toBe('reset by someone else');

    rerender(tree('k2'));
    expect(document.title).toBe('Tasks · Cornerstone');
  });
});

describe('useDocumentTitle overlay (#2212)', () => {
  beforeEach(() => {
    houseState.name = null;
    document.title = 'initial';
  });

  afterEach(() => {
    cleanup();
  });

  const tree = (parts: { overlay?: boolean; page?: boolean; key?: string }) => (
    <MemoryRouter initialEntries={['/project/work-items']}>
      {parts.page ? <Page title="Tasks" /> : null}
      {parts.overlay ? <Page title="New task" options={{ overlay: true }} /> : null}
    </MemoryRouter>
  );

  it('an overlay writes its own title', () => {
    render(tree({ overlay: true }));
    expect(document.title).toBe('New task · Tasks · Cornerstone');
  });

  it('a page that mounts late does not overwrite the overlay title', () => {
    const { rerender } = render(tree({ overlay: true }));
    rerender(tree({ overlay: true, page: true }));
    expect(document.title).toBe('New task · Tasks · Cornerstone');
  });

  it('a page mounted before the overlay is overridden by it', () => {
    const { rerender } = render(tree({ page: true }));
    expect(document.title).toBe('Tasks · Cornerstone');
    rerender(tree({ page: true, overlay: true }));
    expect(document.title).toBe('New task · Tasks · Cornerstone');
  });

  it('after the overlay unmounts the page title is written again on the next navigation', async () => {
    const { RealLocationKeyContext } = await import('../navigation/realLocation.js');
    const withKey = (key: string, overlay: boolean) => (
      <MemoryRouter initialEntries={['/project/work-items']}>
        <RealLocationKeyContext value={key}>
          <Page title="Tasks" />
          {overlay ? <Page title="New task" options={{ overlay: true }} /> : null}
        </RealLocationKeyContext>
      </MemoryRouter>
    );
    const { rerender } = render(withKey('k1', true));
    expect(document.title).toBe('New task · Tasks · Cornerstone');

    rerender(withKey('k1', false));
    // Silent until something re-asserts: the page effect has not re-run.
    expect(document.title).toBe('New task · Tasks · Cornerstone');

    rerender(withKey('k2', false));
    expect(document.title).toBe('Tasks · Cornerstone');
  });

  it('two overlays keep pages silent until both are gone', () => {
    const both = (a: boolean, b: boolean, page: boolean) => (
      <MemoryRouter initialEntries={['/project/work-items']}>
        {a ? <Page title="A" options={{ overlay: true }} /> : null}
        {b ? <Page title="B" options={{ overlay: true }} /> : null}
        {page ? <Page title="Tasks" /> : null}
      </MemoryRouter>
    );
    const { rerender } = render(both(true, true, false));
    rerender(both(false, true, true));
    expect(document.title).not.toBe('Tasks · Cornerstone');
    rerender(both(false, false, true));
    expect(document.title).not.toBe('Tasks · Cornerstone');
  });
});
