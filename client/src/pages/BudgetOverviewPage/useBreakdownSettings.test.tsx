/**
 * @jest-environment jsdom
 */
import type { ReactNode } from 'react';
import { describe, it, expect } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import type { RouterLog } from '../../test/recordingRouter.js';
import { useBreakdownSettings } from './useBreakdownSettings.js';

function setup(url: string) {
  const log = createRouterLog();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <RecordingRouter entries={[url]} log={log}>
      {children}
    </RecordingRouter>
  );
  const view = renderHook(() => useBreakdownSettings(), { wrapper });
  return { log, ...view };
}

/** The URL after the last navigation. */
const currentUrl = (log: RouterLog) => log.entries[log.index];

describe('useBreakdownSettings', () => {
  describe('reading', () => {
    it('uses the defaults when no param is present and leaves the URL alone', () => {
      const { result, log } = setup('/budget/overview');
      expect(result.current.settings).toEqual({
        view: 'area',
        payment: 'all',
        estimate: 'expected',
        grants: false,
        deselected: new Set(),
      });
      expect(log.actions).toEqual([]);
    });

    it('reads every non-default param', () => {
      const { result } = setup(
        '/budget/overview?by=source&paymentStatus=paid&estimate=high&grants=1&deselectedSources=bs-a,unassigned',
      );
      expect(result.current.settings).toEqual({
        view: 'source',
        payment: 'paid',
        estimate: 'high',
        grants: true,
        deselected: new Set(['bs-a', 'unassigned']),
      });
    });

    it('maps the old ?paymentStatus=outstanding link to Not yet paid (AC4)', () => {
      const { result, log } = setup('/budget/overview?paymentStatus=outstanding');
      expect(result.current.settings.payment).toBe('outstanding');
      expect(log.actions).toEqual([]);
    });

    it('ignores empty entries in the deselected list', () => {
      const { result } = setup('/budget/overview?deselectedSources=,bs-a,,');
      expect([...result.current.settings.deselected]).toEqual(['bs-a']);
    });

    it('treats an empty deselectedSources value as no deselection', () => {
      const { result } = setup('/budget/overview?deselectedSources=');
      expect(result.current.settings.deselected.size).toBe(0);
    });
  });

  describe('dropping unknown and default values', () => {
    it('removes unknown values with a replace, keeping the defaults', () => {
      const { result, log } = setup(
        '/budget/overview?by=bogus&paymentStatus=nope&estimate=huge&grants=maybe&keep=1',
      );
      expect(result.current.settings.view).toBe('area');
      expect(result.current.settings.payment).toBe('all');
      expect(result.current.settings.estimate).toBe('expected');
      expect(result.current.settings.grants).toBe(false);
      expect(log.actions).toHaveLength(1);
      expect(log.actions[0]).toMatch(/^REPLACE /);
      expect(currentUrl(log)).toBe('/budget/overview?keep=1');
    });

    it('removes explicit defaults (by=area, paymentStatus=all, estimate=expected)', () => {
      const { log } = setup('/budget/overview?by=area&paymentStatus=all&estimate=expected');
      expect(log.actions).toHaveLength(1);
      expect(currentUrl(log)).toBe('/budget/overview');
    });

    it('removes grants=0 but keeps grants=1', () => {
      const off = setup('/budget/overview?grants=0');
      expect(currentUrl(off.log)).toBe('/budget/overview');
      const on = setup('/budget/overview?grants=1');
      expect(on.log.actions).toEqual([]);
      expect(currentUrl(on.log)).toBe('/budget/overview?grants=1');
    });

    it('drops only the broken param and keeps the valid ones and the funding sources', () => {
      const { log } = setup('/budget/overview?by=type&estimate=huge&deselectedSources=bs-a');
      expect(currentUrl(log)).toBe('/budget/overview?by=type&deselectedSources=bs-a');
    });
  });

  describe('writing', () => {
    it('setView writes ?by with a replace and keeps the other params', () => {
      const { result, log } = setup('/budget/overview?estimate=low');
      act(() => result.current.setView('category'));
      expect(log.actions).toEqual(['REPLACE /budget/overview?estimate=low&by=category']);
      expect(result.current.settings.view).toBe('category');
    });

    it('setView(area) removes ?by (absent means the default)', () => {
      const { result, log } = setup('/budget/overview?by=type');
      act(() => result.current.setView('area'));
      expect(currentUrl(log)).toBe('/budget/overview');
      expect(log.actions).toEqual(['REPLACE /budget/overview']);
    });

    it('setPayment writes ?paymentStatus and setPayment(all) removes it', () => {
      const { result, log } = setup('/budget/overview');
      act(() => result.current.setPayment('outstanding'));
      expect(currentUrl(log)).toBe('/budget/overview?paymentStatus=outstanding');
      act(() => result.current.setPayment('all'));
      expect(currentUrl(log)).toBe('/budget/overview');
      expect(log.actions.every((a) => a.startsWith('REPLACE '))).toBe(true);
    });

    it('setEstimate writes ?estimate and setEstimate(expected) removes it', () => {
      const { result, log } = setup('/budget/overview');
      act(() => result.current.setEstimate('low'));
      expect(currentUrl(log)).toBe('/budget/overview?estimate=low');
      act(() => result.current.setEstimate('expected'));
      expect(currentUrl(log)).toBe('/budget/overview');
    });

    it('setGrants writes ?grants=1 and setGrants(false) removes it', () => {
      const { result, log } = setup('/budget/overview');
      act(() => result.current.setGrants(true));
      expect(currentUrl(log)).toBe('/budget/overview?grants=1');
      expect(result.current.settings.grants).toBe(true);
      act(() => result.current.setGrants(false));
      expect(currentUrl(log)).toBe('/budget/overview');
    });

    it('toggleSource adds a source to the deselected list and removes it again', () => {
      const { result, log } = setup('/budget/overview');
      act(() => result.current.toggleSource('bs-a'));
      expect(currentUrl(log)).toBe('/budget/overview?deselectedSources=bs-a');
      act(() => result.current.toggleSource('unassigned'));
      expect(currentUrl(log)).toBe('/budget/overview?deselectedSources=bs-a%2Cunassigned');
      expect(result.current.settings.deselected).toEqual(new Set(['bs-a', 'unassigned']));
      act(() => result.current.toggleSource('bs-a'));
      expect(currentUrl(log)).toBe('/budget/overview?deselectedSources=unassigned');
      act(() => result.current.toggleSource('unassigned'));
      expect(currentUrl(log)).toBe('/budget/overview');
      expect(log.actions.every((a) => a.startsWith('REPLACE '))).toBe(true);
    });

    it('selectAllSources removes the deselected list and keeps the other params', () => {
      const { result, log } = setup('/budget/overview?by=type&deselectedSources=bs-a');
      act(() => result.current.selectAllSources());
      expect(currentUrl(log)).toBe('/budget/overview?by=type');
    });

    it('reset clears payment, estimate and sources but keeps the view and Grants', () => {
      const { result, log } = setup(
        '/budget/overview?by=source&grants=1&paymentStatus=paid&estimate=high&deselectedSources=bs-a',
      );
      act(() => result.current.reset());
      expect(currentUrl(log)).toBe('/budget/overview?by=source&grants=1');
      expect(result.current.settings).toEqual({
        view: 'source',
        payment: 'all',
        estimate: 'expected',
        grants: true,
        deselected: new Set(),
      });
    });
  });
});
