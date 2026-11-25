/**
 * @jest-environment jsdom
 */
/**
 * fundingSourceForm (#2242, S8): the New funding source schema.
 *
 * Mutations these tests catch: Own funds offered as a type; Save accepting an amount of 0 or a
 * blank name, or an interest rate outside 0-100; an empty optional field sent as "" instead of
 * null; the rate sent as 0 when blank; Save not returning the new page's href.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import type { BudgetSource, CreateBudgetSourceRequest } from '@cornerstone/shared';
import enBudget from '../i18n/en/budget.json';
import type * as FormTypes from './fundingSourceForm.js';

const mockCreateBudgetSource =
  jest.fn<(data: CreateBudgetSourceRequest) => Promise<BudgetSource>>();
jest.unstable_mockModule('../lib/budgetSourcesApi.js', () => ({
  createBudgetSource: mockCreateBudgetSource,
}));

describe('fundingSourceForm', () => {
  let Form: typeof FormTypes;

  beforeEach(async () => {
    mockCreateBudgetSource.mockReset();
    mockCreateBudgetSource.mockResolvedValue({ id: 'bs-9', name: 'Loan Alpha' } as BudgetSource);
    if (!Form) Form = await import('./fundingSourceForm.js');
  });

  const schema = () => renderHook(() => Form.useFundingSourceFormSchema()).result.current;
  const filled = (over: Record<string, unknown> = {}) => ({
    ...schema().initialValues,
    name: 'Loan Alpha',
    totalAmount: '50000',
    ...over,
  });

  it('is titled "New funding source" and starts as an active bank loan', () => {
    const s = schema();
    expect(s.id).toBe('funding-source');
    expect(s.title).toBe('New funding source');
    expect(s.addAnother).toBe(true);
    expect(s.initialValues).toMatchObject({ sourceType: 'bank_loan', status: 'active', name: '' });
  });

  it('offers every type except Own funds, and every status', () => {
    const fields = schema().fields;
    const type = fields.find((f) => f.name === 'sourceType');
    const status = fields.find((f) => f.name === 'status');
    expect((type?.options ?? []).map((o) => o.label)).toEqual([
      'Bank loan',
      'Credit line',
      'Savings',
      'Other',
    ]);
    expect(status?.options?.length).toBe(3);
  });

  it('requires a name and shows name, type, amount, rate and status up front', () => {
    const fields = schema().fields;
    expect(fields.filter((f) => f.essential).map((f) => f.name)).toEqual([
      'name',
      'sourceType',
      'totalAmount',
      'interestRate',
      'status',
    ]);
    expect(fields.find((f) => f.name === 'name')).toMatchObject({ required: true, maxLength: 200 });
  });

  describe('scopes (#2255)', () => {
    const fieldNames = (opts?: Parameters<typeof Form.useFundingSourceFormSchema>[0]) =>
      renderHook(() => Form.useFundingSourceFormSchema(opts)).result.current.fields.map(
        (f) => f.name,
      );

    it('caps the interest rate at 100 in create and edit scope', () => {
      for (const opts of [undefined, { scope: 'edit' as const }]) {
        const f = renderHook(() => Form.useFundingSourceFormSchema(opts)).result.current.fields;
        expect(f.find((x) => x.name === 'interestRate')?.max).toBe(100);
      }
    });

    it('the amount field min is 0.01 in create scope and 0 for Own funds in edit scope', () => {
      const min = (opts?: Parameters<typeof Form.useFundingSourceFormSchema>[0]) =>
        renderHook(() => Form.useFundingSourceFormSchema(opts)).result.current.fields.find(
          (f) => f.name === 'totalAmount',
        )?.min;
      expect(min()).toBe(0.01);
      expect(min({ scope: 'edit' })).toBe(0.01);
      expect(min({ scope: 'edit', isDiscretionary: true })).toBe(0);
    });

    it('the value messages resolve amountMinimum to the amountMinimum text', () => {
      const m = renderHook(() => Form.useFundingSourceValueMessages()).result.current;
      expect(m.amountMinimum).toBe('Enter an amount of at least 0.01.');
    });

    it('create scope has Status; edit scope does not', () => {
      expect(fieldNames()).toContain('status');
      expect(fieldNames({ scope: 'edit' })).not.toContain('status');
    });

    it('edit scope keeps the Type unless the source is Own funds', () => {
      expect(fieldNames({ scope: 'edit' })).toContain('sourceType');
      expect(fieldNames({ scope: 'edit', isDiscretionary: true })).not.toContain('sourceType');
    });

    it('create scope ignores isDiscretionary (Type stays)', () => {
      expect(fieldNames({ isDiscretionary: true })).toContain('sourceType');
    });

    it('create scope validates the amount as above 0 even when isDiscretionary is passed', () => {
      const s = renderHook(() => Form.useFundingSourceFormSchema({ isDiscretionary: true })).result
        .current;
      expect(s.validate({ ...s.initialValues, name: 'x', totalAmount: '0' })).toEqual({
        totalAmount: enBudget.financing.errors.amountMinimum,
      });
    });

    it('edit scope for Own funds accepts 0 through its schema validator', () => {
      const s = renderHook(() =>
        Form.useFundingSourceFormSchema({ scope: 'edit', isDiscretionary: true }),
      ).result.current;
      expect(s.validate({ name: 'Own funds', totalAmount: '0' })).toEqual({});
      expect(s.validate({ name: 'Own funds', totalAmount: '-1' })).toEqual({
        totalAmount: enBudget.financing.errors.amountNotNegative,
      });
    });
  });

  describe('validateFundingSourceValues (AC2a)', () => {
    const messages = {
      nameRequired: 'N',
      amountMinimum: 'MINIMUM',
      amountNotNegative: 'NONNEG',
      interestInvalid: 'RATE',
    };
    const run = (totalAmount: unknown, isDiscretionary?: boolean) =>
      Form.validateFundingSourceValues({ name: 'x', totalAmount }, messages, { isDiscretionary })
        .totalAmount;

    it('amount 0: error by default, none for Own funds', () => {
      expect(run('0')).toBe('MINIMUM');
      expect(run('0', true)).toBeUndefined();
    });

    it('amounts below 0.01 are errors by default; 0.01 passes; Own funds accepts them', () => {
      expect(run('0.001')).toBe('MINIMUM');
      expect(run('0.009')).toBe('MINIMUM');
      expect(run('0.01')).toBeUndefined();
      expect(run('0.001', true)).toBeUndefined();
    });

    it('amount -1: amountNotNegative for Own funds, amountMinimum otherwise', () => {
      expect(run('-1', true)).toBe('NONNEG');
      expect(run('-1')).toBe('MINIMUM');
    });

    it('blank amount is an error in both modes, with each mode message', () => {
      expect(run('')).toBe('MINIMUM');
      expect(run('', true)).toBe('NONNEG');
    });

    it('interest 101 is interestInvalid', () => {
      expect(
        Form.validateFundingSourceValues(
          { name: 'x', totalAmount: '1', interestRate: '101' },
          messages,
        ).interestRate,
      ).toBe('RATE');
    });

    it('works with no options and missing keys', () => {
      expect(Form.validateFundingSourceValues({}, messages)).toEqual({
        name: 'N',
        totalAmount: 'MINIMUM',
      });
    });
  });

  describe('validate', () => {
    it('accepts a complete form', () => {
      expect(schema().validate(filled())).toEqual({});
    });

    it('rejects a blank or whitespace name', () => {
      expect(schema().validate(filled({ name: '   ' }))).toEqual({ name: 'Enter a name.' });
    });

    it.each(['', '0', '0.001', '0.009', '-5', 'abc'])('rejects the amount %j', (amount) => {
      expect(schema().validate(filled({ totalAmount: amount }))).toEqual({
        totalAmount: 'Enter an amount of at least 0.01.',
      });
    });

    it('treats a non-string value as empty', () => {
      expect(schema().validate(filled({ name: undefined, totalAmount: 5 }))).toEqual({
        name: 'Enter a name.',
        totalAmount: 'Enter an amount of at least 0.01.',
      });
    });

    it.each(['0', '3.5', '100'])('accepts the interest rate %s', (rate) => {
      expect(schema().validate(filled({ interestRate: rate }))).toEqual({});
    });

    it.each(['-1', '100.01', 'x'])('rejects the interest rate %s', (rate) => {
      expect(schema().validate(filled({ interestRate: rate }))).toEqual({
        interestRate: 'Enter a rate between 0 and 100.',
      });
    });
  });

  describe('submit', () => {
    it('sends trimmed values, null for blank optional fields, and returns the new page href', async () => {
      const s = schema();

      const result = await s.submit(filled({ name: '  Loan Alpha ' }));

      expect(mockCreateBudgetSource).toHaveBeenCalledWith({
        name: 'Loan Alpha',
        sourceType: 'bank_loan',
        totalAmount: 50000,
        interestRate: null,
        status: 'active',
        terms: null,
        reference: null,
        contactAddress: null,
        notes: null,
      });
      expect(result).toEqual({
        id: 'bs-9',
        href: '/budget/financing/sources/bs-9',
        label: 'Loan Alpha',
      });
      expect(s.addedMessage?.(result)).toBe('Loan Alpha added.');
    });

    it('sends a rate of 0 as 0 (not null) and every filled optional field', async () => {
      await schema().submit(
        filled({
          sourceType: 'credit_line',
          status: 'exhausted',
          interestRate: '0',
          terms: ' 10 years ',
          reference: ' REF-1 ',
          contactAddress: ' Main St 1 ',
          notes: ' note ',
        }),
      );

      expect(mockCreateBudgetSource).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: 'credit_line',
          status: 'exhausted',
          interestRate: 0,
          terms: '10 years',
          reference: 'REF-1',
          contactAddress: 'Main St 1',
          notes: 'note',
        }),
      );
    });

    it('lets a failed create reject so the dialog can show the error', async () => {
      mockCreateBudgetSource.mockRejectedValueOnce(new Error('boom'));
      await expect(schema().submit(filled())).rejects.toThrow('boom');
    });
  });
});
