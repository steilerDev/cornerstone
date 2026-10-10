/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { LIVE_REDIRECT_ROUTES } from '@cornerstone/shared';
import type { LiveRedirectRoute } from '@cornerstone/shared';
import { RouteRedirect } from './RouteRedirect.js';

function Where() {
  const { pathname, search, hash } = useLocation();
  return <div data-testid="where">{`${pathname}${search}${hash}`}</div>;
}

function renderAt(
  url: string,
  input: { from: string; target: string; queryMaps?: LiveRedirectRoute['queryMaps'] },
) {
  const rule: LiveRedirectRoute = { queryMaps: [], ...input };
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path={rule.from} element={<RouteRedirect rule={rule} />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

const WORK_ITEM_RULE: LiveRedirectRoute = {
  from: '/work-items/:id',
  target: '/project/work-items/:id',
  queryMaps: [],
};

const SCHEDULE_RULE = LIVE_REDIRECT_ROUTES.find((r) => r.from === '/schedule');

describe('RouteRedirect', () => {
  it('redirects to the target, filling params and carrying query and hash', () => {
    renderAt('/work-items/abc?q=1#h', WORK_ITEM_RULE);

    expect(screen.getByTestId('where')).toHaveTextContent('/project/work-items/abc?q=1#h');
  });

  it('URI-encodes param values', () => {
    renderAt('/work-items/a%20b', WORK_ITEM_RULE);

    expect(screen.getByTestId('where')).toHaveTextContent('/project/work-items/a%20b');
  });

  it('lets target-defined query keys win over incoming ones', () => {
    renderAt('/budget/categories?tab=old&q=x', {
      from: '/budget/categories',
      target: '/settings/manage?tab=budget-categories',
    });

    expect(screen.getByTestId('where')).toHaveTextContent(
      '/settings/manage?tab=budget-categories&q=x',
    );
  });

  it('replaces the history entry instead of pushing a new one', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/start', '/work-items/abc']} initialIndex={1}>
        <Routes>
          <Route path="/work-items/:id" element={<RouteRedirect rule={WORK_ITEM_RULE} />} />
          <Route path="/project/work-items/:id" element={<Where />} />
          <Route path="/start" element={<div>start</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('where')).toHaveTextContent('/project/work-items/abc');
    expect(container).not.toHaveTextContent('start');
  });

  it('serves every generated live redirect in one hop', () => {
    for (const rule of LIVE_REDIRECT_ROUTES) {
      const url = rule.from.replace(/:[A-Za-z0-9_]+/g, 'x') + '?keep=1#frag';
      const { unmount } = renderAt(url, rule);
      const text = screen.getByTestId('where').textContent ?? '';
      expect(text).toContain('keep=1');
      expect(text.endsWith('#frag')).toBe(true);
      unmount();
    }
  });

  it('lands /schedule?view=calendar on the Calendar in one hop, consuming the view key', () => {
    if (!SCHEDULE_RULE) throw new Error('missing /schedule rule');
    renderAt('/schedule?view=calendar&x=1', SCHEDULE_RULE);

    expect(screen.getByTestId('where')).toHaveTextContent(/^\/schedule\/calendar\?x=1$/);
  });

  it('keeps today behaviour for /schedule?view=gantt', () => {
    if (!SCHEDULE_RULE) throw new Error('missing /schedule rule');
    renderAt('/schedule?view=gantt', SCHEDULE_RULE);

    expect(screen.getByTestId('where')).toHaveTextContent('/schedule/gantt?view=gantt');
  });

  it('replaces the history entry for a query-map redirect', () => {
    if (!SCHEDULE_RULE) throw new Error('missing /schedule rule');
    const { container } = render(
      <MemoryRouter initialEntries={['/start', '/schedule?view=calendar']} initialIndex={1}>
        <Routes>
          <Route path="/schedule" element={<RouteRedirect rule={SCHEDULE_RULE} />} />
          <Route path="/schedule/calendar" element={<Where />} />
          <Route path="/start" element={<div>start</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('where')).toHaveTextContent('/schedule/calendar');
    expect(container).not.toHaveTextContent('start');
  });
});
