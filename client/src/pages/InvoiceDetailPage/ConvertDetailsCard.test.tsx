/**
 * @jest-environment jsdom
 *
 * ConvertDetailsCard (#2240): the final invoice's fields, the difference to the offer, the
 * AI suggestions and the status choice. The hook state is a plain object here.
 *
 * Mutations these tests catch:
 *  - an input wired to the wrong field, or a blur that does not mark the field touched;
 *  - an error shown without `aria-invalid` / `aria-describedby` (or shown while hidden);
 *  - a suggestion Apply applying a different field;
 *  - the status radios offering anything but To pay / Paid, or not reflecting `form.status`;
 *  - the difference badge reading the wrong direction.
 */
import { describe, it, expect } from '@jest/globals';
import { createRef } from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import { ConvertDetailsCard } from './ConvertDetailsCard.js';
import { makeConvert } from '../../test/convertFixtures.js';
import type { UseConvertOffer } from './useConvertOffer.js';

function renderCard(over: Partial<UseConvertOffer> = {}) {
  const convert = makeConvert(over);
  const refs = {
    amountRef: createRef<HTMLInputElement>(),
    dateRef: createRef<HTMLInputElement>(),
    dueDateRef: createRef<HTMLInputElement>(),
  };
  const view = render(
    <LocaleProvider>
      <ConvertDetailsCard convert={convert} {...refs} />
    </LocaleProvider>,
  );
  return { convert, refs, ...view };
}

describe('fields', () => {
  it('shows the form values under their labels, with Final amount and Invoice date required', () => {
    renderCard();
    expect(screen.getByRole('heading', { name: 'Final invoice details' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Final amount/)).toHaveValue(10000);
    expect(screen.getByLabelText(/Invoice date/)).toHaveValue('2026-03-10');
    expect(screen.getByLabelText('Invoice number')).toHaveValue('Q-1');
    expect(screen.getByLabelText('Due date')).toHaveValue('2026-04-01');
    expect(screen.getByLabelText('Notes')).toHaveValue('Saved notes');
    expect(screen.getByLabelText(/Final amount/)).toBeRequired();
    expect(screen.getByLabelText(/Invoice date/)).toBeRequired();
    expect(screen.getByLabelText('Invoice number')).not.toBeRequired();
    expect(screen.getByText('A note with the offer amount is added automatically.')).toBeVisible();
  });

  it('attaches the refs of the amount, date and due date inputs', () => {
    const { refs } = renderCard();
    expect(refs.amountRef.current).toBe(screen.getByTestId('convert-final-amount'));
    expect(refs.dateRef.current).toBe(screen.getByTestId('convert-date'));
    expect(refs.dueDateRef.current).toBe(screen.getByTestId('convert-due-date'));
  });

  it.each([
    ['convert-final-amount', 'amount', '9000'],
    ['convert-date', 'date', '2026-01-01'],
    ['convert-invoice-number', 'invoiceNumber', 'R-9'],
    ['convert-due-date', 'dueDate', '2026-05-05'],
    ['convert-notes', 'notes', 'hello'],
  ] as const)('typing into %s sets the %s field', (testId, field, value) => {
    const { convert } = renderCard();
    fireEvent.change(screen.getByTestId(testId), { target: { value } });
    expect(convert.setField).toHaveBeenCalledWith(field, value);
  });

  it('leaving the amount or the date marks it touched; the other inputs do not', () => {
    const { convert } = renderCard();
    fireEvent.blur(screen.getByTestId('convert-final-amount'));
    fireEvent.blur(screen.getByTestId('convert-date'));
    expect(convert.markTouched).toHaveBeenCalledWith('amount');
    expect(convert.markTouched).toHaveBeenCalledWith('date');
    fireEvent.blur(screen.getByTestId('convert-invoice-number'));
    fireEvent.blur(screen.getByTestId('convert-notes'));
    expect(convert.markTouched).toHaveBeenCalledTimes(2);
  });

  it('scrolling over the focused amount blurs it', () => {
    renderCard();
    const input = screen.getByTestId('convert-final-amount');
    input.focus();
    fireEvent.wheel(input);
    expect(input).not.toHaveFocus();
  });

  it('disables every input and radio while saving', () => {
    renderCard({ isSaving: true });
    for (const id of [
      'convert-final-amount',
      'convert-date',
      'convert-invoice-number',
      'convert-due-date',
      'convert-notes',
      'convert-status-pending',
      'convert-status-paid',
    ]) {
      expect(screen.getByTestId(id)).toBeDisabled();
    }
  });
});

describe('errors', () => {
  it('shows no error state by default', () => {
    renderCard();
    expect(screen.queryByRole('alert')).toBeNull();
    for (const id of ['convert-final-amount', 'convert-date', 'convert-due-date']) {
      expect(screen.getByTestId(id)).not.toHaveAttribute('aria-invalid');
      expect(screen.getByTestId(id)).not.toHaveAttribute('aria-describedby');
    }
  });

  it.each([
    ['convert-final-amount', 'amount', 'Enter a final amount.'],
    ['convert-date', 'date', 'Enter an invoice date.'],
    ['convert-due-date', 'dueDate', 'The due date must be on or after the invoice date.'],
  ])('a visible %s error is marked invalid and described by its message', (testId, key, text) => {
    renderCard({ visibleFieldErrors: { [key]: text } });
    const input = screen.getByTestId(testId);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.className).toContain('inputInvalid');
    const message = document.getElementById(input.getAttribute('aria-describedby')!);
    expect(message).toHaveTextContent(text);
  });

  it('an error on one field leaves the others unmarked', () => {
    renderCard({ visibleFieldErrors: { date: 'Enter an invoice date.' } });
    expect(screen.getByTestId('convert-final-amount')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByTestId('convert-due-date')).not.toHaveAttribute('aria-invalid');
  });
});

