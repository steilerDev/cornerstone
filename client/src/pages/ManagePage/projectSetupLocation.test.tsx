/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { act, render } from '@testing-library/react';
import type * as LocationTypes from './projectSetupLocation.js';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import type { RouterLog } from '../../test/recordingRouter.js';
import { RealLocationKeyContext } from '../../navigation/realLocation.js';

let useProjectSetupLocation: typeof LocationTypes.useProjectSetupLocation;
let resolveLegacyTab: typeof LocationTypes.resolveLegacyTab;
let LEGACY_TAB_ANCHORS: typeof LocationTypes.LEGACY_TAB_ANCHORS;
let PROJECT_SETUP_ANCHORS: typeof LocationTypes.PROJECT_SETUP_ANCHORS;

beforeAll(async () => {
  ({ useProjectSetupLocation, resolveLegacyTab, LEGACY_TAB_ANCHORS, PROJECT_SETUP_ANCHORS } =
    await import('./projectSetupLocation.js'));
});

describe('resolveLegacyTab', () => {
  it.each([
    ['household', 'house'],
    ['orientations', 'orientations'],
    ['budget-categories', 'cost-categories'],
    ['hi-categories', 'purchase-categories'],
    ['trades', 'trades'],
  ])('maps ?tab=%s to #%s on this page', (tab, anchor) => {
    expect(resolveLegacyTab(tab)).toEqual({ kind: 'anchor', anchor });
  });

  it('sends ?tab=areas to the Areas page', () => {
    expect(resolveLegacyTab('areas')).toEqual({ kind: 'areasPage' });
  });

  it('no longer keeps an Areas section anchor on this page', () => {
    expect(Object.keys(LEGACY_TAB_ANCHORS)).not.toContain('areas');
  });

  it('does nothing without a tab', () => {
    expect(resolveLegacyTab(null)).toEqual({ kind: 'none' });
  });

  it.each(['foo', '', 'constructor', '__proto__', 'toString'])(
    'drops the unknown tab %p',
    (tab) => {
      expect(resolveLegacyTab(tab)).toEqual({ kind: 'drop' });
    },
  );

  it('maps every legacy tab to a known section anchor', () => {
    for (const anchor of Object.values(LEGACY_TAB_ANCHORS)) {
      expect(PROJECT_SETUP_ANCHORS as readonly string[]).toContain(anchor);
    }
  });
});

