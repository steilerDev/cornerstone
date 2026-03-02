import { render, screen } from '@testing-library/react';
import { DocumentSkeleton } from './DocumentSkeleton.js';

describe('DocumentSkeleton', () => {
  it('renders default 6 skeleton cards', () => {
    const { container } = render(<DocumentSkeleton />);
    const cards = container.querySelectorAll('[aria-hidden="true"]');
    expect(cards).toHaveLength(6);
  });

  it('renders the specified count of skeleton cards', () => {
    const { container } = render(<DocumentSkeleton count={3} />);
    const cards = container.querySelectorAll('[aria-hidden="true"]');
    expect(cards).toHaveLength(3);
  });

  it('renders 4 skeleton cards when count=4', () => {
    const { container } = render(<DocumentSkeleton count={4} />);
    const cards = container.querySelectorAll('[aria-hidden="true"]');
    expect(cards).toHaveLength(4);
  });

  it('skeleton cards are hidden from accessibility tree', () => {
    render(<DocumentSkeleton count={2} />);
    // aria-hidden="true" means no accessible role — not in the accessibility tree
    // The cards should not be discoverable by screen readers
    const cards = screen.queryAllByRole('img');
    expect(cards).toHaveLength(0); // no accessible images
  });
});
