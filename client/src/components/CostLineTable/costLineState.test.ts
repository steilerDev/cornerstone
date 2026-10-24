import { describe, it, expect } from '@jest/globals';
import { COST_LINE_STATES, deriveCostLineState } from './costLineState.js';
import { COST_LINE_DOCUMENT_KINDS } from './costLineDocumentKind.js';

describe('deriveCostLineState', () => {
  it('maps each link status to its state', () => {
    expect(deriveCostLineState('quotation')).toBe('offered');
    expect(deriveCostLineState('pending')).toBe('invoiced');
    expect(deriveCostLineState('paid')).toBe('paid');
    expect(deriveCostLineState('claimed')).toBe('submitted');
  });

  it('is an estimate without a link', () => {
    expect(deriveCostLineState(null)).toBe('estimate');
  });

  it('takes only the link status as input, never the basis', () => {
    // Mutation: deriving the state from `confidence` would need a second argument and fail here.
    expect(deriveCostLineState.length).toBe(1);
  });

  it('lists the five states in display order', () => {
    expect(COST_LINE_STATES).toEqual(['estimate', 'offered', 'invoiced', 'paid', 'submitted']);
  });
});

describe('COST_LINE_DOCUMENT_KINDS', () => {
  it('lists offer and invoice', () => {
    expect(COST_LINE_DOCUMENT_KINDS).toEqual(['offer', 'invoice']);
  });
});
