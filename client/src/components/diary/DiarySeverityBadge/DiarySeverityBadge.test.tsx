/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { Badge } from '../../Badge/Badge.js';
import badgeStyles from '../../Badge/Badge.module.css';

// Variant map mirroring the production definition in DiaryMetadataSummary.tsx
const DIARY_SEVERITY_VARIANTS = {
  low: { label: 'Low', className: badgeStyles.low! },
  medium: { label: 'Medium', className: badgeStyles.medium! },
  high: { label: 'High', className: badgeStyles.high! },
  critical: { label: 'Critical', className: badgeStyles.critical! },
};

describe('Badge — diary severity variants', () => {
  // ─── Labels ────────────────────────────────────────────────────────────────

  it('renders "Low" label for low severity', () => {
    render(
      <Badge
        variants={DIARY_SEVERITY_VARIANTS}
        value="low"
        ariaLabel="Severity: Low"
        testId="severity-low"
      />,
    );
    expect(screen.getByTestId('severity-low')).toHaveTextContent('Low');
  });

  it('renders "Medium" label for medium severity', () => {
    render(
      <Badge
        variants={DIARY_SEVERITY_VARIANTS}
        value="medium"
        ariaLabel="Severity: Medium"
        testId="severity-medium"
      />,
    );
    expect(screen.getByTestId('severity-medium')).toHaveTextContent('Medium');
  });

  it('renders "High" label for high severity', () => {
    render(
      <Badge
        variants={DIARY_SEVERITY_VARIANTS}
        value="high"
        ariaLabel="Severity: High"
        testId="severity-high"
      />,
    );
    expect(screen.getByTestId('severity-high')).toHaveTextContent('High');
  });

  it('renders "Critical" label for critical severity', () => {
    render(
      <Badge
        variants={DIARY_SEVERITY_VARIANTS}
        value="critical"
        ariaLabel="Severity: Critical"
        testId="severity-critical"
      />,
    );
    expect(screen.getByTestId('severity-critical')).toHaveTextContent('Critical');
  });

  // ─── CSS classes ───────────────────────────────────────────────────────────

  it('applies low CSS class for low severity', () => {
    render(<Badge variants={DIARY_SEVERITY_VARIANTS} value="low" testId="severity-low" />);
    const badge = screen.getByTestId('severity-low');
    expect(badge.getAttribute('class') ?? '').toContain('low');
  });

  it('applies medium CSS class for medium severity', () => {
    render(<Badge variants={DIARY_SEVERITY_VARIANTS} value="medium" testId="severity-medium" />);
    const badge = screen.getByTestId('severity-medium');
    expect(badge.getAttribute('class') ?? '').toContain('medium');
  });

  it('applies high CSS class for high severity', () => {
    render(<Badge variants={DIARY_SEVERITY_VARIANTS} value="high" testId="severity-high" />);
    const badge = screen.getByTestId('severity-high');
    expect(badge.getAttribute('class') ?? '').toContain('high');
  });

  it('applies critical CSS class for critical severity', () => {
    render(
      <Badge variants={DIARY_SEVERITY_VARIANTS} value="critical" testId="severity-critical" />,
    );
    const badge = screen.getByTestId('severity-critical');
    expect(badge.getAttribute('class') ?? '').toContain('critical');
  });

  it('always applies the base badge class', () => {
    render(<Badge variants={DIARY_SEVERITY_VARIANTS} value="high" testId="severity-high" />);
    const badge = screen.getByTestId('severity-high');
    expect(badge.getAttribute('class') ?? '').toContain('badge');
  });

  // ─── aria-label ─────────────────────────────────────────────────────────────

  it('renders aria-label "Severity: Low" for low severity', () => {
    render(
      <Badge
        variants={DIARY_SEVERITY_VARIANTS}
        value="low"
        ariaLabel="Severity: Low"
        testId="severity-low"
      />,
    );
    expect(screen.getByTestId('severity-low')).toHaveAttribute('aria-label', 'Severity: Low');
  });

  it('renders aria-label "Severity: Medium" for medium severity', () => {
    render(
      <Badge
        variants={DIARY_SEVERITY_VARIANTS}
        value="medium"
        ariaLabel="Severity: Medium"
        testId="severity-medium"
      />,
    );
    expect(screen.getByTestId('severity-medium')).toHaveAttribute('aria-label', 'Severity: Medium');
  });

  it('renders aria-label "Severity: High" for high severity', () => {
    render(
      <Badge
        variants={DIARY_SEVERITY_VARIANTS}
        value="high"
        ariaLabel="Severity: High"
        testId="severity-high"
      />,
    );
    expect(screen.getByTestId('severity-high')).toHaveAttribute('aria-label', 'Severity: High');
  });

  it('renders aria-label "Severity: Critical" for critical severity', () => {
    render(
      <Badge
        variants={DIARY_SEVERITY_VARIANTS}
        value="critical"
        ariaLabel="Severity: Critical"
        testId="severity-critical"
      />,
    );
    expect(screen.getByTestId('severity-critical')).toHaveAttribute(
      'aria-label',
      'Severity: Critical',
    );
  });

  // ─── data-testid ────────────────────────────────────────────────────────────

  it('renders data-testid "severity-low" for low severity', () => {
    render(<Badge variants={DIARY_SEVERITY_VARIANTS} value="low" testId="severity-low" />);
    expect(screen.getByTestId('severity-low')).toBeInTheDocument();
  });

  it('renders data-testid "severity-medium" for medium severity', () => {
    render(<Badge variants={DIARY_SEVERITY_VARIANTS} value="medium" testId="severity-medium" />);
    expect(screen.getByTestId('severity-medium')).toBeInTheDocument();
  });

  it('renders data-testid "severity-high" for high severity', () => {
    render(<Badge variants={DIARY_SEVERITY_VARIANTS} value="high" testId="severity-high" />);
    expect(screen.getByTestId('severity-high')).toBeInTheDocument();
  });

  it('renders data-testid "severity-critical" for critical severity', () => {
    render(
      <Badge variants={DIARY_SEVERITY_VARIANTS} value="critical" testId="severity-critical" />,
    );
    expect(screen.getByTestId('severity-critical')).toBeInTheDocument();
  });

  // ─── Element type ───────────────────────────────────────────────────────────

  it('renders as a span element', () => {
    render(
      <Badge variants={DIARY_SEVERITY_VARIANTS} value="critical" testId="severity-critical" />,
    );
    const badge = screen.getByTestId('severity-critical');
    expect(badge.tagName.toLowerCase()).toBe('span');
  });
});
