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

function Page({ title }: { title: string | null | undefined }) {
  useDocumentTitle(title);
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
});