describe('useProjectSetupLocation', () => {
  let scrollIntoView: jest.Mock<(arg?: ScrollIntoViewOptions) => void>;

  beforeEach(() => {
    jest.useFakeTimers();
    scrollIntoView = jest.fn<(arg?: ScrollIntoViewOptions) => void>();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function Page({ settled }: { settled: boolean }) {
    useProjectSetupLocation({ settled });
    return (
      <div>
        {PROJECT_SETUP_ANCHORS.map((anchor) => (
          <section key={anchor} id={anchor}>
            <h2 id={`${anchor}-heading`} tabIndex={-1}>
              {anchor}
            </h2>
          </section>
        ))}
        <button type="button">elsewhere</button>
      </div>
    );
  }

  function renderAt(url: string, options: { settled?: boolean; realKey?: string } = {}) {
    const log: RouterLog = createRouterLog();
    const tree = (settled: boolean) => (
      <RecordingRouter entries={['/start', url]} log={log}>
        <RealLocationKeyContext value={options.realKey ?? null}>
          <Page settled={settled} />
        </RealLocationKeyContext>
      </RecordingRouter>
    );
    const view = render(tree(options.settled ?? false));
    return { log, view, rerenderSettled: (settled: boolean) => view.rerender(tree(settled)) };
  }

  const flushFrame = () => act(() => void jest.advanceTimersByTime(20));

  describe('legacy ?tab= replacement', () => {
    it.each([
      ['household', '#house'],
      ['orientations', '#orientations'],
      ['budget-categories', '#cost-categories'],
      ['hi-categories', '#purchase-categories'],
      ['trades', '#trades'],
    ])('replaces ?tab=%s with %s and removes tab', (tab, hash) => {
      const { log } = renderAt(`/settings/manage?tab=${tab}`);

      expect(log.actions).toEqual([`REPLACE /settings/manage${hash}`]);
      expect(log.entries).toEqual(['/start', `/settings/manage${hash}`]);
    });

    it('replaces, never pushes: the entry count does not grow', () => {
      const { log } = renderAt('/settings/manage?tab=trades');

      expect(log.actions.every((action) => action.startsWith('REPLACE'))).toBe(true);
      expect(log.entries).toHaveLength(2);
    });

    it('keeps the other query parameters', () => {
      const { log } = renderAt('/settings/manage?q=1&tab=household&x=2');

      expect(log.actions).toEqual(['REPLACE /settings/manage?q=1&x=2#house']);
    });

    it('drops an unknown tab and keeps the hash and other parameters', () => {
      const { log } = renderAt('/settings/manage?tab=foo&x=2#house');

      expect(log.actions).toEqual(['REPLACE /settings/manage?x=2#house']);
    });

    it('drops an unknown tab with nothing else left', () => {
      const { log } = renderAt('/settings/manage?tab=foo');

      expect(log.actions).toEqual(['REPLACE /settings/manage']);
    });

    it('sends ?tab=areas to the Areas page while keeping nothing else', () => {
      const { log } = renderAt('/settings/manage?tab=areas');

      expect(log.actions).toEqual(['REPLACE /areas']);
    });

    it('writes nothing for a plain load, a hash or other parameters', () => {
      const { log } = renderAt('/settings/manage?x=1#cost-categories');

      expect(log.actions).toEqual([]);
    });

    it('writes nothing while the real location differs from the displayed one (dialog open)', () => {
      const { log } = renderAt('/settings/manage?tab=household', { realKey: 'dialog-route' });

      expect(log.actions).toEqual([]);
      expect(log.entries).toEqual(['/start', '/settings/manage?tab=household']);
    });
  });

  describe('hash focus', () => {
    it('focuses the section heading in the next frame and scrolls it into view', () => {
      renderAt('/settings/manage#cost-categories');

      expect(document.activeElement).toBe(document.body);
      flushFrame();

      expect(document.activeElement).toBe(document.getElementById('cost-categories-heading'));
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
    });

    it('scrolls without animation under reduced motion', () => {
      const original = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        matches: query.includes('reduce'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })) as unknown as typeof window.matchMedia;
      renderAt('/settings/manage#house');

      flushFrame();

      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
      window.matchMedia = original;
    });

    it('falls back to the section when there is no heading element', () => {
      const log = createRouterLog();
      function Bare() {
        useProjectSetupLocation({ settled: true });
        return <section id="house" tabIndex={-1} />;
      }
      render(
        <RecordingRouter entries={['/settings/manage#house']} log={log}>
          <Bare />
        </RecordingRouter>,
      );

      flushFrame();

      expect(document.activeElement).toBe(document.getElementById('house'));
    });

    it('does nothing when neither heading nor section exists', () => {
      const log = createRouterLog();
      function Empty() {
        useProjectSetupLocation({ settled: true });
        return <p>empty</p>;
      }
      render(
        <RecordingRouter entries={['/settings/manage#house']} log={log}>
          <Empty />
        </RecordingRouter>,
      );

      expect(() => flushFrame()).not.toThrow();
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('ignores a hash that is not a section anchor', () => {
      renderAt('/settings/manage#something-else');

      flushFrame();

      expect(document.activeElement).toBe(document.body);
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('does nothing without a hash', () => {
      renderAt('/settings/manage');

      flushFrame();

      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('re-scrolls once when settled flips while focus is still on the heading', () => {
      const { rerenderSettled } = renderAt('/settings/manage#purchase-categories', {
        settled: false,
      });
      flushFrame();
      expect(scrollIntoView).toHaveBeenCalledTimes(1);

      rerenderSettled(true);
      flushFrame();

      expect(scrollIntoView).toHaveBeenCalledTimes(2);
      expect(document.activeElement).toBe(document.getElementById('purchase-categories-heading'));

      rerenderSettled(true);
      flushFrame();
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
    });

    it('does not re-scroll or steal focus when the user has moved on', () => {
      const { rerenderSettled } = renderAt('/settings/manage#orientations', { settled: false });
      flushFrame();
      const other = document.querySelector('button') as HTMLButtonElement;
      other.focus();

      rerenderSettled(true);
      flushFrame();

      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(other);
    });

    it('cancels the pending frame on unmount', () => {
      const { view } = renderAt('/settings/manage#house');

      view.unmount();
      flushFrame();

      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('after a legacy tab is replaced, focuses the target heading', () => {
      renderAt('/settings/manage?tab=hi-categories');

      flushFrame();

      expect(document.activeElement).toBe(document.getElementById('purchase-categories-heading'));
    });
  });
});
