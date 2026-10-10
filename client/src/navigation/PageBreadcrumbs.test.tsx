/**
 * @jest-environment jsdom
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { useState, type ReactNode } from 'react';
import { act, cleanup, render, renderHook, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n/index.js';
import { PageBreadcrumbs } from './PageBreadcrumbs.js';
import { usePageBreadcrumbs, type ObjectNames } from './usePageBreadcrumbs.js';
import { originStateFor } from './origin.js';
import { BreadcrumbSlotContext } from './breadcrumbSlot.js';

function renderAt(pathname: string, options: { state?: unknown; objectNames?: ObjectNames } = {}) {
  return render(
    <MemoryRouter initialEntries={[{ pathname, state: options.state }]}>
      <PageBreadcrumbs objectNames={options.objectNames} />
    </MemoryRouter>,
  );
}

function trailLabels(): string[] {
  const nav = screen.getByRole('navigation', { name: 'You are here' });
  return within(nav)
    .getAllByRole('link')
    .map((a) => (a.textContent ?? '').replace('‹', ''));
}

describe('PageBreadcrumbs', () => {
  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage('en');
  });

  it('shows only the Tasks parent on a task page, never the task name, and no Back', () => {
    renderAt('/project/work-items/w-1', { objectNames: { workItem: 'Synthetic task' } });

    const nav = screen.getByRole('navigation', { name: 'You are here' });
    expect(within(nav).getAllByRole('link')).toHaveLength(1);
    expect(within(nav).getByRole('link', { name: /Tasks/ })).toHaveAttribute(
      'href',
      '/project/work-items',
    );
    expect(screen.queryByText('Synthetic task')).not.toBeInTheDocument();
    expect(screen.queryByTestId('breadcrumbs-back')).not.toBeInTheDocument();
  });

  it('offers Back to the Calendar with the exact origin URL', () => {
    renderAt('/project/work-items/w-1', {
      state: originStateFor({
        pathname: '/schedule/calendar',
        search: '?calendarMode=week',
        hash: '',
      }),
    });

    const back = screen.getByRole('link', { name: /Back to Calendar/ });
    expect(back).toHaveAttribute('href', '/schedule/calendar?calendarMode=week');
  });

  it('offers Back to Schedule for the Gantt view', () => {
    renderAt('/project/household-items/h-1', {
      state: originStateFor({ pathname: '/schedule/gantt', search: '', hash: '' }),
    });

    expect(screen.getByTestId('breadcrumbs-back')).toHaveTextContent('Back to Schedule');
  });

  it('suppresses Back when the origin is the nearest parent', () => {
    renderAt('/project/work-items/w-1', {
      state: originStateFor({
        pathname: '/project/work-items',
        search: '?status=in_progress',
        hash: '',
      }),
    });

    expect(screen.queryByTestId('breadcrumbs-back')).not.toBeInTheDocument();
    expect(trailLabels()).toEqual(['Tasks']);
  });

  it('suppresses Back when the origin is the page itself', () => {
    renderAt('/project/work-items/w-1', {
      state: originStateFor({ pathname: '/project/work-items/w-1', search: '?tab=x', hash: '' }),
    });

    expect(screen.queryByTestId('breadcrumbs-back')).not.toBeInTheDocument();
  });

  it('labels Back with the origin object name and shows the milestone trail', () => {
    renderAt('/project/milestones/7', {
      state: originStateFor(
        { pathname: '/project/work-items/w-2', search: '', hash: '' },
        'Synthetic task',
      ),
    });

    expect(screen.getByTestId('breadcrumbs-back')).toHaveTextContent('Back to Synthetic task');
    expect(trailLabels()).toEqual(['Tasks', 'Milestones']);
  });

  it('keeps the row pending, with only the static parent, while the purchase name is unknown', () => {
    renderAt('/project/household-items/h-1/edit');

    expect(trailLabels()).toEqual(['Purchases']);
    expect(screen.getByTestId('breadcrumbs')).toBeInTheDocument();
  });

  it('shows the purchase name in the trail once known', () => {
    renderAt('/project/household-items/h-1/edit', {
      objectNames: { householdItem: '  Synthetic sofa ' },
    });

    expect(trailLabels()).toEqual(['Purchases', 'Synthetic sofa']);
    const sofa = screen.getByRole('link', { name: /Synthetic sofa/ });
    expect(sofa).toHaveAttribute('href', '/project/household-items/h-1');
    expect(sofa).toHaveClass('linkDynamic');
  });

  it('keeps Back suppressed for the purchase origin even while its name is pending', () => {
    renderAt('/project/household-items/h-1/edit', {
      state: originStateFor({ pathname: '/project/household-items/h-1', search: '', hash: '' }),
    });

    expect(screen.queryByTestId('breadcrumbs-back')).not.toBeInTheDocument();
  });

  it('ignores a blank object name', () => {
    renderAt('/project/household-items/h-1/edit', { objectNames: { householdItem: '   ' } });

    expect(trailLabels()).toEqual(['Purchases']);
  });

  it('shows no Back for an origin page without a label', () => {
    renderAt('/project/work-items/w-1', {
      state: originStateFor({ pathname: '/budget/invoices/i-1', search: '', hash: '' }),
    });

    expect(screen.queryByTestId('breadcrumbs-back')).not.toBeInTheDocument();
    expect(trailLabels()).toEqual(['Tasks']);
  });

  it('ignores origin state that is not a valid in-app URL', () => {
    renderAt('/project/work-items/w-1', {
      state: { origin: { to: 'https://evil.example/', name: 'Evil' } },
    });

    expect(screen.queryByTestId('breadcrumbs-back')).not.toBeInTheDocument();
  });

  it('renders nothing on a view, even with an origin', () => {
    const { container } = renderAt('/project/milestones', {
      state: originStateFor({ pathname: '/project/overview', search: '', hash: '' }),
    });

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on an unmatched path', () => {
    const { container } = renderAt('/no/such/page');

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the Tasks parent on the New task page', () => {
    renderAt('/project/work-items/new');

    expect(trailLabels()).toEqual(['Tasks']);
  });

  it('re-labels the trail and Back when the language changes', async () => {
    renderAt('/project/work-items/w-1', {
      state: originStateFor({ pathname: '/schedule/calendar', search: '', hash: '' }),
    });
    expect(screen.getByTestId('breadcrumbs-back')).toHaveTextContent('Back to Calendar');

    await act(async () => {
      await i18n.changeLanguage('de');
    });

    expect(screen.getByTestId('breadcrumbs-back')).toHaveTextContent('Zurück zu Kalender');
    expect(
      screen.getByRole('navigation', { name: 'Du bist hier' }).querySelector('a'),
    ).toHaveTextContent('Aufgaben');
  });
  describe('Money pages (#2203)', () => {
    it('shows the Money and Invoices trail and Back to a company origin on an invoice', () => {
      renderAt('/budget/invoices/i-1', {
        state: originStateFor(
          { pathname: '/settings/vendors/v-1', search: '', hash: '' },
          'Synthetic Builders',
        ),
      });

      const back = screen.getByTestId('breadcrumbs-back');
      expect(back).toHaveTextContent('Back to Synthetic Builders');
      expect(back).toHaveAttribute('href', '/settings/vendors/v-1');
      expect(trailLabels()).toEqual(['Money', 'Invoices']);
      const nav = screen.getByRole('navigation', { name: 'You are here' });
      expect(within(nav).getByRole('link', { name: /Money/ })).toHaveAttribute(
        'href',
        '/budget/overview',
      );
      expect(within(nav).getByRole('link', { name: /Invoices/ })).toHaveAttribute(
        'href',
        '/budget/invoices',
      );
      expect(screen.queryByText('Synthetic Builders · SB-7')).not.toBeInTheDocument();
    });

    it('suppresses Back when an invoice was opened from the Invoices list', () => {
      renderAt('/budget/invoices/i-1', {
        state: originStateFor({
          pathname: '/budget/invoices',
          search: '?status=pending',
          hash: '',
        }),
      });

      expect(screen.queryByTestId('breadcrumbs-back')).not.toBeInTheDocument();
    });

    it('offers Back to Funding sources on the Bank report', () => {
      renderAt('/budget/reports', {
        state: originStateFor({ pathname: '/budget/sources', search: '', hash: '' }),
      });

      expect(screen.getByTestId('breadcrumbs-back')).toHaveTextContent('Back to Funding sources');
      expect(trailLabels()).toEqual(['Money']);
    });

    it('labels Back with the page label of a non-view origin on a task page', () => {
      renderAt('/project/work-items/w-1', {
        state: originStateFor({ pathname: '/budget/reports', search: '', hash: '' }),
      });

      expect(screen.getByTestId('breadcrumbs-back')).toHaveTextContent('Back to Bank report');
    });

    it('keeps the invoice row pending until the invoice name is known on Split with AI', () => {
      const { unmount } = renderAt('/budget/invoices/i-1/auto-itemize/3');
      expect(trailLabels()).toEqual(['Money', 'Invoices']);
      expect(screen.getByTestId('breadcrumbs')).toBeInTheDocument();
      unmount();

      renderAt('/budget/invoices/i-1/auto-itemize/3', {
        objectNames: { invoice: 'Synthetic Builders · SB-7' },
      });
      expect(trailLabels()).toEqual(['Money', 'Invoices', 'Synthetic Builders · SB-7']);
      expect(screen.getByRole('link', { name: /Synthetic Builders · SB-7/ })).toHaveClass(
        'linkDynamic',
      );
    });

    it.each(['/budget/overview', '/budget/invoices'])('renders nothing on the view %s', (path) => {
      const { container } = renderAt(path, {
        state: originStateFor({ pathname: '/project/overview', search: '', hash: '' }),
      });

      expect(container).toBeEmptyDOMElement();
    });

    it('shows the Companies trail on the company page', () => {
      renderAt('/settings/vendors/v-1');

      expect(trailLabels()).toEqual(['Companies']);
      expect(screen.getByRole('link', { name: /Companies/ })).toHaveAttribute(
        'href',
        '/settings/vendors',
      );
    });
  });

  describe('Diary entry trail and null object names (#2204)', () => {
    function hookAt(pathname: string, objectNames: ObjectNames, state?: unknown) {
      return renderHook(() => usePageBreadcrumbs(objectNames), {
        wrapper: ({ children }) => (
          <MemoryRouter initialEntries={[{ pathname, state }]}>{children}</MemoryRouter>
        ),
      });
    }

    it('skips the entry ancestor for a null name: only Site diary, and not pending', () => {
      const { result } = hookAt('/diary/d-1/edit', { diaryEntry: null });

      expect(result.current.parents.map((p) => p.label)).toEqual(['Site diary']);
      // Mutation: treating null like undefined would leave pending === true.
      expect(result.current.pending).toBeFalsy();
    });

    it('keeps the entry ancestor pending while its name is undefined', () => {
      const { result } = hookAt('/diary/d-1/edit', { diaryEntry: undefined });

      expect(result.current.parents.map((p) => p.label)).toEqual(['Site diary']);
      expect(result.current.pending).toBe(true);
    });

    it('shows the entry name once known', () => {
      const { result } = hookAt('/diary/d-1/edit', { diaryEntry: 'Synthetic pour' });

      expect(result.current.parents.map((p) => p.label)).toEqual(['Site diary', 'Synthetic pour']);
      expect(result.current.pending).toBeFalsy();
    });

    it('suppresses Back for an origin of the diary list when the entry is skipped (Site diary is now nearest)', () => {
      // Mutation: treating null like undefined keeps the entry as nearest and shows Back.
      renderAt('/diary/d-1/edit', {
        objectNames: { diaryEntry: null },
        state: originStateFor({ pathname: '/diary', search: '', hash: '' }),
      });

      expect(trailLabels()).toEqual(['Site diary']);
      expect(screen.queryByTestId('breadcrumbs-back')).not.toBeInTheDocument();
    });

    it('offers Back to Home for an origin of the project overview when the entry is skipped', () => {
      renderAt('/diary/d-1/edit', {
        objectNames: { diaryEntry: null },
        state: originStateFor({ pathname: '/project/overview', search: '', hash: '' }),
      });

      expect(screen.getByTestId('breadcrumbs-back')).toHaveTextContent('Back to Home');
    });

    it('suppresses Back for the entry itself while its name is undefined (pending)', () => {
      renderAt('/diary/d-1/edit', {
        objectNames: { diaryEntry: undefined },
        state: originStateFor({ pathname: '/diary/d-1', search: '', hash: '' }),
      });

      expect(screen.queryByTestId('breadcrumbs-back')).not.toBeInTheDocument();
    });

    it('contrast: the same diary-list origin is not suppressed while the entry ancestor is present', () => {
      renderAt('/diary/d-1/edit', {
        objectNames: { diaryEntry: 'Synthetic pour' },
        state: originStateFor({ pathname: '/diary', search: '', hash: '' }),
      });

      expect(trailLabels()).toEqual(['Site diary', 'Synthetic pour']);
      expect(screen.getByTestId('breadcrumbs-back')).toHaveTextContent('Back to Site diary');
    });
  });
});

describe('PageBreadcrumbs in the top bar (>= 1024 px)', () => {
  const originalMatchMedia = window.matchMedia;

  function setWide(wide: boolean) {
    window.matchMedia = (query: string): MediaQueryList =>
      ({
        matches: wide && query === '(min-width: 1024px)',
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }

  afterEach(() => {
    cleanup();
    window.matchMedia = originalMatchMedia;
  });

  function Shell({ withSlot, children }: { withSlot: boolean; children: ReactNode }) {
    const [slot, setSlot] = useState<HTMLDivElement | null>(null);
    return (
      <BreadcrumbSlotContext value={withSlot ? slot : null}>
        <div data-testid="bar-slot" ref={setSlot} />
        <main data-testid="page">{children}</main>
      </BreadcrumbSlotContext>
    );
  }

  function renderShell(withSlot: boolean) {
    return render(
      <MemoryRouter initialEntries={['/project/work-items/w-1']}>
        <Shell withSlot={withSlot}>
          <PageBreadcrumbs />
        </Shell>
      </MemoryRouter>,
    );
  }

  it('renders the row inside the bar slot and not in the page when wide and a slot exists', () => {
    setWide(true);
    renderShell(true);

    const slot = screen.getByTestId('bar-slot');
    expect(within(slot).getByTestId('breadcrumbs')).toHaveClass('rowBar');
    expect(within(screen.getByTestId('page')).queryByTestId('breadcrumbs')).toBeNull();
    expect(screen.getAllByRole('navigation', { name: 'You are here' })).toHaveLength(1);
  });

  it('renders inline when wide but there is no slot (outside the shell)', () => {
    setWide(true);
    renderShell(false);

    expect(within(screen.getByTestId('page')).getByTestId('breadcrumbs')).not.toHaveClass('rowBar');
    expect(within(screen.getByTestId('bar-slot')).queryByTestId('breadcrumbs')).toBeNull();
    expect(screen.getAllByRole('navigation', { name: 'You are here' })).toHaveLength(1);
  });

  it('renders inline when narrow even though a slot exists', () => {
    setWide(false);
    renderShell(true);

    expect(within(screen.getByTestId('page')).getByTestId('breadcrumbs')).toBeInTheDocument();
    expect(within(screen.getByTestId('bar-slot')).queryByTestId('breadcrumbs')).toBeNull();
    expect(screen.getAllByRole('navigation', { name: 'You are here' })).toHaveLength(1);
  });

  it('renders inline with the default jsdom matchMedia (no polyfill override)', () => {
    renderShell(true);

    expect(within(screen.getByTestId('page')).getByTestId('breadcrumbs')).toBeInTheDocument();
  });
});
