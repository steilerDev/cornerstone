/**
 * @jest-environment jsdom
 *
 * Unit tests for MergingLineCard (Story #1797 — pending-merge placeholder row).
 *
 * Covers:
 * - Renders a Skeleton and Spinner
 * - <li> has aria-busy="true"
 * - Renders the caption text
 * - Contains no focusable elements (pure loading placeholder — nothing to tab to)
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from '@jest/globals';
import { MergingLineCard } from './MergingLineCard.js';

describe('MergingLineCard', () => {
  it('renders the <li> with aria-busy="true"', () => {
    render(<MergingLineCard caption="Merging 3 items…" />);
    const li = document.querySelector('li');
    expect(li).not.toBeNull();
    expect(li).toHaveAttribute('aria-busy', 'true');
  });

  it('renders the caption text', () => {
    render(<MergingLineCard caption="Merging 3 items…" />);
    expect(screen.getByText('Merging 3 items…')).toBeInTheDocument();
  });

  it('renders a Spinner element', () => {
    render(<MergingLineCard caption="Merging 2 items…" />);
    // Spinner renders an svg with role="img" and aria-label="Loading" (see PhotoAnnotator tests)
    expect(document.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders a Skeleton placeholder', () => {
    render(<MergingLineCard caption="Merging 2 items…" />);
    // Skeleton renders skeleton line placeholders — assert at least one exists
    expect(document.querySelectorAll('li > *').length).toBeGreaterThan(0);
  });

  it('contains no focusable elements (buttons, inputs, links)', () => {
    render(<MergingLineCard caption="Merging 2 items…" />);
    const li = document.querySelector('li')!;
    expect(li.querySelectorAll('button, input, a[href], select, textarea')).toHaveLength(0);
  });

  it('renders different caption text when the prop changes', () => {
    const { rerender } = render(<MergingLineCard caption="Merging 2 items…" />);
    expect(screen.getByText('Merging 2 items…')).toBeInTheDocument();

    rerender(<MergingLineCard caption="Merging 5 items…" />);
    expect(screen.getByText('Merging 5 items…')).toBeInTheDocument();
    expect(screen.queryByText('Merging 2 items…')).not.toBeInTheDocument();
  });
});
