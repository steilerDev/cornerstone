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

  describe('validate', () => {
    it('accepts a complete form', () => {
      expect(schema().validate(filled())).toEqual({});
    });

    it('rejects a blank or whitespace name', () => {
      expect(schema().validate(filled({ name: '   ' }))).toEqual({ name: 'Enter a name.' });
    });

    it.each(['', '0', '-5', 'abc'])('rejects the amount %j', (amount) => {
      expect(schema().validate(filled({ totalAmount: amount }))).toEqual({
        totalAmount: 'Enter an amount greater than 0.',
      });
    });

    it('treats a non-string value as empty', () => {
      expect(schema().validate(filled({ name: undefined, totalAmount: 5 }))).toEqual({
        name: 'Enter a name.',
        totalAmount: 'Enter an amount greater than 0.',
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
