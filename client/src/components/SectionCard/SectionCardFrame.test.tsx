/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen, within } from '@testing-library/react';
import { SectionCardFrame } from './SectionCardFrame.js';

/**
 * Mutations caught: the heading id not `${id}-title` (aria-labelledby breaks), the default test id
 * not `section-${id}`, a custom testId ignored, the header action rendered outside the header,
 * the editing class missing or always on, aria-busy always present or on when not loading.
 */
describe('SectionCardFrame', () => {
  it('renders a section labelled by its h2 with id "<id>-title"', () => {
    render(
      <SectionCardFrame id="area-now" title="Now & next here">
        <p>Body</p>
      </SectionCardFrame>,
    );

    const section = screen.getByRole('region', { name: 'Now & next here' });
    const heading = within(section).getByRole('heading', { level: 2, name: 'Now & next here' });

    expect(heading).toHaveAttribute('id', 'area-now-title');
    expect(section).toHaveAttribute('aria-labelledby', 'area-now-title');
    expect(within(section).getByText('Body')).toBeInTheDocument();
  });

  it('uses section-<id> as the test id by default', () => {
    render(
      <SectionCardFrame id="area-cost" title="Cost">
        x
      </SectionCardFrame>,
    );

    expect(screen.getByTestId('section-area-cost')).toBe(screen.getByRole('region'));
  });

  it('uses a custom test id instead of the default', () => {
    render(
      <SectionCardFrame id="area-cost" title="Cost" testId="my-card">
        x
      </SectionCardFrame>,
    );

    expect(screen.getByTestId('my-card')).toBeInTheDocument();
    expect(screen.queryByTestId('section-area-cost')).toBeNull();
  });

  it('puts the header action in the header next to the h2, not in the body', () => {
    render(
      <SectionCardFrame id="c" title="Card" headerAction={<button type="button">Edit card</button>}>
        <p>Body</p>
      </SectionCardFrame>,
    );

    const heading = screen.getByRole('heading', { level: 2 });
    const action = screen.getByRole('button', { name: 'Edit card' });

    expect(heading.parentElement).toBe(action.parentElement);
    expect(heading.parentElement).not.toContainElement(screen.getByText('Body'));
  });

  it('renders no header action when none is given', () => {
    render(
      <SectionCardFrame id="c" title="Card">
        x
      </SectionCardFrame>,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('heading', { level: 2 }).parentElement?.children).toHaveLength(1);
  });

  it('adds the editing class only when editing', () => {
    const { rerender } = render(
      <SectionCardFrame id="c" title="Card">
        x
      </SectionCardFrame>,
    );
    expect(screen.getByRole('region').className).toBe('card');

    rerender(
      <SectionCardFrame id="c" title="Card" editing>
        x
      </SectionCardFrame>,
    );
    expect(screen.getByRole('region').className).toBe('card cardEditing');
  });

  it('sets aria-busy only while loading', () => {
    const { rerender } = render(
      <SectionCardFrame id="c" title="Card">
        x
      </SectionCardFrame>,
    );
    expect(screen.getByRole('region')).not.toHaveAttribute('aria-busy');

    rerender(
      <SectionCardFrame id="c" title="Card" loading>
        x
      </SectionCardFrame>,
    );
    expect(screen.getByRole('region')).toHaveAttribute('aria-busy', 'true');
  });
});
