/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import type { AreaSummary } from '@cornerstone/shared';
import { AreaBreadcrumb } from './AreaBreadcrumb.js';

// client/src/test/setupTests.ts initialises i18n globally, so t('noArea')
// returns "No area" and t('pathLabel') returns "Area path" without per-test setup.

// ── Helper fixtures ──────────────────────────────────────────────────────────

const areaNoAncestors: AreaSummary = {
  id: '1',
  name: 'Garage',
  color: null,
  ancestors: [],
};

const areaTwoAncestors: AreaSummary = {
  id: '3',
  name: 'Bathroom',
  color: null,
  ancestors: [
    { id: '1', name: 'House', color: null },
    { id: '2', name: 'Basement', color: null },
  ],
};

const areaWithColor: AreaSummary = {
  id: '4',
  name: 'Kitchen',
  color: '#ff0000',
  ancestors: [{ id: '1', name: 'House', color: '#00ff00' }],
};

const areaCompactMulti: AreaSummary = {
  id: '5',
  name: 'Pantry',
  color: null,
  ancestors: [
    { id: '1', name: 'Property', color: null },
    { id: '2', name: 'House', color: null },
  ],
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AreaBreadcrumb', () => {
  // ── 1. Null area — default variant ─────────────────────────────────────────

  describe('null area — default variant', () => {
    it('renders "No area" text', () => {
      render(<AreaBreadcrumb area={null} />);
      expect(screen.getByText('No area')).toBeInTheDocument();
    });

    it('does not render a nav element', () => {
      render(<AreaBreadcrumb area={null} />);
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });

    it('does not render an ol element', () => {
      render(<AreaBreadcrumb area={null} />);
      const { container } = render(<AreaBreadcrumb area={null} />);
      expect(container.querySelector('ol')).not.toBeInTheDocument();
    });
  });

  // ── 2. Null area — compact variant ─────────────────────────────────────────

  describe('null area — compact variant', () => {
    it('renders "No area" text', () => {
      render(<AreaBreadcrumb area={null} variant="compact" />);
      expect(screen.getByText('No area')).toBeInTheDocument();
    });

    it('does not render a tooltip (no role="tooltip" in DOM)', () => {
      const { container } = render(<AreaBreadcrumb area={null} variant="compact" />);
      expect(container.querySelector('[role="tooltip"]')).not.toBeInTheDocument();
    });
  });

  // ── 3. Default variant — single segment (no ancestors) ─────────────────────

  describe('default variant — single segment (no ancestors)', () => {
    it('renders the area name', () => {
      render(<AreaBreadcrumb area={areaNoAncestors} />);
      expect(screen.getByText('Garage')).toBeInTheDocument();
    });

    it('renders nav with aria-label "Area path"', () => {
      render(<AreaBreadcrumb area={areaNoAncestors} />);
      expect(screen.getByRole('navigation', { name: 'Area path' })).toBeInTheDocument();
    });

    it('renders no aria-hidden separator elements', () => {
      const { container } = render(<AreaBreadcrumb area={areaNoAncestors} />);
      const separators = container.querySelectorAll('[aria-hidden="true"]');
      expect(separators).toHaveLength(0);
    });

    it('renders exactly 1 li element', () => {
      const { container } = render(<AreaBreadcrumb area={areaNoAncestors} />);
      const lis = container.querySelectorAll('li');
      expect(lis).toHaveLength(1);
    });
  });

  // ── 4. Default variant — multi-segment (2 ancestors + self) ────────────────

  describe('default variant — multi-segment (2 ancestors + self)', () => {
    it('renders all three names', () => {
      render(<AreaBreadcrumb area={areaTwoAncestors} />);
      expect(screen.getByText('House')).toBeInTheDocument();
      expect(screen.getByText('Basement')).toBeInTheDocument();
      expect(screen.getByText('Bathroom')).toBeInTheDocument();
    });

    it('renders nav with aria-label "Area path"', () => {
      render(<AreaBreadcrumb area={areaTwoAncestors} />);
      expect(screen.getByRole('navigation', { name: 'Area path' })).toBeInTheDocument();
    });

    it('renders exactly 2 aria-hidden separator elements', () => {
      const { container } = render(<AreaBreadcrumb area={areaTwoAncestors} />);
      const separators = container.querySelectorAll('[aria-hidden="true"]');
      expect(separators).toHaveLength(2);
    });

    it('renders 5 li items total (3 segments + 2 separators)', () => {
      const { container } = render(<AreaBreadcrumb area={areaTwoAncestors} />);
      const lis = container.querySelectorAll('li');
      expect(lis).toHaveLength(5);
    });
  });

  // ── 5. Default variant — color ignored ─────────────────────────────────────

  describe('default variant — color prop is ignored (no inline style)', () => {
    it('segment li elements have no inline color style when color is non-null', () => {
      const { container } = render(<AreaBreadcrumb area={areaWithColor} />);
      const lis = container.querySelectorAll('li');
      lis.forEach((li) => {
        expect((li as HTMLElement).style.color).toBe('');
      });
    });
  });

  // ── 6. Default variant — default prop ──────────────────────────────────────

  describe('default variant — default prop', () => {
    it('renders nav (variant defaults to "default") when no variant prop supplied', () => {
      render(<AreaBreadcrumb area={areaNoAncestors} />);
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });
  });

  // ── 7. Compact variant — tooltip wraps full path ────────────────────────────

  describe('compact variant — tooltip wraps full path', () => {
    it('renders a tabindex="0" element with full path as textContent', () => {
      const { container } = render(<AreaBreadcrumb area={areaCompactMulti} variant="compact" />);
      const focusable = container.querySelector('[tabindex="0"]');
      expect(focusable).toBeInTheDocument();
      expect((focusable as HTMLElement).textContent).toBe('Property \u203a House \u203a Pantry');
    });

    it('renders a role="tooltip" element containing the full path', () => {
      const { container } = render(<AreaBreadcrumb area={areaCompactMulti} variant="compact" />);
      const tooltip = container.querySelector('[role="tooltip"]');
      expect(tooltip).toBeInTheDocument();
      expect((tooltip as HTMLElement).textContent).toBe('Property \u203a House \u203a Pantry');
    });

    it('does not render a nav element', () => {
      render(<AreaBreadcrumb area={areaCompactMulti} variant="compact" />);
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });
  });

  // ── 8. Compact variant — single segment tooltip ─────────────────────────────

  describe('compact variant — single segment tooltip', () => {
    it('tooltip textContent equals the single area name', () => {
      const { container } = render(<AreaBreadcrumb area={areaNoAncestors} variant="compact" />);
      const tooltip = container.querySelector('[role="tooltip"]');
      expect(tooltip).toBeInTheDocument();
      expect((tooltip as HTMLElement).textContent).toBe('Garage');
    });

    it('tabindex="0" element textContent equals the single area name', () => {
      const { container } = render(<AreaBreadcrumb area={areaNoAncestors} variant="compact" />);
      const focusable = container.querySelector('[tabindex="0"]');
      expect(focusable).toBeInTheDocument();
      expect((focusable as HTMLElement).textContent).toBe('Garage');
    });
  });
});
