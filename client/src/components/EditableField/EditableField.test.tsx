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
import type { EditableFieldProps } from './EditableField.js';
import styles from './EditableField.module.css';

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

// #1941 fixture: a fully-populated maxLength prop set, override individual fields per test.
function maxLengthProps(overrides: Partial<EditableFieldProps> = {}) {
  return {
    ...baseProps(),
    maxLength: 200,
    maxLengthHint: 'Maximum 200 characters.',
    overMaxLengthHint: 'Longer than the recommended limit; shortening it is optional.',
    maxLengthReachedAnnouncement: 'Maximum length reached.',
    ...overrides,
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
  // target) and stays outside `.fieldWrapper`. This is a real regression guard for AC 5.6 (fix
  // lives in the shared component, not a per-call-site override) and for accidental future
  // structural changes, not a stand-in for the unverifiable sizing/stretching claims.
  //
  // #1941 HISTORY (kept for context — see the paired describe block below for the actual current
  // coverage of both shapes): an early #1941 draft unconditionally wrapped the reset button in a
  // new `.metaRow` div whenever `isEdited` was true, even with no `maxLength` set at all. That
  // draft's `.metaRow` carried `margin-top: var(--spacing-1)` (4px) *stacked on top of*
  // `.container`'s flex `gap: var(--spacing-2)` (8px) — flex gap and a child's own margin are
  // additive, not merged — so the ordinary case (a field edited but nowhere near its length cap)
  // got 12px where #1932 had shipped and design-approved 8px: a real, unintended 50% spacing
  // regression to chrome nobody meant to touch, uncovered here only because the metaRow wrapping
  // silently broke this test's DOM-shape assertion below. Production was fixed to gate `.metaRow`
  // on `showCounter` alone (visible only once a field is within 10% of its `maxLength`), so this
  // test's ORIGINAL assertion (predating #1941 entirely) is correct again: with no maxLength (or
  // maxLength set but far from the threshold), the reset button is still a direct child of
  // `.container`, byte-identical to pre-#1941 markup. Lesson for future review: when a new wrapper
  // element breaks an unrelated structural assertion elsewhere in the file, that is a signal to
  // ask whether the wrapper belongs there in that case, not just to update the assertion — the
  // failing test was carrying real information about a design decision someone else had already
  // made and approved.
  it('reset button retains its "resetButton" class and its position as a sibling of .fieldWrapper (not nested inside it)', () => {
    const { container } = render(<EditableField as="input" {...baseProps()} isEdited={true} />);
    const resetButton = container.querySelector('.resetButton');
    const fieldWrapper = container.querySelector('.fieldWrapper');
    const outerContainer = container.querySelector('.container');

    expect(resetButton).toBeInTheDocument();
    expect(fieldWrapper).toBeInTheDocument();
    // Both are direct children of the same outer .container (flex-column), and resetButton is
    // NOT a descendant of fieldWrapper — matching the DOM shape the CSS fix's `align-self` rule
    // (applied to .resetButton as a flex item of .container) depends on. showCounter is false here
    // (baseProps() sets no maxLength), so .metaRow never renders — see the #1941 describe block
    // below for the companion shape where showCounter is true.
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

describe('EditableField — #1941 .metaRow gating: showCounter alone controls whether the reset button is wrapped', () => {
  // Companion to the reverted test above. That test pins the showCounter=false shape (reset
  // button is a direct child of .container, no .metaRow at all — the ordinary "edited but nowhere
  // near the length cap" case, which must stay byte-identical to pre-#1941/#1932 markup to avoid
  // the additive flex-gap + margin-top spacing regression the reviewer caught). This test pins the
  // OTHER reachable shape — showCounter=true — which previously had no DOM-shape assertion at all;
  // that gap is how the over-eager (isEdited-only) gating slipped through undetected. Both shapes
  // must be pinned so a future regression in either direction (wrapping too eagerly, or not
  // wrapping when the counter is actually showing) fails a test immediately.
  it('nests the reset button inside .metaRow, alongside the counter, once showCounter is true (near-limit value via maxLengthProps())', () => {
    const { container } = render(
      <EditableField
        as="input"
        {...baseProps()}
        maxLength={200}
        maxLengthHint="Maximum 200 characters."
        value={'a'.repeat(180)} // >= Math.ceil(200 * 0.9) -> showCounter true
        isEdited={true}
      />,
    );
    const resetButton = container.querySelector('.resetButton');
    const counter = container.querySelector('.counter');
    const metaRow = container.querySelector('.metaRow');
    const outerContainer = container.querySelector('.container');

    expect(resetButton).toBeInTheDocument();
    expect(counter).toBeInTheDocument();
    expect(metaRow).toBeInTheDocument();
    // Both the counter and the reset button live inside the same .metaRow, which is itself a
    // direct child of .container — the shape the reviewer's fix intentionally introduced, gated
    // strictly on showCounter (not on isEdited alone).
    expect(resetButton?.parentElement).toBe(metaRow);
    expect(counter?.parentElement).toBe(metaRow);
    expect(metaRow?.parentElement).toBe(outerContainer);
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

  it('applies uiLang to the reset button (UI chrome — not report content) when uiLang prop is provided', () => {
    // The reset button is UI chrome: its accessible name ("Reset field to generated text") is in
    // the application UI language, not the report language. Tagging it with uiLang lets a screen
    // reader switch pronunciation correctly when the surrounding content is in a foreign lang.
    const { container } = render(
      <EditableField as="input" {...baseProps()} lang="de" uiLang="en" isEdited={true} />,
    );
    const resetButton = container.querySelector('button');
    expect(resetButton).not.toBeNull();
    expect(resetButton!.getAttribute('lang')).toBe('en');
  });

  it('applies uiLang to the sr-only edited hint span (UI chrome) when uiLang prop is provided', () => {
    // The editedSuffix (" (edited)") is UI chrome text — it must be tagged with the UI language so
    // screen readers pronounce it correctly even when the surrounding field content is in a foreign
    // report language. The hint span id is derived from the field id, so we pass an explicit id.
    const { container } = render(
      <EditableField
        as="input"
        {...baseProps()}
        lang="de"
        uiLang="en"
        isEdited={true}
        label="Sender"
        id="sender-field"
      />,
    );
    // The hint span id is `{fieldId}-edited-hint` — confirmed by the aria-describedby test above.
    const hintSpan = container.querySelector('#sender-field-edited-hint');
    expect(hintSpan).not.toBeNull();
    expect(hintSpan!.getAttribute('lang')).toBe('en');
  });

  it('does not apply uiLang to <label> — the label carries report-language content (no counter-tag needed)', () => {
    // In table context the label text comes from `content.labels.*` (report language), so the
    // label's language already matches the parent wrapper's `lang`. No `lang` override on the
    // <label> element itself is needed or desirable.
    const { container } = render(
      <EditableField
        as="input"
        {...baseProps()}
        lang="de"
        uiLang="en"
        label="Sender"
        id="sender-field"
      />,
    );
    const label = container.querySelector('label');
    expect(label).not.toBeNull();
    expect(label!.getAttribute('lang')).toBeNull();
  });
});

// ─── Issue #1941: editable override fields gain an optional length limit ────────────────────────

describe('EditableField — AC9: maxLength omitted stays unbounded (regression guard)', () => {
  // Each test pairs the "maxLength omitted" negative with a positive control using the identical
  // selector/assertion under maxLength — proving the negative isn't passing on a typo'd selector
  // or a selector that could never match (per this file's "assertions that pass on nothing" rule).

  it('renders no length counter and no .metaRow when maxLength is omitted (control: both DO render once maxLength triggers the counter)', () => {
    const { container: unbounded } = render(<EditableField as="input" {...baseProps()} />);
    expect(unbounded.querySelector(`.${styles.counter}`)).not.toBeInTheDocument();
    expect(unbounded.querySelector(`.${styles.counterOverLimit}`)).not.toBeInTheDocument();
    expect(unbounded.querySelector(`.${styles.metaRow}`)).not.toBeInTheDocument();

    const { container: bounded } = render(
      <EditableField as="input" {...maxLengthProps()} value={'a'.repeat(180)} />,
    );
    expect(bounded.querySelector(`.${styles.counter}`)).toBeInTheDocument();
    expect(bounded.querySelector(`.${styles.metaRow}`)).toBeInTheDocument();
  });

  it('renders no native maxLength attribute on either variant when omitted (control: the attribute IS present once maxLength is supplied)', () => {
    const { container: unboundedInput } = render(<EditableField as="input" {...baseProps()} />);
    expect(unboundedInput.querySelector('input')!).not.toHaveAttribute('maxlength');

    const { container: unboundedTextarea } = render(
      <EditableField as="textarea" {...baseProps()} />,
    );
    expect(unboundedTextarea.querySelector('textarea')!).not.toHaveAttribute('maxlength');

    const { container: bounded } = render(
      <EditableField as="input" {...baseProps()} maxLength={10} />,
    );
    expect(bounded.querySelector('input')!).toHaveAttribute('maxlength', '10');
  });

  it('renders no limitHintId/limitLiveId sr-only spans when omitted (control: both DO render, with hint text, once maxLength is supplied)', () => {
    const { container: unbounded } = render(
      <EditableField as="input" {...baseProps()} label="Sender" id="sender-field" />,
    );
    expect(unbounded.querySelector('#sender-field-limit-hint')).not.toBeInTheDocument();
    expect(unbounded.querySelector('#sender-field-limit-live')).not.toBeInTheDocument();

    const { container: bounded } = render(
      <EditableField as="input" {...maxLengthProps()} label="Sender" id="sender-field-2" />,
    );
    const hintSpan = bounded.querySelector('#sender-field-2-limit-hint');
    expect(hintSpan).toBeInTheDocument();
    expect(hintSpan).toHaveTextContent('Maximum 200 characters.');
    expect(bounded.querySelector('#sender-field-2-limit-live')).toBeInTheDocument();
  });

  it('resolves aria-describedby exactly as before this issue (undefined in dense mode with no maxLength — control: it IS set once maxLength is supplied)', () => {
    const { container: unbounded } = render(<EditableField as="input" {...baseProps()} />);
    expect(unbounded.querySelector('input')!).not.toHaveAttribute('aria-describedby');

    const { container: bounded } = render(<EditableField as="input" {...maxLengthProps()} />);
    expect(bounded.querySelector('input')!).toHaveAttribute('aria-describedby');
  });
});

describe('EditableField — AC1: native maxLength enforcement', () => {
  it('sets the native maxLength attribute to 10 on the input variant', () => {
    const { container } = render(<EditableField as="input" {...baseProps()} maxLength={10} />);
    expect(container.querySelector('input')!).toHaveAttribute('maxlength', '10');
  });

  it('sets the native maxLength attribute to 10 on the textarea variant', () => {
    const { container } = render(<EditableField as="textarea" {...baseProps()} maxLength={10} />);
    expect(container.querySelector('textarea')!).toHaveAttribute('maxlength', '10');
  });

  // EMPIRICAL FINDING (verified against this exact component before writing this assertion, per
  // this file's existing jsdom-honesty precedent in the #1932 describe block below): jsdom does
  // NOT clamp a controlled <input>/<textarea>'s rendered value against the `maxlength` attribute,
  // and `fireEvent.change` — which sets `target.value` directly rather than simulating real
  // keystrokes — does not go through the browser's native maxlength-on-typing enforcement either
  // (this is true in real browsers too, not just jsdom: userEvent.type would respect it,
  // fireEvent.change never does). So `onChange` still receives the FULL over-limit string here.
  // Enforcement for real users therefore comes from the browser's native keystroke-level maxlength
  // behavior in production, which this test layer cannot observe — this test instead pins the
  // attribute's presence (verified above) and documents precisely what this layer can and cannot
  // prove, rather than asserting truncation that would never actually happen at this call site.
  it('fireEvent.change on a maxLength-constrained field still receives the full over-limit string in onChange (jsdom/testing-library do not simulate keystroke-level clamping)', () => {
    const onChange = jest.fn();
    render(<EditableField as="input" {...baseProps()} maxLength={10} onChange={onChange} />);
    const input = screen.getByDisplayValue('Hello');
    const overLong = 'this value is way over ten characters';
    fireEvent.change(input, { target: { value: overLong } });
    expect(onChange).toHaveBeenCalledWith(overLong);
  });
});

describe('EditableField — AC3: counter appears at the 90% threshold', () => {
  it('renders no counter one character under the 90% threshold (179/200)', () => {
    const { container } = render(
      <EditableField as="input" {...maxLengthProps()} value={'a'.repeat(179)} />,
    );
    expect(container.querySelector(`.${styles.counter}`)).not.toBeInTheDocument();
    expect(container.querySelector(`.${styles.counterOverLimit}`)).not.toBeInTheDocument();
  });

  it('renders the counter reading "180/200" with aria-hidden="true" once the 90% threshold is reached (180/200)', () => {
    const { container } = render(
      <EditableField as="input" {...maxLengthProps()} value={'a'.repeat(180)} />,
    );
    const counter = container.querySelector(`.${styles.counter}`);
    expect(counter).toBeInTheDocument();
    expect(counter).toHaveTextContent('180/200');
    expect(counter).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('EditableField — AC3: counter class reflects over/at-limit state (class names only — jsdom has no CSS engine, see #1932 block below for the same honesty precedent)', () => {
  it('applies .counter (not .counterOverLimit) when at the limit but not over it', () => {
    const { container } = render(
      <EditableField as="input" {...maxLengthProps()} value={'a'.repeat(200)} />,
    );
    expect(container.querySelector(`.${styles.counter}`)).toBeInTheDocument();
    expect(container.querySelector(`.${styles.counterOverLimit}`)).not.toBeInTheDocument();
  });

  it('applies .counterOverLimit (not .counter) once value.length exceeds maxLength', () => {
    const { container } = render(
      <EditableField as="input" {...maxLengthProps()} value={'a'.repeat(201)} />,
    );
    expect(container.querySelector(`.${styles.counterOverLimit}`)).toBeInTheDocument();
    expect(container.querySelector(`.${styles.counter}`)).not.toBeInTheDocument();
  });
});

describe('EditableField — AC4: over-limit baseline on load (a derived/baseline value already over the limit, not a "saved override" — an override cannot survive a reload)', () => {
  const overLimitValue = 'a'.repeat(250); // maxLength(200) + 50

  it('renders the full untruncated value, applies .counterOverLimit, sets no aria-invalid anywhere, and shows overMaxLengthHint in the limitHintId span when provided', () => {
    const { container } = render(
      <EditableField as="input" {...maxLengthProps()} value={overLimitValue} isEdited={false} />,
    );
    const input = container.querySelector('input')!;
    expect(input.value).toBe(overLimitValue);
    expect(input.value).toHaveLength(250);

    const counter = container.querySelector(`.${styles.counterOverLimit}`);
    expect(counter).toBeInTheDocument();
    expect(counter).toHaveTextContent('250/200');

    // No aria-invalid anywhere in the rendered tree — over-limit is communicated visually and via
    // sr-only text, never flagged as a form-validation error.
    expect(container.querySelector('[aria-invalid]')).not.toBeInTheDocument();

    const hintSpan = container.querySelector(`#${input.id}-limit-hint`);
    expect(hintSpan).toBeInTheDocument();
    expect(hintSpan).toHaveTextContent(
      'Longer than the recommended limit; shortening it is optional.',
    );
  });

  it('falls back to maxLengthHint in the limitHintId span when overMaxLengthHint is omitted while over limit', () => {
    const { container } = render(
      <EditableField
        as="input"
        {...maxLengthProps({ overMaxLengthHint: undefined })}
        value={overLimitValue}
        isEdited={false}
      />,
    );
    const input = container.querySelector('input')!;
    const hintSpan = container.querySelector(`#${input.id}-limit-hint`);
    expect(hintSpan).toBeInTheDocument();
    expect(hintSpan).toHaveTextContent('Maximum 200 characters.');
  });
});

describe('EditableField — AC8a: static limitHintId hint is described in both label modes', () => {
  it('includes limitHintId in aria-describedby in labelled mode', () => {
    const { container } = render(
      <EditableField as="input" {...maxLengthProps()} label="Sender" id="sender-field" />,
    );
    const input = container.querySelector('input')!;
    expect(input.getAttribute('aria-describedby')).toContain('sender-field-limit-hint');
  });

  it('includes limitHintId in aria-describedby in dense/unlabelled mode — direct regression test: the pre-#1941 ternary (`isEdited && label ? editedHintId : undefined`) produced undefined here regardless of maxLength', () => {
    const { container } = render(
      <EditableField as="input" {...maxLengthProps()} id="usage-field" />,
    );
    const input = container.querySelector('input')!;
    expect(input.getAttribute('aria-describedby')).toContain('usage-field-limit-hint');
  });
});

describe('EditableField — AC8b: one-shot live announcement arms and re-arms exactly at the limit', () => {
  it('is empty at 4/5, announces the reached-limit text at exactly 5/5, and clears again once the value drops back below the limit', () => {
    const props = maxLengthProps({ maxLength: 5, value: 'hell' });
    const { container, rerender } = render(<EditableField as="input" {...props} />);
    const input = container.querySelector('input')!;
    const liveSpan = container.querySelector(`#${input.id}-limit-live`)!;
    expect(liveSpan).toHaveTextContent('');

    rerender(<EditableField as="input" {...props} value="hello" />);
    expect(liveSpan).toHaveTextContent('Maximum length reached.');

    rerender(<EditableField as="input" {...props} value="hell" />);
    expect(liveSpan).toHaveTextContent('');
  });
});

describe('EditableField — AC8b: no announcement fires on an initial over-limit mount (a standing over-limit state on load is not a live event)', () => {
  it('renders the limitLiveId span empty on first render when the initial value is already over the limit (control: the identical span DOES carry the announcement when mounted exactly at the limit)', () => {
    const { container: overLimit } = render(
      <EditableField as="input" {...maxLengthProps({ maxLength: 5, value: 'hello world' })} />,
    );
    const overInput = overLimit.querySelector('input')!;
    const overLiveSpan = overLimit.querySelector(`#${overInput.id}-limit-live`)!;
    expect(overLiveSpan).toHaveTextContent('');

    const { container: atLimit } = render(
      <EditableField as="input" {...maxLengthProps({ maxLength: 5, value: 'hello' })} />,
    );
    const atInput = atLimit.querySelector('input')!;
    const atLiveSpan = atLimit.querySelector(`#${atInput.id}-limit-live`)!;
    expect(atLiveSpan).toHaveTextContent('Maximum length reached.');
  });
});

describe('EditableField — PO ruling regression: dense mode never renders editedHintId, even when maxLength is also set', () => {
  it('renders no edited-hint span and excludes editedHintId from aria-describedby in dense mode when isEdited and maxLength are both set (control: labelled mode DOES render it under the identical isEdited=true condition)', () => {
    const { container: dense } = render(
      <EditableField as="input" {...maxLengthProps()} isEdited={true} id="dense-field" />,
    );
    const denseInput = dense.querySelector('input')!;
    expect(dense.querySelector('#dense-field-edited-hint')).not.toBeInTheDocument();
    const describedBy = denseInput.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(describedBy).not.toContain('edited-hint');
    // Positive: the limit ids ARE present, so the negative above isn't looking at an empty attribute.
    expect(describedBy).toContain('dense-field-limit-hint');
    expect(describedBy).toContain('dense-field-limit-live');

    const { container: labelled } = render(
      <EditableField
        as="input"
        {...maxLengthProps()}
        label="Sender"
        id="labelled-field"
        isEdited={true}
      />,
    );
    expect(labelled.querySelector('#labelled-field-edited-hint')).toBeInTheDocument();
  });
});

describe('EditableField — ariaDescribedBy composition: explicit id-count coverage (0/1/2/3 ids)', () => {
  // 0 ids is covered by the pre-existing "does not set aria-describedby when not edited" test
  // (labelled mode) and by the AC9 describe block above (dense mode, no maxLength).
  // 1 id (editedHintId only) is covered by the pre-existing "when edited, adds a visually-hidden
  // aria-describedby hint..." test above (labelled + edited, no maxLength).

  it('composes exactly 2 ids (limitHintId + limitLiveId) when maxLength is set but the field is not edited', () => {
    const { container } = render(
      <EditableField
        as="input"
        {...maxLengthProps()}
        label="Sender"
        id="sender-field"
        isEdited={false}
      />,
    );
    const input = container.querySelector('input')!;
    expect(input.getAttribute('aria-describedby')).toBe(
      'sender-field-limit-hint sender-field-limit-live',
    );
  });

  it('composes exactly 3 ids (editedHintId + limitHintId + limitLiveId) in labelled mode when both edited and maxLength are set', () => {
    const { container } = render(
      <EditableField
        as="input"
        {...maxLengthProps()}
        label="Sender"
        id="sender-field"
        isEdited={true}
      />,
    );
    const input = container.querySelector('input')!;
    expect(input.getAttribute('aria-describedby')).toBe(
      'sender-field-edited-hint sender-field-limit-hint sender-field-limit-live',
    );
  });
});
