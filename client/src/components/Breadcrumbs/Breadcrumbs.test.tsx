/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Breadcrumbs } from './Breadcrumbs.js';
import type { BreadcrumbsProps } from './Breadcrumbs.js';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';

// CSS modules are mocked via identity-obj-proxy (class names are returned as written).

function Where() {
  const { pathname, search } = useLocation();
  return <div data-testid="where">{`${pathname}${search}`}</div>;
}

function renderCrumbs(props: BreadcrumbsProps) {
  return render(
    <MemoryRouter initialEntries={['/start']}>
      <Breadcrumbs {...props} />
      <Where />
    </MemoryRouter>,
  );
}

const TASKS = { label: 'Tasks', href: '/project/work-items' };
const MILESTONES = { label: 'Milestones', href: '/project/milestones' };
const HOME_ORIGIN = { label: 'Home', href: '/project/overview' };

describe('Breadcrumbs', () => {
  it('renders nothing without parents, origin or pending state', () => {
    const { container } = renderCrumbs({ parents: [] });

    expect(container.querySelector('[data-testid="breadcrumbs"]')).toBeNull();
    expect(container.querySelector('nav')).toBeNull();
  });

  it('keeps the row (without a nav) while an object ancestor is pending', () => {
    renderCrumbs({ parents: [], pending: true });

    expect(screen.getByTestId('breadcrumbs')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('renders the trail as an ordered list in order with one aria-hidden separator', () => {
    renderCrumbs({ parents: [TASKS, MILESTONES] });

    const nav = screen.getByRole('navigation', { name: 'You are here' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['Tasks', 'Milestones']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual([TASKS.href, MILESTONES.href]);
    expect(nav.querySelector('ol')).not.toBeNull();
    const items = nav.querySelectorAll('li');
    expect(items).toHaveLength(2);

    const separators = Array.from(nav.querySelectorAll('span[aria-hidden="true"]')).filter(
      (el) => el.textContent === '›',
    );
    expect(separators).toHaveLength(1);
    expect(items[1]?.textContent).not.toContain('›');
  });

  it('renders the Back link outside the trail, with the glyph hidden from assistive tech', () => {
    renderCrumbs({
      parents: [TASKS],
      origin: { label: 'Schedule', href: '/schedule/gantt?x=1' },
    });

    const back = screen.getByRole('link', { name: /Back to Schedule/ });
    expect(back).toHaveAttribute('href', '/schedule/gantt?x=1');
    expect(back).toHaveTextContent('Back to Schedule');
    expect(screen.getByRole('navigation', { name: 'You are here' })).not.toContainElement(back);
    expect(back.querySelector('span[aria-hidden="true"]')).toHaveTextContent('‹');
    expect(screen.getByTestId('breadcrumbs')).toHaveAttribute('data-has-back', 'true');
  });

  it('renders the Back link alone (no nav) when there are no parents', () => {
    renderCrumbs({ parents: [], origin: HOME_ORIGIN });

    expect(screen.getByTestId('breadcrumbs-back')).toHaveTextContent('Back to Home');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('never marks any element aria-current', () => {
    const { container } = renderCrumbs({ parents: [TASKS, MILESTONES], origin: HOME_ORIGIN });

    expect(container.querySelector('[aria-current]')).toBeNull();
  });

  it('does not set data-has-back without an origin', () => {
    renderCrumbs({ parents: [TASKS] });

    expect(screen.getByTestId('breadcrumbs')).not.toHaveAttribute('data-has-back');
  });

  it('navigates in-app on a plain click', () => {
    renderCrumbs({ parents: [TASKS] });

    const notPrevented = fireEvent.click(screen.getByRole('link', { name: /Tasks/ }));

    expect(notPrevented).toBe(false); // the router handled the click (no full reload)
    expect(screen.getByTestId('where')).toHaveTextContent('/project/work-items');
  });

  it('leaves a ctrl/meta click to the browser', () => {
    renderCrumbs({ parents: [TASKS] });

    const link = screen.getByRole('link', { name: /Tasks/ });
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(true);
    expect(fireEvent.click(link, { metaKey: true })).toBe(true);
    expect(screen.getByTestId('where')).toHaveTextContent('/start');
  });

  it('uses the linkDynamic class for object names and link for views', () => {
    renderCrumbs({
      parents: [
        TASKS,
        { label: 'Synthetic sofa', href: '/project/household-items/h-1', dynamic: true },
      ],
    });

    expect(screen.getByRole('link', { name: /Tasks/ })).toHaveClass('link');
    expect(screen.getByRole('link', { name: /Tasks/ })).not.toHaveClass('linkDynamic');
    expect(screen.getByRole('link', { name: /Synthetic sofa/ })).toHaveClass('linkDynamic');
  });

  it('applies the camelCase structural classes', () => {
    const { container } = renderCrumbs({ parents: [TASKS], origin: HOME_ORIGIN });

    for (const cls of ['row', 'trail', 'list', 'item', 'back', 'backGlyph']) {
      expect(container.querySelector(`.${cls}`)).not.toBeNull();
    }
    // The phone glyph is gone: the compact top-bar link replaced it (#2207)
    expect(container.querySelector('.phoneGlyph')).toBeNull();
  });

  it('uses the default test id and derives the Back id from a custom one', () => {
    const { unmount } = renderCrumbs({ parents: [TASKS], origin: HOME_ORIGIN });
    expect(screen.getByTestId('breadcrumbs')).toBeInTheDocument();
    expect(screen.getByTestId('breadcrumbs-back')).toBeInTheDocument();
    unmount();

    renderCrumbs({ parents: [TASKS], origin: HOME_ORIGIN, testId: 'custom' });
    expect(screen.getByTestId('custom')).toBeInTheDocument();
    expect(screen.getByTestId('custom-back')).toBeInTheDocument();
    expect(screen.queryByTestId('breadcrumbs')).not.toBeInTheDocument();
  });

  it('wraps every link label in the label span without changing accessible names', () => {
    const { container } = renderCrumbs({
      parents: [TASKS, MILESTONES],
      origin: { label: 'Schedule', href: '/schedule/gantt' },
    });

    const labels = Array.from(container.querySelectorAll('a > span.label'));
    expect(labels.map((el) => el.textContent)).toEqual(['Back to Schedule', 'Tasks', 'Milestones']);
    expect(screen.getByRole('link', { name: 'Back to Schedule' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Tasks' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Milestones' })).toBeVisible();
  });

  describe('layout', () => {
    it('uses the page row by default, without the bar modifier', () => {
      renderCrumbs({ parents: [TASKS] });

      const row = screen.getByTestId('breadcrumbs');
      expect(row).toHaveClass('row');
      expect(row).not.toHaveClass('rowBar');
    });

    it('keeps the page row for an explicit layout="page"', () => {
      renderCrumbs({ parents: [TASKS], layout: 'page' });

      expect(screen.getByTestId('breadcrumbs')).not.toHaveClass('rowBar');
    });

    it('adds the one-line bar modifier for layout="bar" and keeps the base row class', () => {
      renderCrumbs({ parents: [TASKS], layout: 'bar' });

      const row = screen.getByTestId('breadcrumbs');
      expect(row).toHaveClass('row', 'rowBar');
    });

    it('keeps the same landmark, links and test ids in the bar layout', () => {
      renderCrumbs({ parents: [TASKS], origin: HOME_ORIGIN, layout: 'bar' });

      const nav = screen.getByRole('navigation', { name: 'You are here' });
      expect(within(nav).getByRole('link', { name: 'Tasks' })).toHaveAttribute(
        'href',
        '/project/work-items',
      );
      expect(screen.getByTestId('breadcrumbs-back')).toHaveAttribute('href', '/project/overview');
    });
  });
});

describe('Breadcrumbs compact layout (#2207)', () => {
  function renderCompact(props: BreadcrumbsProps) {
    const log = createRouterLog();
    const utils = render(
      <RecordingRouter entries={['/start']} log={log}>
        <Breadcrumbs {...props} layout="compact" />
      </RecordingRouter>,
    );
    return { log, ...utils };
  }

  it('renders one link inside the You are here navigation', () => {
    renderCompact({ parents: [TASKS, MILESTONES], origin: HOME_ORIGIN });

    const nav = screen.getByRole('navigation', { name: 'You are here' });
    expect(within(nav).getAllByRole('link')).toHaveLength(1);
    expect(screen.getByTestId('breadcrumbs')).toHaveClass('rowCompact');
  });

  it('the origin wins: breadcrumbs-back named "Back to <origin>"', () => {
    renderCompact({ parents: [TASKS], origin: HOME_ORIGIN });

    const link = screen.getByTestId('breadcrumbs-back');
    expect(link).toHaveAccessibleName('Back to Home');
    expect(link).toHaveAttribute('href', '/project/overview');
    expect(link).toHaveClass('compactLink');
    expect(screen.queryByTestId('breadcrumbs-parent')).toBeNull();
  });

  it('without an origin the nearest parent is the target: breadcrumbs-parent', () => {
    renderCompact({ parents: [TASKS, MILESTONES] });

    const link = screen.getByTestId('breadcrumbs-parent');
    expect(link).toHaveAccessibleName('Back to Milestones');
    expect(link).toHaveAttribute('href', '/project/milestones');
    expect(screen.queryByTestId('breadcrumbs-back')).toBeNull();
  });

  it('derives both link test ids from a custom test id', () => {
    renderCompact({ parents: [TASKS], testId: 'crumbs' });
    expect(screen.getByTestId('crumbs-parent')).toBeInTheDocument();
  });

  it('shows the visible label and a hidden back glyph, and has no phoneGlyph', () => {
    const { container } = renderCompact({ parents: [TASKS] });

    expect(screen.getByTestId('breadcrumbs-parent').querySelector('.label')).toHaveTextContent(
      'Tasks',
    );
    expect(container.querySelector('.backGlyph')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.phoneGlyph')).toBeNull();
  });

  it('renders nothing when there is nothing to show', () => {
    const { container } = renderCompact({ parents: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it('while pending it keeps an empty row with data-pending', () => {
    renderCompact({ parents: [TASKS], pending: true });

    const row = screen.getByTestId('breadcrumbs');
    expect(row).toHaveAttribute('data-pending', 'true');
    expect(row).toBeEmptyDOMElement();
  });

  it('while pending an origin is still offered as the target', () => {
    renderCompact({ parents: [TASKS], origin: HOME_ORIGIN, pending: true });
    expect(screen.getByTestId('breadcrumbs-back')).toBeInTheDocument();
    expect(screen.getByTestId('breadcrumbs')).not.toHaveAttribute('data-pending');
  });

  describe('history-back rule', () => {
    it('goes back in history on a plain click when shouldGoBack accepts the target', () => {
      const { log } = renderCompact({
        parents: [TASKS],
        shouldGoBack: (href) => href === '/project/work-items',
      });
      fireEvent.click(screen.getByTestId('breadcrumbs-parent'));
      expect(log.actions).toEqual(['GO -1']);
    });

    it('asks shouldGoBack about the target href', () => {
      const asked: string[] = [];
      renderCompact({
        parents: [TASKS],
        origin: HOME_ORIGIN,
        shouldGoBack: (href) => {
          asked.push(href);
          return false;
        },
      });
      fireEvent.click(screen.getByTestId('breadcrumbs-back'));
      expect(asked).toEqual(['/project/overview']);
    });

    it('follows the link (pushes the target) when shouldGoBack declines', () => {
      const { log } = renderCompact({ parents: [TASKS], shouldGoBack: () => false });
      fireEvent.click(screen.getByTestId('breadcrumbs-parent'));
      expect(log.actions).toEqual(['PUSH /project/work-items']);
    });

    it('follows the link when no shouldGoBack is given', () => {
      const { log } = renderCompact({ parents: [TASKS] });
      fireEvent.click(screen.getByTestId('breadcrumbs-parent'));
      expect(log.actions).toEqual(['PUSH /project/work-items']);
    });

    it.each([
      ['ctrl', { ctrlKey: true }],
      ['meta', { metaKey: true }],
      ['shift', { shiftKey: true }],
      ['alt', { altKey: true }],
      ['middle button', { button: 1 }],
    ])('does not go back on a %s click, even when shouldGoBack accepts', (_label, init) => {
      const { log } = renderCompact({ parents: [TASKS], shouldGoBack: () => true });
      fireEvent.click(screen.getByTestId('breadcrumbs-parent'), init);
      expect(log.actions).not.toContain('GO -1');
    });
  });
});
