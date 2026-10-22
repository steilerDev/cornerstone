/**
 * @jest-environment jsdom
 */
import { createRef } from 'react';
import { describe, it, expect, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { FeedGroup } from './FeedGroup.js';

describe('FeedGroup headingLevel / headingRef / list / busy / collapse', () => {
  it('renders an h3 with headingLevel 3', () => {
    render(
      <FeedGroup heading="Today" headingLevel={3} testId="g">
        <li>Row</li>
      </FeedGroup>,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Today' })).toBeInTheDocument();
  });

  it('makes the heading programmatically focusable when headingRef is given', () => {
    const ref = createRef<HTMLHeadingElement>();
    render(
      <FeedGroup heading="Needs attention" headingRef={ref} testId="g">
        <li>Row</li>
      </FeedGroup>,
    );
    const h = screen.getByRole('heading', { level: 2 });
    expect(ref.current).toBe(h);
    expect(h).toHaveAttribute('tabindex', '-1');
  });

  it('has no tabindex on the heading without headingRef', () => {
    render(
      <FeedGroup heading="Today" testId="g">
        <li>Row</li>
      </FeedGroup>,
    );
    expect(screen.getByRole('heading', { level: 2 })).not.toHaveAttribute('tabindex');
  });

  it('puts children in a plain div with list={false}', () => {
    render(
      <FeedGroup heading="Pulse" list={false} testId="g">
        <p data-testid="free">content</p>
      </FeedGroup>,
    );
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByTestId('free').parentElement?.tagName).toBe('DIV');
  });

  it('sets aria-busy only while busy', () => {
    const { rerender } = render(
      <FeedGroup heading="Pulse" busy testId="g">
        <li>x</li>
      </FeedGroup>,
    );
    expect(screen.getByTestId('g')).toHaveAttribute('aria-busy', 'true');
    rerender(
      <FeedGroup heading="Pulse" busy={false} testId="g">
        <li>x</li>
      </FeedGroup>,
    );
    expect(screen.getByTestId('g')).not.toHaveAttribute('aria-busy');
  });

  it.each([true, false])(
    'collapse open=%s toggles the hidden body via the heading button',
    (open) => {
      const onToggle = jest.fn();
      const { container } = render(
        <FeedGroup
          heading="Tidy up"
          headingDetail="(2)"
          collapse={{ open, onToggle }}
          list={false}
          testId="g"
        >
          <p>body</p>
        </FeedGroup>,
      );
      const button = screen.getByRole('button', { name: /Tidy up/ });
      expect(screen.getByRole('heading', { level: 2 })).toContainElement(button);
      expect(button).toHaveAttribute('aria-expanded', String(open));
      const body = container.querySelector(`[id="${button.getAttribute('aria-controls')}"]`);
      expect(body).not.toBeNull();
      expect((body as HTMLElement).hidden).toBe(!open);
      fireEvent.click(button);
      expect(onToggle).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps the caret out of the accessible name and hides the list body when collapsed', () => {
    render(
      <FeedGroup heading="Tidy up" collapse={{ open: false, onToggle: () => {} }} testId="g">
        <li>Row</li>
      </FeedGroup>,
    );
    expect(screen.getByTestId('g-toggle').querySelector('[aria-hidden="true"]')).toHaveTextContent(
      '▸',
    );
    expect(screen.getByTestId('g').querySelector('ul')).toHaveAttribute('hidden');
  });

  it('does not set id or hidden on the body without collapse', () => {
    render(
      <FeedGroup heading="Today" testId="g">
        <li>Row</li>
      </FeedGroup>,
    );
    const ul = screen.getByRole('list');
    expect(ul).not.toHaveAttribute('id');
    expect(ul).not.toHaveAttribute('hidden');
  });
});
