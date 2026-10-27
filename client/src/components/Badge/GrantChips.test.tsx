/**
 * @jest-environment jsdom
 */
/**
 * GrantChips (#2242, AC6, FB2): the grant chip of a task / purchase row.
 *
 * Mutations these tests catch: a fixed grant shown as a percentage (or vice versa); the "+n"
 * badge exposed to assistive tech (it must be aria-hidden); the sr-only text missing a grant
 * name; chips rendered for no grants; the first grant not shown.
 */
import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import type { ItemGrantChip } from '@cornerstone/shared';
import type * as ChipsModule from './GrantChips.js';

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

const pct = (id: string, name: string, rate: number): ItemGrantChip => ({
  id,
  name,
  reductionType: 'percentage',
  rate,
});

describe('GrantChips', () => {
  let GrantChips: typeof ChipsModule.GrantChips;

  beforeAll(async () => {
    ({ GrantChips } = await import('./GrantChips.js'));
  });

  it.each([undefined, []])('renders nothing for %j', (grants) => {
    const { container } = render(<GrantChips grants={grants} testId="g" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows one grant as "name · rate" with no +n badge', () => {
    render(<GrantChips grants={[pct('sp-1', 'Energy grant', 30)]} testId="g" />);

    expect(screen.getByTestId('g-first')).toHaveTextContent(/^Energy grant · 30\s?%$/);
    expect(screen.getByTestId('g-first')).toHaveAttribute(
      'title',
      expect.stringContaining('Energy grant'),
    );
    expect(screen.queryByTestId('g-more')).toBeNull();
  });

  it('shows a fractional rate with two decimals', () => {
    render(<GrantChips grants={[pct('sp-1', 'Low rate', 2.5)]} testId="g" />);
    expect(screen.getByTestId('g-first')).toHaveTextContent(/2[.,]50\s?%/);
  });

  it('shows a legacy fixed grant as the stored amount, not a percentage', () => {
    render(
      <GrantChips
        grants={[{ id: 'sp-f', name: 'Fixed aid', reductionType: 'fixed', rate: 1500 }]}
        testId="g"
      />,
    );
    const text = screen.getByTestId('g-first').textContent ?? '';
    expect(text).toMatch(/Fixed aid · .*1,?500/);
    expect(text).not.toContain('%');
  });

  it('with 2+ grants: first chip, an aria-hidden "+n", and every name in screen-reader text', () => {
    render(
      <GrantChips
        grants={[pct('a', 'Alpha', 10), pct('b', 'Beta', 20), pct('c', 'Gamma', 30)]}
        testId="g"
      />,
    );

    expect(screen.getByTestId('g-first')).toHaveTextContent(/^Alpha/);
    const more = screen.getByTestId('g-more');
    expect(more).toHaveTextContent('+2');
    expect(more.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByText('Grants: Alpha, Beta, Gamma')).toBeInTheDocument();
  });
});
