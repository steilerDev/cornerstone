/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render } from '@testing-library/react';
import { AreaColorDot } from './AreaColorDot.js';

/**
 * Mutations caught: the dot exposed to assistive technology (aria-hidden dropped), the colour not
 * reaching `--tree-color`, an empty dot styled as set, a dot carrying text.
 */
describe('AreaColorDot', () => {
  it('renders a set dot with the colour in --tree-color and the set marker', () => {
    const { container } = render(<AreaColorDot color="#336699" />);
    const dot = container.firstElementChild as HTMLElement;

    expect(dot.getAttribute('data-color')).toBe('set');
    expect(dot.style.getPropertyValue('--tree-color')).toBe('#336699');
  });

  it('renders an empty outline for a null colour: no marker and no inline style', () => {
    const { container } = render(<AreaColorDot color={null} />);
    const dot = container.firstElementChild as HTMLElement;

    expect(dot).not.toHaveAttribute('data-color');
    expect(dot.getAttribute('style')).toBeNull();
  });

  it.each([['#336699'], [null]])('is aria-hidden and empty for colour %s', (color) => {
    const { container } = render(<AreaColorDot color={color} />);
    const dot = container.firstElementChild as HTMLElement;

    expect(dot.tagName).toBe('SPAN');
    expect(dot).toHaveAttribute('aria-hidden', 'true');
    expect(dot.textContent).toBe('');
    expect(dot.className).toBe('dot');
  });

  it('renders exactly one element', () => {
    const { container } = render(<AreaColorDot color="#112233" />);

    expect(container.children).toHaveLength(1);
  });
});
