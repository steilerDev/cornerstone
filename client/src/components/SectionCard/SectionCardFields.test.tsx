/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { DetailRow, FieldShell } from './SectionCardFields.js';

describe('FieldShell', () => {
  it('labels the control and passes no aria attributes without an error', () => {
    render(
      <FieldShell id="f-1" label="Title">
        {(aria) => (
          <input
            id="f-1"
            aria-invalid={aria.invalid}
            aria-describedby={aria.describedBy}
            data-testid="control"
          />
        )}
      </FieldShell>,
    );
    expect(screen.getByLabelText('Title')).toBe(screen.getByTestId('control'));
    expect(screen.getByTestId('control')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByTestId('control')).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('marks a required field with the translated "required" word', () => {
    render(
      <FieldShell id="f-1" label="Title" required>
        {() => <input id="f-1" />}
      </FieldShell>,
    );
    expect(screen.getByText('Title').textContent).toMatch(/\S/);
    expect(document.querySelector('label span')).not.toBeNull();
  });

  it('does not mark an optional field', () => {
    render(
      <FieldShell id="f-1" label="Title">
        {() => <input id="f-1" />}
      </FieldShell>,
    );
    expect(document.querySelector('label span')).toBeNull();
  });

  it('links the control to the field error and flags it invalid', () => {
    render(
      <FieldShell id="f-1" label="Title" error="Title is required.">
        {(aria) => (
          <input
            id="f-1"
            aria-invalid={aria.invalid}
            aria-describedby={aria.describedBy}
            data-testid="control"
          />
        )}
      </FieldShell>,
    );
    const control = screen.getByTestId('control');
    expect(control).toHaveAttribute('aria-invalid', 'true');
    expect(control).toHaveAttribute('aria-describedby', 'f-1-error');
    expect(document.getElementById('f-1-error')).toHaveTextContent('Title is required.');
    expect(control).toHaveAccessibleDescription('Title is required.');
  });
});

describe('DetailRow', () => {
  it('shows a label and its value under the test id', () => {
    render(
      <dl>
        <DetailRow label="Who" testId="row-who">
          Acme Roofing
        </DetailRow>
      </dl>,
    );
    expect(screen.getByText('Who').tagName).toBe('DT');
    expect(screen.getByTestId('row-who')).toHaveTextContent('Acme Roofing');
    expect(screen.getByTestId('row-who').tagName).toBe('DD');
  });

  it('shows an en dash and a screen-reader "Not set" when there is no value', () => {
    render(
      <dl>
        <DetailRow label="Who" testId="row-who">
          {null}
        </DetailRow>
      </dl>,
    );
    expect(screen.getByTestId('row-who')).toHaveTextContent('–');
    expect(screen.getByTestId('row-who')).toHaveTextContent('Not set');
    expect(screen.getByText('–')).toHaveAttribute('aria-hidden', 'true');
  });
});
