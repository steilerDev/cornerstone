/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { LIVE_REDIRECT_ROUTES } from '@cornerstone/shared';
import { RouteRedirect } from './RouteRedirect.js';

function Where() {
  const { pathname, search, hash } = useLocation();
  return <div data-testid="where">{`${pathname}${search}${hash}`}</div>;
}

function renderAt(url: string, rule: { from: string; path: string; target: string }) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path={rule.path} element={<RouteRedirect rule={rule} />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

const WORK_ITEM_RULE = {
  from: '/work-items/:id',
  path: '/work-items/:id',
  target: '/project/work-items/:id',
};

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
      path: '/budget/categories',
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
      const url = rule.path.replace(/:[A-Za-z0-9_]+/g, 'x') + '?keep=1#frag';
      const { unmount } = renderAt(url, rule);
      const text = screen.getByTestId('where').textContent ?? '';
      expect(text).toContain('keep=1');
      expect(text.endsWith('#frag')).toBe(true);
      unmount();
    }
  });
});
