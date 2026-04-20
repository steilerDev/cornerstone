/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { Badge } from '../../Badge/Badge.js';
import badgeStyles from '../../Badge/Badge.module.css';

// Variant map mirroring the production definition in DiaryMetadataSummary.tsx
const DIARY_OUTCOME_VARIANTS = {
  pass: { label: 'Pass', className: badgeStyles.pass! },
  fail: { label: 'Fail', className: badgeStyles.fail! },
  conditional: { label: 'Conditional', className: badgeStyles.conditional! },
};

describe('Badge — diary outcome variants', () => {
  // ─── Labels ────────────────────────────────────────────────────────────────

  it('renders "Pass" label for pass outcome', () => {
    render(
      <Badge
        variants={DIARY_OUTCOME_VARIANTS}
        value="pass"
        ariaLabel="Outcome: Pass"
        testId="outcome-pass"
      />,
    );
    expect(screen.getByTestId('outcome-pass')).toHaveTextContent('Pass');
  });

  it('renders "Fail" label for fail outcome', () => {
    render(
      <Badge
        variants={DIARY_OUTCOME_VARIANTS}
        value="fail"
        ariaLabel="Outcome: Fail"
        testId="outcome-fail"
      />,
    );
    expect(screen.getByTestId('outcome-fail')).toHaveTextContent('Fail');
  });

  it('renders "Conditional" label for conditional outcome', () => {
    render(
      <Badge
        variants={DIARY_OUTCOME_VARIANTS}
        value="conditional"
        ariaLabel="Outcome: Conditional"
        testId="outcome-conditional"
      />,
    );
    expect(screen.getByTestId('outcome-conditional')).toHaveTextContent('Conditional');
  });

  // ─── CSS classes ───────────────────────────────────────────────────────────

  it('applies pass CSS class for pass outcome', () => {
    render(<Badge variants={DIARY_OUTCOME_VARIANTS} value="pass" testId="outcome-pass" />);
    const badge = screen.getByTestId('outcome-pass');
    expect(badge.getAttribute('class') ?? '').toContain('pass');
  });

  it('applies fail CSS class for fail outcome', () => {
    render(<Badge variants={DIARY_OUTCOME_VARIANTS} value="fail" testId="outcome-fail" />);
    const badge = screen.getByTestId('outcome-fail');
    expect(badge.getAttribute('class') ?? '').toContain('fail');
  });

  it('applies conditional CSS class for conditional outcome', () => {
    render(
      <Badge variants={DIARY_OUTCOME_VARIANTS} value="conditional" testId="outcome-conditional" />,
    );
    const badge = screen.getByTestId('outcome-conditional');
    expect(badge.getAttribute('class') ?? '').toContain('conditional');
  });

  it('always applies the base badge class', () => {
    render(<Badge variants={DIARY_OUTCOME_VARIANTS} value="pass" testId="outcome-pass" />);
    const badge = screen.getByTestId('outcome-pass');
    expect(badge.getAttribute('class') ?? '').toContain('badge');
  });

  // ─── aria-label ─────────────────────────────────────────────────────────────

  it('renders aria-label "Outcome: Pass" for pass outcome', () => {
    render(
      <Badge
        variants={DIARY_OUTCOME_VARIANTS}
        value="pass"
        ariaLabel="Outcome: Pass"
        testId="outcome-pass"
      />,
    );
    expect(screen.getByTestId('outcome-pass')).toHaveAttribute('aria-label', 'Outcome: Pass');
  });

  it('renders aria-label "Outcome: Fail" for fail outcome', () => {
    render(
      <Badge
        variants={DIARY_OUTCOME_VARIANTS}
        value="fail"
        ariaLabel="Outcome: Fail"
        testId="outcome-fail"
      />,
    );
    expect(screen.getByTestId('outcome-fail')).toHaveAttribute('aria-label', 'Outcome: Fail');
  });

  it('renders aria-label "Outcome: Conditional" for conditional outcome', () => {
    render(
      <Badge
        variants={DIARY_OUTCOME_VARIANTS}
        value="conditional"
        ariaLabel="Outcome: Conditional"
        testId="outcome-conditional"
      />,
    );
    expect(screen.getByTestId('outcome-conditional')).toHaveAttribute(
      'aria-label',
      'Outcome: Conditional',
    );
  });

  // ─── data-testid ────────────────────────────────────────────────────────────

  it('renders data-testid "outcome-pass" for pass outcome', () => {
    render(<Badge variants={DIARY_OUTCOME_VARIANTS} value="pass" testId="outcome-pass" />);
    expect(screen.getByTestId('outcome-pass')).toBeInTheDocument();
  });

  it('renders data-testid "outcome-fail" for fail outcome', () => {
    render(<Badge variants={DIARY_OUTCOME_VARIANTS} value="fail" testId="outcome-fail" />);
    expect(screen.getByTestId('outcome-fail')).toBeInTheDocument();
  });

  it('renders data-testid "outcome-conditional" for conditional outcome', () => {
    render(
      <Badge variants={DIARY_OUTCOME_VARIANTS} value="conditional" testId="outcome-conditional" />,
    );
    expect(screen.getByTestId('outcome-conditional')).toBeInTheDocument();
  });

  // ─── Element type ───────────────────────────────────────────────────────────

  it('renders as a span element', () => {
    render(<Badge variants={DIARY_OUTCOME_VARIANTS} value="pass" testId="outcome-pass" />);
    const badge = screen.getByTestId('outcome-pass');
    expect(badge.tagName.toLowerCase()).toBe('span');
  });
});
