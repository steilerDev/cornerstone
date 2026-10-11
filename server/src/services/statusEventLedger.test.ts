/**
 * Unit tests for statusEventLedger.ts (#2209, ADR-040 W3/W4): the in-memory ledger of the
 * latest status event per subject and the collector stack used by runUndoable.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  __resetLedgerForTests,
  activeCollection,
  beginCollection,
  dropLedgerEntry,
  endCollection,
  forgetEvent,
  getLedgerEntry,
  recordLedgerEntry,
  restoreLedgerEntry,
  subjectKey,
  type LedgerEntry,
} from './statusEventLedger.js';

function entry(eventId: string, over: Partial<LedgerEntry> = {}): LedgerEntry {
  return { eventId, from: 'a', to: 'b', userId: 'u1', at: 1000, ...over };
}

describe('statusEventLedger', () => {
  beforeEach(() => {
    __resetLedgerForTests();
  });

  describe('subjectKey', () => {
    it('joins entry type, source type and source id', () => {
      expect(subjectKey('work_item_status', 'work_item', 'wi-1')).toBe(
        'work_item_status|work_item|wi-1',
      );
    });

    it('renders null source parts as empty strings', () => {
      expect(subjectKey('invoice_status', null, null)).toBe('invoice_status||');
    });

    it('keeps deposits and invoices with the same id apart', () => {
      expect(subjectKey('invoice_status', 'invoice', 'x')).not.toBe(
        subjectKey('invoice_status', 'invoice_deposit', 'x'),
      );
    });
  });

  describe('ledger entries', () => {
    it('returns undefined for an unknown key', () => {
      expect(getLedgerEntry('nope')).toBeUndefined();
    });

    it('records, replaces and drops an entry', () => {
      recordLedgerEntry('k', entry('e1'));
      expect(getLedgerEntry('k')?.eventId).toBe('e1');
      recordLedgerEntry('k', entry('e2'));
      expect(getLedgerEntry('k')?.eventId).toBe('e2');
      dropLedgerEntry('k');
      expect(getLedgerEntry('k')).toBeUndefined();
    });

    it('forgetEvent removes only the entry holding that event id', () => {
      recordLedgerEntry('k1', entry('e1'));
      recordLedgerEntry('k2', entry('e2'));
      forgetEvent('e1');
      expect(getLedgerEntry('k1')).toBeUndefined();
      expect(getLedgerEntry('k2')?.eventId).toBe('e2');
    });

    it('forgetEvent for an unknown id is a no-op', () => {
      recordLedgerEntry('k1', entry('e1'));
      forgetEvent('missing');
      expect(getLedgerEntry('k1')?.eventId).toBe('e1');
    });

    it('restoreLedgerEntry puts an entry back', () => {
      const e = entry('e1', { userId: null });
      restoreLedgerEntry('k', e);
      expect(getLedgerEntry('k')).toEqual(e);
    });

    it('__resetLedgerForTests clears entries and open collections', () => {
      recordLedgerEntry('k', entry('e1'));
      beginCollection();
      __resetLedgerForTests();
      expect(getLedgerEntry('k')).toBeUndefined();
      expect(activeCollection()).toBeUndefined();
    });
  });

  describe('collector', () => {
    it('has no active collection by default', () => {
      expect(activeCollection()).toBeUndefined();
    });

    it('begin makes an empty collection active, end closes it', () => {
      const c = beginCollection();
      expect(c).toEqual({ written: [], retracted: [] });
      expect(activeCollection()).toBe(c);
      endCollection(c);
      expect(activeCollection()).toBeUndefined();
    });

    it('nested collections: the innermost is active and ending it re-exposes the outer', () => {
      const outer = beginCollection();
      const inner = beginCollection();
      expect(activeCollection()).toBe(inner);
      endCollection(inner);
      expect(activeCollection()).toBe(outer);
      endCollection(outer);
      expect(activeCollection()).toBeUndefined();
    });

    it('ending a collection twice or one that was never begun is harmless', () => {
      const c = beginCollection();
      endCollection(c);
      endCollection(c);
      endCollection({ written: [], retracted: [] });
      expect(activeCollection()).toBeUndefined();
    });

    it('ending the outer collection first leaves the inner one active', () => {
      const outer = beginCollection();
      const inner = beginCollection();
      endCollection(outer);
      expect(activeCollection()).toBe(inner);
    });
  });
});
