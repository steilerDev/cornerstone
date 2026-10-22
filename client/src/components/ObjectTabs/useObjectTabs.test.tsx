/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createRouterLog, RecordingRouter } from '../../test/recordingRouter';
import type { RouterLog } from '../../test/recordingRouter';
import type { ObjectTabId } from './objectTabIds.js';
import { useObjectTabs } from './useObjectTabs.js';

function setup(url: string, available: readonly ObjectTabId[]) {
  const log: RouterLog = createRouterLog();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <RecordingRouter entries={[url]} log={log}>
      {children}
    </RecordingRouter>
  );
  const hook = renderHook(() => useObjectTabs(available), { wrapper });
  return { log, ...hook };
}

describe('useObjectTabs', () => {
  it('orders the applicable tabs canonically whatever order they are given in', () => {
    const { result } = setup('/p', ['history', 'cost', 'overview']);
    expect(result.current.tabs).toEqual(['overview', 'cost', 'history']);
  });

  it('shows the first tab for an absent param and leaves the URL untouched', () => {
    const { result, log } = setup('/p', ['overview', 'cost']);
    expect(result.current.active).toBe('overview');
    expect(log.actions).toEqual([]);
  });

  it('honours a valid ?tab= without rewriting', () => {
    const { result, log } = setup('/p?tab=cost', ['overview', 'cost']);
    expect(result.current.active).toBe('cost');
    expect(log.actions).toEqual([]);
  });

  it('removes an unknown param with a replace navigation and keeps the others', async () => {
    const { result, log } = setup('/p?tab=nonsense&payment=1', ['overview', 'cost']);
    await waitFor(() => expect(log.actions).toEqual(['REPLACE /p?payment=1']));
    expect(result.current.active).toBe('overview');
  });

  it('removes a param naming a tab that does not apply to this object', async () => {
    const { log } = setup('/p?tab=payments', ['overview', 'cost']);
    await waitFor(() => expect(log.actions).toEqual(['REPLACE /p']));
  });

  it('selects a non-first tab with a replace and keeps the other params', () => {
    const { result, log } = setup('/p?depError=1', ['overview', 'cost']);
    act(() => result.current.select('cost'));
    expect(log.actions).toEqual(['REPLACE /p?depError=1&tab=cost']);
    expect(result.current.active).toBe('cost');
  });

  it('removes the param when the first tab is selected', () => {
    const { result, log } = setup('/p?tab=cost&x=1', ['overview', 'cost']);
    act(() => result.current.select('overview'));
    expect(log.actions).toEqual(['REPLACE /p?x=1']);
    expect(result.current.active).toBe('overview');
  });

  it('records a pending panel focus only when asked for', () => {
    const { result } = setup('/p', ['overview', 'cost']);
    act(() => result.current.select('cost', { focusPanel: true }));
    expect(result.current.pendingPanelFocus.current).toBe('cost');
    act(() => result.current.select('overview'));
    expect(result.current.pendingPanelFocus.current).toBeNull();
  });

  it('builds hrefs: bare path for the first tab, ?tab= for the others, other params merged', () => {
    const { result } = setup('/p?x=1', ['overview', 'cost']);
    expect(result.current.hrefFor('overview')).toBe('/p?x=1');
    expect(result.current.hrefFor('cost')).toBe('/p?x=1&tab=cost');
  });

  it('builds a bare href when no params remain', () => {
    const { result } = setup('/p?tab=cost', ['overview', 'cost']);
    expect(result.current.hrefFor('overview')).toBe('/p');
  });

  it('falls back to overview for an empty list', () => {
    const { result } = setup('/p', []);
    expect(result.current.tabs).toEqual([]);
    expect(result.current.active).toBe('overview');
  });
});
