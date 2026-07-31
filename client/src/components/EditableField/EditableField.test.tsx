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

describe('EditableField — className composition', () => {
  it('applies a custom className alongside the base container class', () => {
    const { container } = render(<EditableField as="input" {...baseProps()} className="myExtra" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('container');
    expect(wrapper.className).toContain('myExtra');
  });
});
