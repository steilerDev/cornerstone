/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import type { BudgetSourceChip as BudgetSourceChipType } from './BudgetSourceChip.js';

// Mock react-i18next
jest.unstable_mockModule('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'overview.costBreakdown.sourceFilter.chipSelected') {
        return `Filter: ${params?.name ?? ''} (selected)`;
      }
      if (key === 'overview.costBreakdown.sourceFilter.chipNotSelected') {
        return `Filter: ${params?.name ?? ''} (not selected)`;
      }
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

// Mock budgetSourceColors to control deterministic output
jest.unstable_mockModule('../../lib/budgetSourceColors.js', () => ({
  getSourceColorIndex: (sourceId: string) => {
    // Deterministic: return 3 for 'src-1', 7 for 'src-2', etc.
    if (sourceId === 'src-1') return 3;
    if (sourceId === 'src-2') return 7;
    return 1;
  },
  getSourceBadgeStyleKey: (sourceId: string | null) => {
    if (sourceId === null) return 'sourceUnassigned';
    if (sourceId === 'src-1') return 'source3';
    if (sourceId === 'src-2') return 'source7';
    return 'source1';
  },
}));

let BudgetSourceChip: typeof BudgetSourceChipType;

beforeAll(async () => {
  const module = await import('./BudgetSourceChip.js');
  BudgetSourceChip = module.BudgetSourceChip;
});