describe('difference to the offer', () => {
  it('reads Same as the offer for no difference', () => {
    renderCard();
    expect(screen.getByTestId('convert-difference')).toHaveTextContent('Same as the offer');
  });

  it('reads more than the offer, with amount and percent, for an increase', () => {
    renderCard({ delta: { absolute: 500, percent: 5, direction: 'increase' } });
    const badge = screen.getByTestId('convert-difference');
    expect(badge).toHaveTextContent('€500.00');
    expect(badge).toHaveTextContent('more than the offer');
    expect(badge).toHaveTextContent('5');
  });

  it('reads less than the offer for a decrease', () => {
    renderCard({ delta: { absolute: 250, percent: 2.5, direction: 'decrease' } });
    const badge = screen.getByTestId('convert-difference');
    expect(badge).toHaveTextContent('€250.00');
    expect(badge).toHaveTextContent('less than the offer');
  });
});

describe('suggestions', () => {
  it('shows nothing when there are none', () => {
    renderCard();
    expect(screen.queryByRole('button', { name: /Apply/ })).toBeNull();
  });

  it('shows one badge per suggested field with the value formatted for that field', () => {
    renderCard({
      suggestions: {
        amount: '10500.00',
        date: '2026-02-02',
        dueDate: '2026-03-03',
        invoiceNumber: 'AI-77',
        notes: 'AI notes',
      },
    });
    expect(screen.getAllByRole('button', { name: /Apply/ })).toHaveLength(5);
    expect(screen.getByText(/€10,500\.00/)).toBeInTheDocument();
    expect(screen.getByText(/AI-77/)).toBeInTheDocument();
    expect(screen.getByText(/AI notes/)).toBeInTheDocument();
    // Dates are formatted, not shown as ISO.
    expect(screen.queryByText(/2026-02-02/)).toBeNull();
    expect(screen.queryByText(/2026-03-03/)).toBeNull();
  });

  it.each([
    ['amount', 'Final amount', '10500.00'],
    ['date', 'Invoice date', '2026-02-02'],
    ['dueDate', 'Due date', '2026-03-03'],
    ['invoiceNumber', 'Invoice number', 'AI-77'],
    ['notes', 'Notes', 'AI notes'],
  ] as const)('Apply on the %s suggestion applies that field', (field, label, value) => {
    const { convert } = renderCard({ suggestions: { [field]: value } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${label}`) }));
    expect(convert.applySuggestion).toHaveBeenCalledWith(field);
  });
});

describe('status', () => {
  it('offers To pay and Paid, with the form status selected', () => {
    renderCard();
    const group = screen.getByRole('group', { name: 'Status after converting' });
    expect(within(group).getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByLabelText('To pay')).toBeChecked();
    expect(screen.getByLabelText('Paid')).not.toBeChecked();
  });

  it('reflects a paid status', () => {
    renderCard({ form: { ...makeConvert().form, status: 'paid' } });
    expect(screen.getByLabelText('Paid')).toBeChecked();
    expect(screen.getByLabelText('To pay')).not.toBeChecked();
  });

  it('choosing Paid sets the status', () => {
    const { convert } = renderCard();
    fireEvent.click(screen.getByLabelText('Paid'));
    expect(convert.setStatus).toHaveBeenCalledWith('paid');
  });
});
