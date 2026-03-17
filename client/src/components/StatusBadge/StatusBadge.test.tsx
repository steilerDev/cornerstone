/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render } from '@testing-library/react';
import { Badge } from '../Badge/Badge.js';
import badgeStyles from '../Badge/Badge.module.css';

// Variant map mirroring the production definition in WorkItemsPage.tsx
const WORK_ITEM_STATUS_VARIANTS = {
  not_started: { label: 'Not Started', className: badgeStyles.not_started },
  in_progress: { label: 'In Progress', className: badgeStyles.in_progress },
  completed: { label: 'Completed', className: badgeStyles.completed },
};

describe('Badge — work item status variants', () => {
  // ─── Labels ────────────────────────────────────────────────────────────────

  it('renders "Not Started" for not_started status', () => {
    const { container } = render(
      <Badge variants={WORK_ITEM_STATUS_VARIANTS} value="not_started" />,
    );
    expect(container.querySelector('span')?.textContent).toBe('Not Started');
  });

  it('renders "In Progress" for in_progress status', () => {
    const { container } = render(
      <Badge variants={WORK_ITEM_STATUS_VARIANTS} value="in_progress" />,
    );
    expect(container.querySelector('span')?.textContent).toBe('In Progress');
  });

  it('renders "Completed" for completed status', () => {
    const { container } = render(<Badge variants={WORK_ITEM_STATUS_VARIANTS} value="completed" />);
    expect(container.querySelector('span')?.textContent).toBe('Completed');
  });

  // ─── Base CSS class ─────────────────────────────────────────────────────────

  it('applies the badge base CSS class for not_started', () => {
    const { container } = render(
      <Badge variants={WORK_ITEM_STATUS_VARIANTS} value="not_started" />,
    );
    expect(container.querySelector('span')?.getAttribute('class') ?? '').toContain('badge');
  });

  it('applies the badge base CSS class for in_progress', () => {
    const { container } = render(
      <Badge variants={WORK_ITEM_STATUS_VARIANTS} value="in_progress" />,
    );
    expect(container.querySelector('span')?.getAttribute('class') ?? '').toContain('badge');
  });

  it('applies the badge base CSS class for completed', () => {
    const { container } = render(<Badge variants={WORK_ITEM_STATUS_VARIANTS} value="completed" />);
    expect(container.querySelector('span')?.getAttribute('class') ?? '').toContain('badge');
  });

  // ─── Variant CSS class ──────────────────────────────────────────────────────

  it('applies not_started CSS class for not_started status', () => {
    const { container } = render(
      <Badge variants={WORK_ITEM_STATUS_VARIANTS} value="not_started" />,
    );
    expect(container.querySelector('span')?.getAttribute('class') ?? '').toContain('not_started');
  });

  it('applies in_progress CSS class for in_progress status', () => {
    const { container } = render(
      <Badge variants={WORK_ITEM_STATUS_VARIANTS} value="in_progress" />,
    );
    expect(container.querySelector('span')?.getAttribute('class') ?? '').toContain('in_progress');
  });

  it('applies completed CSS class for completed status', () => {
    const { container } = render(<Badge variants={WORK_ITEM_STATUS_VARIANTS} value="completed" />);
    expect(container.querySelector('span')?.getAttribute('class') ?? '').toContain('completed');
  });

  // ─── Element type ───────────────────────────────────────────────────────────

  it('renders as a span element', () => {
    const { container } = render(
      <Badge variants={WORK_ITEM_STATUS_VARIANTS} value="not_started" />,
    );
    const span = container.querySelector('span');
    expect(span).toBeInTheDocument();
    expect(span?.tagName.toLowerCase()).toBe('span');
  });
});
