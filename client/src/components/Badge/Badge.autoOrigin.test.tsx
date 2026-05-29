/**
 * @jest-environment jsdom
 *
 * Unit tests for the `autoOrigin` CSS class on Badge (Story #1551).
 *
 * The CostBreakdownTable uses:
 *   <Badge
 *     variants={{ auto: { label: t('overview.costBreakdown.autoOriginBadge.label'), className: badgeStyles.autoOrigin } }}
 *     value="auto"
 *     ariaLabel={t('overview.costBreakdown.autoOriginBadge.ariaLabel')}
 *   />
 *
 * Because identity-obj-proxy returns the CSS class name string as its own key
 * (e.g. badgeStyles.autoOrigin === 'autoOrigin'), we verify:
 *   - value='auto' → applies the .autoOrigin class
 *   - value='manual' (or any non-matching) → does NOT apply .autoOrigin class
 *   - ariaLabel is forwarded correctly
 */

import { describe, it, expect } from '@jest/globals';
import { render } from '@testing-library/react';
import { Badge } from './Badge.js';
import badgeStyles from './Badge.module.css';

// identity-obj-proxy: badgeStyles.autoOrigin === 'autoOrigin'

const AUTO_ORIGIN_VARIANTS = {
  auto: {
    label: 'Auto-itemized',
    className: badgeStyles.autoOrigin,
  },
};

describe('Badge — autoOrigin variant', () => {
  // ─── class applied ────────────────────────────────────────────────────────

  it("applies the autoOrigin CSS class when value='auto'", () => {
    const { container } = render(<Badge variants={AUTO_ORIGIN_VARIANTS} value="auto" />);
    const span = container.querySelector('span');
    // identity-obj-proxy returns the key as its value, so badgeStyles.autoOrigin === 'autoOrigin'
    expect(span?.getAttribute('class') ?? '').toContain('autoOrigin');
  });

  it('also applies the base badge CSS class with the autoOrigin variant', () => {
    const { container } = render(<Badge variants={AUTO_ORIGIN_VARIANTS} value="auto" />);
    const span = container.querySelector('span');
    const cls = span?.getAttribute('class') ?? '';
    expect(cls).toContain('badge');
    expect(cls).toContain('autoOrigin');
  });

  it("renders the Auto-itemized label text when value='auto'", () => {
    const { container } = render(<Badge variants={AUTO_ORIGIN_VARIANTS} value="auto" />);
    const span = container.querySelector('span');
    expect(span?.textContent).toBe('Auto-itemized');
  });

  // ─── aria-label ────────────────────────────────────────────────────────────

  it('sets aria-label from the ariaLabel prop', () => {
    const { container } = render(
      <Badge
        variants={AUTO_ORIGIN_VARIANTS}
        value="auto"
        ariaLabel="Budget line was created automatically via auto-itemization"
      />,
    );
    const span = container.querySelector('span');
    expect(span).toHaveAttribute(
      'aria-label',
      'Budget line was created automatically via auto-itemization',
    );
  });

  // ─── class NOT applied for non-matching values ─────────────────────────────

  it("does NOT apply the autoOrigin CSS class when value='manual'", () => {
    // Build a variant map that includes both auto and manual, but the auto class
    // should only appear for value='auto'.
    const MIXED_VARIANTS = {
      auto: { label: 'Auto-itemized', className: badgeStyles.autoOrigin },
      manual: { label: 'Manual', className: '' },
    };
    const { container } = render(<Badge variants={MIXED_VARIANTS} value="manual" />);
    const span = container.querySelector('span');
    expect(span?.getAttribute('class') ?? '').not.toContain('autoOrigin');
  });

  it('does NOT apply the autoOrigin CSS class for an unknown value', () => {
    const { container } = render(<Badge variants={AUTO_ORIGIN_VARIANTS} value="unknown" />);
    const span = container.querySelector('span');
    // The variant for 'unknown' is undefined, so className is not added
    expect(span?.getAttribute('class') ?? '').not.toContain('autoOrigin');
  });

  // ─── identity-obj-proxy verification ──────────────────────────────────────

  it("badgeStyles.autoOrigin resolves to the string 'autoOrigin' via identity-obj-proxy", () => {
    // This documents the proxy behaviour — badgeStyles returns its own key as the value.
    // The test is intentionally simple: it proves the CSS Modules mock is consistent
    // with what Badge.tsx passes as className.
    expect(badgeStyles.autoOrigin).toBe('autoOrigin');
  });
});
