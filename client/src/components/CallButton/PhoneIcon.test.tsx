/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render } from '@testing-library/react';
import { PhoneIcon } from './PhoneIcon.js';

describe('PhoneIcon', () => {
  it('is a decorative 14px glyph that cannot take focus', () => {
    const { container } = render(<PhoneIcon />);
    const svg = container.querySelector('svg')!;

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg).toHaveAttribute('width', '14');
    expect(svg).toHaveAttribute('height', '14');
    expect(svg.querySelectorAll('path')).toHaveLength(1);
  });

  it('takes its colour from the text (currentColor)', () => {
    const { container } = render(<PhoneIcon />);
    expect(container.querySelector('svg')).toHaveAttribute('stroke', 'currentColor');
  });

  it('applies the className only when given', () => {
    const { container, rerender } = render(<PhoneIcon />);
    expect(container.querySelector('svg')).not.toHaveAttribute('class');

    rerender(<PhoneIcon className="host" />);
    expect(container.querySelector('svg')).toHaveClass('host');
  });
});
