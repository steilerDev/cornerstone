import { describe, it, expect } from '@jest/globals';
import { render } from '@testing-library/react';
import { AutosaveIndicator } from './AutosaveIndicator.js';

describe('AutosaveIndicator', () => {
  it.each(['icon', 'text'] as const)('renders nothing when idle (%s)', (variant) => {
    const { container } = render(<AutosaveIndicator state="idle" variant={variant} label="x" />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['saving', '…'],
    ['success', '✓'],
    ['error', '✗'],
  ] as const)('icon variant shows the %s glyph with aria-live', (state, glyph) => {
    const { container } = render(<AutosaveIndicator state={state} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveTextContent(glyph);
    expect(el).toHaveAttribute('aria-live', 'polite');
  });

  it('text variant shows the label, aria-hidden, without aria-live', () => {
    const { container } = render(
      <AutosaveIndicator state="success" variant="text" label="Saved 14:32" />,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveTextContent('Saved 14:32');
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).not.toHaveAttribute('aria-live');
  });

  it.each(['saving', 'success', 'error'] as const)(
    'text variant renders the label for %s',
    (state) => {
      const { container } = render(<AutosaveIndicator state={state} variant="text" label="L" />);
      expect(container.firstElementChild).toHaveTextContent('L');
    },
  );

  it('text variant with an empty or missing label renders nothing', () => {
    expect(
      render(<AutosaveIndicator state="saving" variant="text" label="" />).container,
    ).toBeEmptyDOMElement();
    expect(
      render(<AutosaveIndicator state="error" variant="text" />).container,
    ).toBeEmptyDOMElement();
  });
});
