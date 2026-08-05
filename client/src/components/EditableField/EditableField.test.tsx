/**
 * Unit tests for client/src/components/EditableField/EditableField.tsx
 *
 * Story #1900. EditableField is an always-visible live input (NOT click-to-edit) supporting two
 * label modes:
 *   - labelled mode (letter fields + mobile cards): `label` prop present -> renders a real
 *     <label htmlFor>, no aria-label; the "edited" state is announced via a visually-hidden
 *     aria-describedby span instead.
 *   - unlabelled/dense mode (desktop table cells): `label` absent -> `ariaLabel` is used
 *     directly, composed with `editedSuffix` when edited.
 * The edited-dot is a purely visual (aria-hidden) indicator; the reset button only renders when
 * isEdited is true.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, jest } from '@jest/globals';
import { EditableField } from './EditableField.js';

function baseProps() {
  return {
    ariaLabel: 'Usage text for ACME, INV-001',
    editedSuffix: ' (edited)',
    resetAriaLabel: 'Reset field to generated text',
    value: 'Hello',
    onChange: jest.fn(),
    isEdited: false,
    onReset: jest.fn(),
  };
}

describe('EditableField — as="input"', () => {
  it('renders a text input with the given value', () => {
    render(<EditableField as="input" {...baseProps()} />);
    const input = screen.getByDisplayValue('Hello') as HTMLInputElement;
    expect(input.tagName).toBe('INPUT');
    expect(input.type).toBe('text');
  });

  it('calls onChange with the new value when typed into', () => {
    const onChange = jest.fn();
    render(<EditableField as="input" {...baseProps()} onChange={onChange} />);
    const input = screen.getByDisplayValue('Hello');
    fireEvent.change(input, { target: { value: 'Hello World' } });
    expect(onChange).toHaveBeenCalledWith('Hello World');
  });
});

describe('EditableField — as="textarea"', () => {
  it('renders a textarea with the given value and rows prop', () => {
    render(<EditableField as="textarea" {...baseProps()} rows={4} />);
    const textarea = screen.getByDisplayValue('Hello') as HTMLTextAreaElement;
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea.rows).toBe(4);
  });

  it('defaults rows to 6 when not provided', () => {
    render(<EditableField as="textarea" {...baseProps()} />);
    const textarea = screen.getByDisplayValue('Hello') as HTMLTextAreaElement;
    expect(textarea.rows).toBe(6);
  });

  it('calls onChange with the new value when typed into', () => {
    const onChange = jest.fn();
    render(<EditableField as="textarea" {...baseProps()} onChange={onChange} />);
    const textarea = screen.getByDisplayValue('Hello');
    fireEvent.change(textarea, { target: { value: 'New body text' } });
    expect(onChange).toHaveBeenCalledWith('New body text');
  });
});

describe('EditableField — labelled mode (letter fields / mobile cards)', () => {
  it('renders a real <label htmlFor> pointing at the field id when label is provided', () => {
    render(<EditableField as="input" {...baseProps()} label="Sender" id="sender-field" />);
    const input = screen.getByLabelText('Sender');
    expect(input.id).toBe('sender-field');
  });

  it('does NOT set aria-label on the field when label is provided', () => {
    render(<EditableField as="input" {...baseProps()} label="Sender" id="sender-field" />);
    const input = screen.getByLabelText('Sender');
    expect(input).not.toHaveAttribute('aria-label');
  });

  it('generates a stable id via useId when no id prop is provided', () => {
    render(<EditableField as="input" {...baseProps()} label="Sender" />);
    const input = screen.getByLabelText('Sender');
    expect(input.id).toBeTruthy();
  });

  it('when edited, adds a visually-hidden aria-describedby hint instead of mutating the visible label', () => {
    render(
      <EditableField
        as="input"
        {...baseProps()}
        label="Sender"
        id="sender-field"
        isEdited={true}
      />,
    );
    const input = screen.getByLabelText('Sender');
    expect(input).toHaveAttribute('aria-describedby', 'sender-field-edited-hint');
    // testing-library's getByText normalizer trims surrounding whitespace, so the leading space
    // in editedSuffix (' (edited)') is stripped from the match target.
    expect(screen.getByText('(edited)')).toBeInTheDocument();
  });

  it('does not set aria-describedby when not edited', () => {
    render(<EditableField as="input" {...baseProps()} label="Sender" id="sender-field" />);
    const input = screen.getByLabelText('Sender');
    expect(input).not.toHaveAttribute('aria-describedby');
  });
});

describe('EditableField — unlabelled/dense mode (desktop table cells)', () => {
  it('uses ariaLabel directly as the accessible name when not edited', () => {
    render(<EditableField as="input" {...baseProps()} ariaLabel="Usage text for ACME, INV-001" />);
    expect(screen.getByLabelText('Usage text for ACME, INV-001')).toBeInTheDocument();
  });

  it('composes ariaLabel with editedSuffix when edited', () => {
    render(
      <EditableField
        as="input"
        {...baseProps()}
        ariaLabel="Usage text for ACME, INV-001"
        isEdited={true}
      />,
    );
    expect(screen.getByLabelText('Usage text for ACME, INV-001 (edited)')).toBeInTheDocument();
  });

  it('renders no <label> element when label is not provided', () => {
    const { container } = render(<EditableField as="input" {...baseProps()} />);
    expect(container.querySelector('label')).not.toBeInTheDocument();
  });
});

describe('EditableField — edited indicator and reset', () => {
  it('renders no reset button when isEdited is false', () => {
    render(<EditableField as="input" {...baseProps()} isEdited={false} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a reset button with resetAriaLabel when isEdited is true', () => {
    render(<EditableField as="input" {...baseProps()} isEdited={true} />);
    expect(
      screen.getByRole('button', { name: 'Reset field to generated text' }),
    ).toBeInTheDocument();
  });

  it('calls onReset when the reset button is clicked', () => {
    const onReset = jest.fn();
    render(<EditableField as="input" {...baseProps()} isEdited={true} onReset={onReset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset field to generated text' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('renders the edited-dot indicator element (aria-hidden) only when isEdited is true', () => {
    const { container, rerender } = render(
      <EditableField as="input" {...baseProps()} isEdited={false} />,
    );
    expect(container.querySelector('.editedDot')).not.toBeInTheDocument();

    rerender(<EditableField as="input" {...baseProps()} isEdited={true} />);
    const dot = container.querySelector('.editedDot');
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('EditableField — reset-button glyph/hit-area fix (#1932 AC 5.1-5.4)', () => {
  // The #1932 fix is CSS-only (EditableField.module.css: `align-self: flex-start` on
  // `.resetButton`, the svg sized `var(--font-size-lg)` instead of `100%`, and a new
  // `:focus-visible` box-shadow ring) — EditableField.tsx's render tree/structure is unchanged.
  // jsdom has no CSS/layout engine (no cascade, no computed box sizes), so the actual visual
  // claims this fix makes — "the button no longer stretches to the container's full width" (AC
  // 5.3) and "the glyph is proportionate to the surrounding text, not a giant 44px X" (AC 5.1) —
  // are NOT verifiable at this test layer. Confirming them requires a real render/visual
  // technique (e.g. E2E screenshot comparison), not a jsdom unit test; asserting computed
  // dimensions here would just always report jsdom's zero-layout defaults and prove nothing (the
  // #1929 postmortem flagged exactly this anti-pattern: two guards that looked like they verified
  // something but matched unrelated text and proved nothing).
  //
  // What CAN be honestly asserted here, reusing this file's existing `.editedDot`-via-
  // identity-obj-proxy class-presence technique (see the 'edited indicator and reset' describe
  // block above): the reset button keeps its `resetButton` class (the class the fix's CSS rules
  // target) and its structural position — a sibling of `.fieldWrapper`, not nested inside it —
  // is unchanged. This is a real regression guard for AC 5.6 (fix lives in the shared component,
  // not a per-call-site override) and for accidental future structural changes, not a stand-in
  // for the unverifiable sizing/stretching claims.
  it('reset button retains its "resetButton" class and its position as a sibling of .fieldWrapper (not nested inside it)', () => {
    const { container } = render(<EditableField as="input" {...baseProps()} isEdited={true} />);
    const resetButton = container.querySelector('.resetButton');
    const fieldWrapper = container.querySelector('.fieldWrapper');
    const outerContainer = container.querySelector('.container');

    expect(resetButton).toBeInTheDocument();
    expect(fieldWrapper).toBeInTheDocument();
    // Both are direct children of the same outer .container (flex-column), and resetButton is
    // NOT a descendant of fieldWrapper — matching the DOM shape the CSS fix's `align-self` rule
    // (applied to .resetButton as a flex item of .container) depends on.
    expect(resetButton?.parentElement).toBe(outerContainer);
    expect(fieldWrapper?.contains(resetButton)).toBe(false);
  });

  it('the reset button svg has no inline width/height style overriding the CSS-module rule (sizing is CSS-only, not inline)', () => {
    const { container } = render(<EditableField as="input" {...baseProps()} isEdited={true} />);
    const svg = container.querySelector('.resetButton svg');
    expect(svg).toBeInTheDocument();
    // No inline style attribute at all — sizing is driven entirely by EditableField.module.css's
    // `.resetButton svg { width/height: var(--font-size-lg) }` rule, which jsdom does not apply
    // (no CSS engine), hence the assertion is scoped to "no inline override exists" rather than
    // "the rendered size is small".
    expect(svg).not.toHaveAttribute('style');
  });
});

describe('EditableField — className composition', () => {
  it('applies a custom className alongside the base container class', () => {
    const { container } = render(<EditableField as="input" {...baseProps()} className="myExtra" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('container');
    expect(wrapper.className).toContain('myExtra');
  });
});

describe('EditableField — lang prop (Story #1910)', () => {
  it('sets the lang attribute on <input> when the lang prop is passed', () => {
    const { container } = render(<EditableField as="input" {...baseProps()} lang="de" />);
    expect(container.querySelector('input')!.getAttribute('lang')).toBe('de');
  });

  it('sets the lang attribute on <textarea> when the lang prop is passed', () => {
    const { container } = render(<EditableField as="textarea" {...baseProps()} lang="de" />);
    expect(container.querySelector('textarea')!.getAttribute('lang')).toBe('de');
  });

  it('does not set a lang attribute on the input when the lang prop is absent', () => {
    const { container } = render(<EditableField as="input" {...baseProps()} />);
    expect(container.querySelector('input')!.getAttribute('lang')).toBeNull();
  });
});
