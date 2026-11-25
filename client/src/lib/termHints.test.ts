import { describe, it, expect } from '@jest/globals';
import { TERM_HINT_TERMS, TERM_HINT_GLOSSARY_CANON } from './termHints.js';
import { GLOSSARY } from '../i18n/glossary.js';
import enCommon from '../i18n/en/common.json';
import deCommon from '../i18n/de/common.json';

/**
 * Term-hint registry parity (#2258 AC3): one definition per term, en and de agree with glossary.json.
 *
 * Mutation notes (each must turn a test red):
 *  - append a member to TERM_HINT_TERMS without a TERM_HINT_GLOSSARY_CANON entry -> "pins the 17 members"
 *  - change en `termHint.definition.late` text -> "en definition equals the glossary definition"
 *  - set de `termHint.term.split` to "Split" -> "de term equals the glossary German form"
 */
type Hints = {
  explain: string;
  explainTerm: string;
  panelLabel: string;
  term: Record<string, string>;
  definition: Record<string, string>;
};
const en = (enCommon as unknown as { termHint: Hints }).termHint;
const de = (deCommon as unknown as { termHint: Hints }).termHint;

describe('term hint registry', () => {
  it('pins the 17 members in order', () => {
    expect([...TERM_HINT_TERMS]).toEqual([
      'late',
      'heldUp',
      'waitsFor',
      'holdsUp',
      'critical',
      'notNow',
      'range',
      'split',
      'notYetSplit',
      'submitted',
      'readyToSubmit',
      'drawDownRequest',
      'remainingOnOffer',
      'allocated',
      'unallocated',
      'overAllocated',
      'spot',
    ]);
    expect(Object.keys(TERM_HINT_GLOSSARY_CANON)).toEqual([...TERM_HINT_TERMS]);
  });

  it.each([...TERM_HINT_TERMS])('%s points at an existing glossary term', (member) => {
    const canon = TERM_HINT_GLOSSARY_CANON[member];
    expect(GLOSSARY.terms.some((term) => term.canon === canon)).toBe(true);
  });

  describe.each([...TERM_HINT_TERMS])('%s', (member) => {
    const glossary = GLOSSARY.terms.find(
      (term) => term.canon === TERM_HINT_GLOSSARY_CANON[member],
    )!;

    it('en term equals the glossary English form', () => {
      expect(en.term[member]).toBe(glossary.en.singular ?? glossary.en.verb);
    });

    it('en definition equals the glossary definition', () => {
      expect(en.definition[member]).toBe(glossary.definition);
    });

    it('de term equals the glossary German form', () => {
      expect(de.term[member]).toBe(glossary.de.singular ?? glossary.de.noun ?? glossary.de.verb);
    });

    it('de definition is a real translation', () => {
      expect(de.definition[member]).toBeTruthy();
      expect(de.definition[member]).not.toBe(en.definition[member]);
    });
  });

  it('has the shared labels in both locales', () => {
    for (const hints of [en, de]) {
      expect(hints.explain).toBeTruthy();
      expect(hints.explainTerm).toBeTruthy();
      expect(hints.panelLabel).toBeTruthy();
      expect(hints.explainTerm).toContain('{{term}}');
    }
  });

  it('has no term or definition key outside the registry', () => {
    for (const hints of [en, de]) {
      expect(Object.keys(hints.term)).toEqual([...TERM_HINT_TERMS]);
      expect(Object.keys(hints.definition)).toEqual([...TERM_HINT_TERMS]);
    }
  });
});
