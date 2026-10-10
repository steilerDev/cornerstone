/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { liveConditionalRules } from '@cornerstone/shared';
import type { RouteMapEntry } from '@cornerstone/shared';
import type * as RouteGateTypes from './RouteGate.js';

const mockGetPaperlessStatus = jest.fn<() => Promise<{ configured: boolean }>>();
const mockFetchConfig = jest.fn<() => Promise<{ llmEnabled: boolean }>>();

jest.unstable_mockModule('../lib/paperlessApi.js', () => ({
  getPaperlessStatus: mockGetPaperlessStatus,
}));
jest.unstable_mockModule('../lib/configApi.js', () => ({
  fetchConfig: mockFetchConfig,
}));

function rule(condition: NonNullable<RouteMapEntry['match']>['condition'], to: string) {
  return {
    from: `/gated (${condition})`,
    to,
    kind: 'redirect',
    change: 'conditional',
    section: 'System',
    guard: 'member',
    gate: 'none',
    permanent: false,
    carries: ['*'],
    stage: 'done',
    match: { condition, appliesTo: [] },
  } as RouteMapEntry;
}

function Where() {
  const { pathname, search, hash } = useLocation();
  return <div data-testid="where">{`${pathname}${search}${hash}`}</div>;
}

describe('RouteGate', () => {
  let RouteGate: typeof RouteGateTypes.RouteGate;
  const PAPERLESS_RULES = liveConditionalRules('invoicePaperlessReview');

  beforeEach(async () => {
    if (!RouteGate) RouteGate = (await import('./RouteGate.js')).RouteGate;
    mockGetPaperlessStatus.mockReset();
    mockFetchConfig.mockReset();
  });

  function renderGate(rules: readonly RouteMapEntry[], url = '/budget/invoices/new/paperless') {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route element={<RouteGate rules={rules} />}>
            <Route path="/budget/invoices/new/paperless" element={<div>review page</div>} />
            <Route path="/gated/:id" element={<div>gated page</div>} />
          </Route>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('uses the live Paperless-off rule from the route map', () => {
    expect(PAPERLESS_RULES).toHaveLength(1);
  });

  it('renders nothing while the status is pending', () => {
    mockGetPaperlessStatus.mockReturnValue(new Promise(() => undefined));

    const { container } = renderGate(PAPERLESS_RULES);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the page when Paperless is configured', async () => {
    mockGetPaperlessStatus.mockResolvedValue({ configured: true });

    renderGate(PAPERLESS_RULES);

    expect(await screen.findByText('review page')).toBeInTheDocument();
  });

  it('redirects to the invoice list, keeping the query, when Paperless is not configured', async () => {
    mockGetPaperlessStatus.mockResolvedValue({ configured: false });

    renderGate(PAPERLESS_RULES, '/budget/invoices/new/paperless?documentId=7');

    expect(await screen.findByTestId('where')).toHaveTextContent(
      '/budget/invoices?documentId=7&create=1',
    );
    expect(screen.queryByText('review page')).toBeNull();
  });

  it('keeps the hash and fills route params in the redirect target', async () => {
    mockGetPaperlessStatus.mockResolvedValue({ configured: false });

    renderGate([rule('paperless-off', '/elsewhere/:id')], '/gated/42?x=1#h');

    expect(await screen.findByTestId('where')).toHaveTextContent('/elsewhere/42?x=1#h');
  });

  it('fails open and renders the page when the status lookup rejects', async () => {
    mockGetPaperlessStatus.mockRejectedValue(new Error('network'));

    renderGate(PAPERLESS_RULES);

    expect(await screen.findByText('review page')).toBeInTheDocument();
  });

  it('fails open when the config lookup rejects', async () => {
    mockFetchConfig.mockRejectedValue(new Error('network'));

    renderGate([rule('ai-off', '/ai-off')], '/gated/1');

    expect(await screen.findByText('gated page')).toBeInTheDocument();
  });

  it('does not update state after unmount', async () => {
    let resolve: (value: { configured: boolean }) => void = () => undefined;
    mockGetPaperlessStatus.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const { unmount } = renderGate(PAPERLESS_RULES);
    unmount();
    await act(async () => {
      resolve({ configured: false });
      await Promise.resolve();
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('does not update state after unmount when the lookup rejects', async () => {
    let reject: (reason: Error) => void = () => undefined;
    mockGetPaperlessStatus.mockReturnValue(
      new Promise((_resolve, r) => {
        reject = r;
      }),
    );
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const { unmount } = renderGate(PAPERLESS_RULES);
    unmount();
    await act(async () => {
      reject(new Error('late'));
      await Promise.resolve();
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  describe('only fetches what the rules need', () => {
    it('an ai-off rule calls fetchConfig and not getPaperlessStatus', async () => {
      mockFetchConfig.mockResolvedValue({ llmEnabled: true });

      renderGate([rule('ai-off', '/ai-off')], '/gated/1');

      expect(await screen.findByText('gated page')).toBeInTheDocument();
      expect(mockFetchConfig).toHaveBeenCalledTimes(1);
      expect(mockGetPaperlessStatus).not.toHaveBeenCalled();
    });

    it('a paperless-off rule calls getPaperlessStatus and not fetchConfig', async () => {
      mockGetPaperlessStatus.mockResolvedValue({ configured: true });

      renderGate([rule('paperless-off', '/p-off')], '/gated/1');

      expect(await screen.findByText('gated page')).toBeInTheDocument();
      expect(mockGetPaperlessStatus).toHaveBeenCalledTimes(1);
      expect(mockFetchConfig).not.toHaveBeenCalled();
    });

    it('a paperless-or-ai-off rule calls both', async () => {
      mockGetPaperlessStatus.mockResolvedValue({ configured: true });
      mockFetchConfig.mockResolvedValue({ llmEnabled: true });

      renderGate([rule('paperless-or-ai-off', '/either')], '/gated/1');

      expect(await screen.findByText('gated page')).toBeInTheDocument();
      expect(mockGetPaperlessStatus).toHaveBeenCalledTimes(1);
      expect(mockFetchConfig).toHaveBeenCalledTimes(1);
    });

    it('no rules fetch nothing and render the page', async () => {
      renderGate([], '/gated/1');

      expect(await screen.findByText('gated page')).toBeInTheDocument();
      expect(mockGetPaperlessStatus).not.toHaveBeenCalled();
      expect(mockFetchConfig).not.toHaveBeenCalled();
    });
  });

  describe('rule evaluation', () => {
    it('ignores a rule without a match condition', async () => {
      const bare = { ...rule('ai-off', '/never'), match: undefined } as RouteMapEntry;

      renderGate([bare], '/gated/1');

      expect(await screen.findByText('gated page')).toBeInTheDocument();
      expect(mockGetPaperlessStatus).not.toHaveBeenCalled();
      expect(mockFetchConfig).not.toHaveBeenCalled();
    });

    it('redirects when AI is off', async () => {
      mockFetchConfig.mockResolvedValue({ llmEnabled: false });

      renderGate([rule('ai-off', '/ai-off')], '/gated/1');

      expect(await screen.findByTestId('where')).toHaveTextContent('/ai-off');
    });

    it('redirects on a paperless-or-ai-off rule when only AI is off', async () => {
      mockGetPaperlessStatus.mockResolvedValue({ configured: true });
      mockFetchConfig.mockResolvedValue({ llmEnabled: false });

      renderGate([rule('paperless-or-ai-off', '/either')], '/gated/1');

      expect(await screen.findByTestId('where')).toHaveTextContent('/either');
    });

    it('applies the first matching rule when several hold', async () => {
      mockGetPaperlessStatus.mockResolvedValue({ configured: false });
      mockFetchConfig.mockResolvedValue({ llmEnabled: false });

      renderGate([rule('ai-off', '/first'), rule('paperless-off', '/second')], '/gated/1');

      expect(await screen.findByTestId('where')).toHaveTextContent('/first');
    });

    it('skips a rule that does not hold and applies the next one', async () => {
      mockGetPaperlessStatus.mockResolvedValue({ configured: false });
      mockFetchConfig.mockResolvedValue({ llmEnabled: true });

      renderGate([rule('ai-off', '/first'), rule('paperless-off', '/second')], '/gated/1');

      expect(await screen.findByTestId('where')).toHaveTextContent('/second');
    });
  });
});