describe('BudgetSourceChip', () => {
  // ── 14. Basic rendering ────────────────────────────────────────────────────

  it('renders a button with the source name visible', () => {
    const onToggle = jest.fn();
    render(
      <BudgetSourceChip
        sourceId="src-1"
        name="Bank Loan"
        isSelected={false}
        onToggle={onToggle}
      />,
    );

    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.getByText('Bank Loan')).toBeInTheDocument();
  });

  it('renders as a button element', () => {
    const onToggle = jest.fn();
    render(
      <BudgetSourceChip
        sourceId="src-1"
        name="Bank Loan"
        isSelected={false}
        onToggle={onToggle}
      />,
    );

    const btn = screen.getByRole('button');
    expect(btn.tagName.toLowerCase()).toBe('button');
  });

  // ── 15. Long name truncation ───────────────────────────────────────────────

  it('truncates names longer than 24 characters with an ellipsis', () => {
    const onToggle = jest.fn();
    const longName = 'This Is A Very Long Source Name'; // 31 chars
    render(
      <BudgetSourceChip sourceId="src-1" name={longName} isSelected={false} onToggle={onToggle} />,
    );

    // Should show first 24 chars + ellipsis character
    const truncated = `${longName.slice(0, 24)}…`;
    expect(screen.getByText(truncated)).toBeInTheDocument();
  });

  it('does not truncate names at exactly 24 characters', () => {
    const onToggle = jest.fn();
    const exactName = 'Exactly24CharsLongSource'; // 24 chars
    render(
      <BudgetSourceChip
        sourceId="src-1"
        name={exactName}
        isSelected={false}
        onToggle={onToggle}
      />,
    );

    // Should show the full name without ellipsis
    expect(screen.getByText(exactName)).toBeInTheDocument();
  });

  // ── 16. aria-pressed when selected ────────────────────────────────────────

  it('sets aria-pressed="true" when isSelected=true', () => {
    const onToggle = jest.fn();
    render(
      <BudgetSourceChip
        sourceId="src-1"
        name="Bank Loan"
        isSelected={true}
        onToggle={onToggle}
      />,
    );

    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  // ── 17. aria-pressed when not selected ────────────────────────────────────

  it('sets aria-pressed="false" when isSelected=false', () => {
    const onToggle = jest.fn();
    render(
      <BudgetSourceChip
        sourceId="src-1"
        name="Bank Loan"
        isSelected={false}
        onToggle={onToggle}
      />,
    );

    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  // ── 18. Calls onToggle with sourceId on click ───────────────────────────

  it('calls onToggle with sourceId when clicked', () => {
    const onToggle = jest.fn();
    render(
      <BudgetSourceChip
        sourceId="src-1"
        name="Bank Loan"
        isSelected={false}
        onToggle={onToggle}
      />,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('src-1');
  });

  // ── 19. Calls onToggle with null for unassigned chip ─────────────────────

  it('calls onToggle with null when sourceId is null (unassigned chip)', () => {
    const onToggle = jest.fn();
    render(
      <BudgetSourceChip
        sourceId={null}
        name="Unassigned"
        isSelected={false}
        onToggle={onToggle}
      />,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(null);
  });

  // ── 20. Disabled chip prevents click ─────────────────────────────────────

  it('renders button as disabled when disabled=true', () => {
    const onToggle = jest.fn();
    render(
      <BudgetSourceChip
        sourceId="src-1"
        name="Bank Loan"
        isSelected={false}
        onToggle={onToggle}
        disabled={true}
      />,
    );

    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
  });

  it('does not call onToggle when disabled chip is clicked', () => {
    const onToggle = jest.fn();
    render(
      <BudgetSourceChip
        sourceId="src-1"
        name="Bank Loan"
        isSelected={false}
        onToggle={onToggle}
        disabled={true}
      />,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).not.toHaveBeenCalled();
  });

  // ── 21. CSS custom property for dot color ─────────────────────────────────

  it('applies --chip-dot CSS custom property using source color index (named source)', () => {
    const onToggle = jest.fn();
    render(
      <BudgetSourceChip
        sourceId="src-1"
        name="Bank Loan"
        isSelected={false}
        onToggle={onToggle}
      />,
    );

    const btn = screen.getByRole('button');
    // The mock returns colorIndex=3 for src-1 → --chip-dot = var(--color-source-3-dot)
    const style = btn.getAttribute('style') ?? '';
    expect(style).toContain('--chip-dot: var(--color-source-3-dot)');
  });

  it('applies --chip-dot CSS custom property using index 0 for null (unassigned) source', () => {
    const onToggle = jest.fn();
    render(
      <BudgetSourceChip
        sourceId={null}
        name="Unassigned"
        isSelected={false}
        onToggle={onToggle}
      />,
    );

    const btn = screen.getByRole('button');
    // sourceId === null → colorIndex = 0 (slot 0 is reserved for unassigned)
    const style = btn.getAttribute('style') ?? '';
    expect(style).toContain('--chip-dot: var(--color-source-0-dot)');
  });

  it('applies --chip-bg and --chip-text CSS custom properties', () => {
    const onToggle = jest.fn();
    render(
      <BudgetSourceChip
        sourceId="src-1"
        name="Bank Loan"
        isSelected={false}
        onToggle={onToggle}
      />,
    );

    const btn = screen.getByRole('button');
    const style = btn.getAttribute('style') ?? '';
    expect(style).toContain('--chip-bg: var(--color-source-3-bg)');
    expect(style).toContain('--chip-text: var(--color-source-3-text)');
  });

  // ── aria-label ─────────────────────────────────────────────────────────────

  it('sets aria-label for "not selected" state using translation key', () => {
    const onToggle = jest.fn();
    render(
      <BudgetSourceChip
        sourceId="src-1"
        name="Bank Loan"
        isSelected={false}
        onToggle={onToggle}
      />,
    );

    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-label', 'Filter: Bank Loan (not selected)');
  });

  it('sets aria-label for "selected" state using translation key', () => {
    const onToggle = jest.fn();
    render(
      <BudgetSourceChip
        sourceId="src-1"
        name="Bank Loan"
        isSelected={true}
        onToggle={onToggle}
      />,
    );

    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-label', 'Filter: Bank Loan (selected)');
  });

  // ── Dot element rendered ──────────────────────────────────────────────────

  it('renders the color dot span with aria-hidden="true"', () => {
    const onToggle = jest.fn();
    const { container } = render(
      <BudgetSourceChip
        sourceId="src-1"
        name="Bank Loan"
        isSelected={false}
        onToggle={onToggle}
      />,
    );

    const dotEl = container.querySelector('[aria-hidden="true"]');
    expect(dotEl).toBeInTheDocument();
  });

  // ── Keyboard interaction ──────────────────────────────────────────────────

  it('calls onToggle when Space key is pressed on the button', () => {
    const onToggle = jest.fn();
    render(
      <BudgetSourceChip
        sourceId="src-1"
        name="Bank Loan"
        isSelected={false}
        onToggle={onToggle}
      />,
    );

    const btn = screen.getByRole('button');
    btn.focus();
    fireEvent.keyDown(btn, { key: ' ', code: 'Space' });
    fireEvent.click(btn); // Space triggers click on button elements by default
    expect(onToggle).toHaveBeenCalledWith('src-1');
  });

  it('calls onToggle when Enter key is pressed on the button', () => {
    const onToggle = jest.fn();
    render(
      <BudgetSourceChip
        sourceId="src-1"
        name="Bank Loan"
        isSelected={false}
        onToggle={onToggle}
      />,
    );

    const btn = screen.getByRole('button');
    btn.focus();
    fireEvent.keyDown(btn, { key: 'Enter', code: 'Enter' });
    fireEvent.click(btn); // Enter triggers click on button elements by default
    expect(onToggle).toHaveBeenCalledWith('src-1');
  });
});
