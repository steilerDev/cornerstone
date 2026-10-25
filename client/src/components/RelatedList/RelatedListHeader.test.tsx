import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { RelatedListHeader } from './RelatedListHeader.js';

describe('RelatedListHeader', () => {
  it('shows "Title (n)" in an h2 by default', () => {
    render(<RelatedListHeader title="Cost lines" count={3} headingId="h-1" />);

    const heading = screen.getByRole('heading', { level: 2, name: 'Cost lines (3)' });
    expect(heading).toHaveAttribute('id', 'h-1');
    expect(heading).toHaveAttribute('tabindex', '-1');
  });

  it('keeps the (0) for an empty list', () => {
    render(<RelatedListHeader title="Cost lines" count={0} headingId="h-1" />);

    expect(screen.getByRole('heading', { name: 'Cost lines (0)' })).toBeInTheDocument();
  });

  it('shows only the title while the count is unknown (loading or failed)', () => {
    render(<RelatedListHeader title="Cost lines" headingId="h-1" />);

    expect(screen.getByRole('heading', { name: 'Cost lines' })).toBeInTheDocument();
    expect(screen.queryByText(/\(/)).toBeNull();
  });

  it('renders an h3 for headingLevel 3', () => {
    render(<RelatedListHeader title="Payments" count={2} headingLevel={3} headingId="h-1" />);

    expect(screen.getByRole('heading', { level: 3, name: 'Payments (2)' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('hands the heading element to headingRef', () => {
    const ref = createRef<HTMLHeadingElement>();
    render(<RelatedListHeader title="Payments" count={2} headingId="h-1" headingRef={ref} />);

    expect(ref.current).toBe(screen.getByRole('heading', { name: 'Payments (2)' }));
  });

  it('renders the children in the action slot, and no slot without children', () => {
    const { container, rerender } = render(
      <RelatedListHeader title="Payments" count={2} headingId="h-1">
        <button type="button">Add payment</button>
      </RelatedListHeader>,
    );
    expect(screen.getByRole('button', { name: 'Add payment' })).toBeInTheDocument();
    expect(container.firstElementChild?.children).toHaveLength(2);

    rerender(<RelatedListHeader title="Payments" count={2} headingId="h-1" />);

    expect(screen.queryByRole('button', { name: 'Add payment' })).toBeNull();
    expect(container.firstElementChild?.children).toHaveLength(1);
  });

  it('adds the flush class only when flush is set', () => {
    const { container, rerender } = render(
      <RelatedListHeader title="Payments" count={2} headingId="h-1" />,
    );
    expect(container.firstElementChild?.className).toContain('header');
    expect(container.firstElementChild?.className).not.toContain('headerFlush');

    rerender(<RelatedListHeader title="Payments" count={2} headingId="h-1" flush />);
    expect(container.firstElementChild?.className).toContain('header');
    expect(container.firstElementChild?.className).toContain('headerFlush');
  });
});
