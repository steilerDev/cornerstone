/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import type * as ChipModule from './CostLineStateChip.js';
import { COST_LINE_STATES } from './costLineState.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  LocaleProvider: ({ children }: { children: unknown }) => children,
  useLocale: () => ({
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  }),
}));

let CostLineStateChip: (typeof ChipModule)['CostLineStateChip'];

beforeEach(async () => {
  ({ CostLineStateChip } = (await import('./CostLineStateChip.js')) as typeof ChipModule);
});

describe('CostLineStateChip', () => {
  it.each([
    ['estimate', 'Estimate'],
    ['offered', 'Offered'],
    ['invoiced', 'Invoiced'],
    ['paid', 'Paid'],
    ['submitted', 'Submitted'],
  ] as const)('renders the %s state as %s', (state, label) => {
    render(<CostLineStateChip state={state} testId="chip" />);
    expect(screen.getByTestId('chip')).toHaveTextContent(label);
  });

  it('covers every state', () => {
    expect(COST_LINE_STATES).toHaveLength(5);
  });

  it('an estimate shows its basis and margin as muted text', () => {
    render(<CostLineStateChip state="estimate" basis="own_estimate" margin={0.2} />);
    expect(screen.getByText(/20%/)).toBeInTheDocument();
  });

  it('an estimate without a margin shows only the basis', () => {
    render(<CostLineStateChip state="estimate" basis="professional_estimate" margin={0} />);
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('%');
    expect(text.replace('Estimate', '').trim().length).toBeGreaterThan(0);
  });

  it('an estimate without a basis shows no extra text', () => {
    render(<CostLineStateChip state="estimate" />);
    expect(document.body.textContent).toBe('Estimate');
  });

  it('linked states never show a basis', () => {
    render(<CostLineStateChip state="paid" basis="quote" margin={0.05} />);
    expect(document.body.textContent).toBe('Paid');
  });

  it('is not a figure', () => {
    const { container } = render(<CostLineStateChip state="offered" />);
    expect(container.querySelector('[data-figure]')).toBeNull();
  });
});
