/** The 17 terms with a fixed in-place definition (#2258 AC3). Keys: common:termHint.term.* / .definition.* */
export const TERM_HINT_TERMS = [
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
] as const;
export type TermHintTerm = (typeof TERM_HINT_TERMS)[number];

/** The glossary.json canon (term key) of each hint term; the parity test compares en/de against it. */
export const TERM_HINT_GLOSSARY_CANON: Readonly<Record<TermHintTerm, string>> = {
  late: 'Late',
  heldUp: 'Held up',
  waitsFor: 'Waits for',
  holdsUp: 'Holds up',
  critical: 'Critical',
  notNow: 'Not now',
  range: 'Range',
  split: 'Split',
  notYetSplit: 'Not yet split',
  submitted: 'Submitted',
  readyToSubmit: 'Ready to submit',
  drawDownRequest: 'Draw-down request',
  remainingOnOffer: 'Remaining on offer',
  allocated: 'Allocated',
  unallocated: 'Unallocated',
  overAllocated: 'Over-allocated',
  spot: 'Spot',
};
