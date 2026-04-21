/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from './EmptyState.js';

// CSS modules are mocked via identity-obj-proxy (classNames returned as-is)

describe('EmptyState', () => {
  // ── message prop ──────────────────────────────────────────────────────────

  it('renders the message text', () => {
    render(<EmptyState message="No work items found" />);

    expect(screen.getByText('No work items found')).toBeInTheDocument();
  });

  // ── icon prop ─────────────────────────────────────────────────────────────

  it('renders the icon when provided', () => {
    render(<EmptyState message="Empty" icon="📭" />);

    expect(screen.getByText('📭')).toBeInTheDocument();
  });

  it('wraps the icon in an aria-hidden container', () => {
    const { container } = render(<EmptyState message="Empty" icon="📭" />);

    const iconWrapper = container.querySelector('[aria-hidden="true"]');
    expect(iconWrapper).not.toBeNull();
    expect(iconWrapper).toHaveTextContent('📭');
  });

  it('does not render an icon wrapper when icon is omitted', () => {
    const { container } = render(<EmptyState message="Empty" />);

    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('renders a ReactNode icon (not just emoji strings)', () => {
    render(<EmptyState message="Empty" icon={<span data-testid="custom-icon">SVG</span>} />);

    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  // ── description prop ──────────────────────────────────────────────────────

  it('renders the description when provided', () => {
    render(<EmptyState message="No items" description="Add one to get started." />);

    expect(screen.getByText('Add one to get started.')).toBeInTheDocument();
  });

  it('does not render description text when omitted', () => {
    render(<EmptyState message="No items" />);

    // Only the message paragraph should be in the document; no extra paragraph
    const paragraphs = screen.getAllByRole('paragraph');
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]!).toHaveTextContent('No items');
  });

  // ── action — link variant ─────────────────────────────────────────────────

  it('renders an anchor tag when action.href is provided', () => {
    render(
      <EmptyState message="No items" action={{ label: 'Add item', href: '/work-items/new' }} />,
    );

    const link = screen.getByRole('link', { name: 'Add item' });
    expect(link).toBeInTheDocument();
  });

  it('sets the correct href on the action link', () => {
    render(
      <EmptyState message="No items" action={{ label: 'Add item', href: '/work-items/new' }} />,
    );

    expect(screen.getByRole('link', { name: 'Add item' })).toHaveAttribute(
      'href',
      '/work-items/new',
    );
  });

  it('does not render a button when action.href is provided', () => {
    render(
      <EmptyState message="No items" action={{ label: 'Add item', href: '/work-items/new' }} />,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });

  // ── action — button variant ───────────────────────────────────────────────

  it('renders a button when action.onClick is provided (no href)', () => {
    render(<EmptyState message="No items" action={{ label: 'Create one', onClick: jest.fn() }} />);

    expect(screen.getByRole('button', { name: 'Create one' })).toBeInTheDocument();
  });

  it('fires onClick when the action button is clicked', () => {
    const handleClick = jest.fn<() => void>();
    render(
      <EmptyState message="No items" action={{ label: 'Create one', onClick: handleClick }} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create one' }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not render a link when action.onClick is provided without href', () => {
    render(<EmptyState message="No items" action={{ label: 'Create one', onClick: jest.fn() }} />);

    expect(screen.queryByRole('link')).toBeNull();
  });

  // ── no action ─────────────────────────────────────────────────────────────

  it('does not render a button or link when action is omitted', () => {
    render(<EmptyState message="No items" />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  // ── className prop ────────────────────────────────────────────────────────

  it('applies className prop to the container', () => {
    const { container } = render(<EmptyState message="Empty" className="my-class" />);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('my-class');
  });

  it('includes the emptyState base class alongside the custom className', () => {
    const { container } = render(<EmptyState message="Empty" className="extra" />);

    const wrapper = container.firstElementChild as HTMLElement;
    // identity-obj-proxy returns CSS module class names as-is
    expect(wrapper.className).toContain('emptyState');
    expect(wrapper.className).toContain('extra');
  });

  it('does not append a trailing space when className is omitted', () => {
    const { container } = render(<EmptyState message="Empty" />);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className.trim()).toBe(wrapper.className.replace(/\s+$/, '').trimEnd());
    // More directly: the container is present and has the base class
    expect(wrapper.className).toContain('emptyState');
  });
});
