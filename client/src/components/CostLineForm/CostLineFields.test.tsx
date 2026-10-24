/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeCostLineRow, makeLinkedRow } from '../../test/costLineFixtures.js';
import type { ObjectFormRenderContext } from '../ObjectForm/types.js';
import type * as FieldsTypes from './CostLineFields.js';
import type { CostLineValues } from './costLineValues.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: () => ({
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  }),
  RESOLVED_LOCALES: ['en', 'de'],
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe('CostLineFields', () => {
  let Fields: typeof FieldsTypes;
  const setValue = jest.fn<(value: unknown) => void>();

  beforeEach(async () => {
    setValue.mockReset();
    if (!Fields) Fields = await import('./CostLineFields.js');
  });

  const ctx = (over: Partial<ObjectFormRenderContext> = {}): ObjectFormRenderContext => ({
    id: 'field',
    value: '',
    setValue,
    busy: false,
    invalid: false,
    describedBy: undefined,
    createChild: jest.fn(),
    values: {},
    ...over,
  });

  const values = (over: Partial<CostLineValues> = {}): CostLineValues => ({
    description: '',
    target: null,
    existingLineId: null,
    pricing: 'direct',
    quantity: '',
    unit: '',
    unitPrice: '',
    amount: '',
    includesVat: false,
    budgetCategoryId: '',
    budgetSourceId: '',
    vendorId: '',
    confidence: 'own_estimate',
    ...over,
  });

  describe('CostLineBasisField', () => {
    it('is a select of the estimate Bases for an unlinked or new line', async () => {
      const user = userEvent.setup();
      render(<Fields.CostLineBasisField ctx={ctx({ value: 'own_estimate' })} row={null} />);
      const select = screen.getByTestId('cost-line-basis');
      expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent)).toEqual([
        'Own estimate',
        'Professional estimate',
      ]);
      await user.selectOptions(select, 'professional_estimate');
      expect(setValue).toHaveBeenCalledWith('professional_estimate');
    });

    it('treats a non-text value as the default Basis and ignores changes while busy', async () => {
      const user = userEvent.setup();
      render(
        <Fields.CostLineBasisField
          ctx={ctx({ value: undefined, busy: true, describedBy: 'hint' })}
          row={makeCostLineRow()}
        />,
      );
      const select = screen.getByTestId('cost-line-basis');
      expect(select).toHaveValue('own_estimate');
      expect(select).toHaveAttribute('aria-disabled', 'true');
      expect(select).toHaveAttribute('aria-describedby', 'hint');
      await user.selectOptions(select, 'professional_estimate');
      expect(setValue).not.toHaveBeenCalled();
    });

    it('keeps a legacy Basis as an extra option', () => {
      render(<Fields.CostLineBasisField ctx={ctx({ value: 'quote' })} row={null} />);
      expect(screen.getByRole('option', { name: 'Offer' })).toBeInTheDocument();
    });

    it('shows a read-only Basis with the reason for a line linked to an invoice', () => {
      render(
        <Fields.CostLineBasisField ctx={ctx({ describedBy: 'x-error' })} row={makeLinkedRow()} />,
      );
      const input = screen.getByTestId('cost-line-basis-locked');
      expect(input).toHaveValue('Invoice');
      expect(input).toHaveAttribute('aria-readonly', 'true');
      expect(input).not.toBeDisabled();
      expect(input.getAttribute('aria-describedby')).toContain('x-error');
      expect(screen.getByText('Set by the linked invoice')).toBeInTheDocument();
    });

    it('names the offer for a line linked to an offer', () => {
      render(
        <Fields.CostLineBasisField
          ctx={ctx()}
          row={makeLinkedRow({ invoiceStatus: 'quotation' })}
        />,
      );
      expect(screen.getByText('Set by the linked offer')).toBeInTheDocument();
      expect(screen.getByTestId('cost-line-basis-locked')).toHaveValue('Offer');
    });
  });

  describe('CostLineAmountField', () => {
    it('edits the amount and blurs on wheel so scrolling never changes it', () => {
      render(<Fields.CostLineAmountField ctx={ctx({ value: '12' })} values={values()} />);
      const input = screen.getByTestId('cost-line-amount') as HTMLInputElement;
      expect(input).toHaveValue(12);
      expect(input).not.toHaveAttribute('placeholder');
      fireEvent.change(input, { target: { value: '15' } });
      expect(setValue).toHaveBeenCalledWith('15');
      input.focus();
      fireEvent.wheel(input);
      expect(input).not.toHaveFocus();
    });

    it("shows the picked line's gross as the placeholder and the invalid state", () => {
      render(
        <Fields.CostLineAmountField
          ctx={ctx({ value: 7, invalid: true, busy: true, describedBy: 'e' })}
          values={values({
            existingLineId: { id: 'x', type: 'work_item', description: null, gross: 238 },
          })}
        />,
      );
      const input = screen.getByTestId('cost-line-amount');
      expect(input).toHaveAttribute('placeholder', '€238.00');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAttribute('readonly');
      expect(input).toHaveValue(null);
    });
  });
});
