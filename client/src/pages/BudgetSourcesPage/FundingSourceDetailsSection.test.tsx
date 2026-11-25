/**
 * @jest-environment jsdom
 */
/**
 * FundingSourceDetailsSection (#2242, MNY-026, AC8): read facts plus an explicit-Save edit form.
 *
 * Mutations these tests catch: Own funds offering a type field; Own funds rejecting an amount of 0
 * or a loan accepting 0; the interest rate accepted outside 0-100; a blank name saved; every
 * field sent instead of only the changed ones; a cleared optional field sent as "" not null; a
 * server error not shown (banner) or a failed save closing the form; Discard keeping edits.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BudgetSource, UpdateBudgetSourceRequest } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import enBudget from '../../i18n/en/budget.json';
import type * as SectionModule from './FundingSourceDetailsSection.js';

const mockUpdate = jest.fn<(id: string, body: UpdateBudgetSourceRequest) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  updateBudgetSource: mockUpdate,
  createBudgetSource: jest.fn(),
}));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => {
  const localeValue = {
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  };
  return {
    LocaleProvider: ({ children }: { children: unknown }) => children,
    useLocale: () => localeValue,
  };
});

const source = (over: Partial<BudgetSource> = {}): BudgetSource =>
  ({
    id: 'bs-1',
    name: 'Loan Alpha',
    sourceType: 'bank_loan',
    status: 'active',
    isDiscretionary: false,
    totalAmount: 50000,
    interestRate: 3.5,
    terms: '10 years',
    reference: 'REF-1',
    contactAddress: 'Main St 1',
    notes: 'A note',
    ...over,
  }) as BudgetSource;

describe('FundingSourceDetailsSection', () => {
  let Section: typeof SectionModule.FundingSourceDetailsSection;
  const onSaved = jest.fn<() => Promise<unknown>>();

  beforeEach(async () => {
    mockUpdate.mockReset().mockResolvedValue({});
    onSaved.mockReset().mockResolvedValue(undefined);
    if (!Section)
      ({ FundingSourceDetailsSection: Section } = await import('./FundingSourceDetailsSection.js'));
  });

  const renderSection = (over: Partial<BudgetSource> = {}) =>
    render(<Section source={source(over)} onSaved={onSaved} />);
  const startEdit = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(await screen.findByTestId('source-details-edit'));
  const field = (id: string) => screen.getByTestId(id) as HTMLInputElement;
  const detail = (id: string) => screen.getByTestId(id);
  const save = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByTestId('source-details-save'));

  describe('read mode', () => {
    it('shows every fact, with the type word and the formatted amount and rate', () => {
      renderSection();
      expect(detail('source-detail-name')).toHaveTextContent('Loan Alpha');
      expect(detail('source-detail-type')).toHaveTextContent('Bank loan');
      expect(detail('source-detail-amount')).toHaveTextContent('€50,000.00');
      expect(detail('source-detail-interest-rate')).toHaveTextContent('3.50%');
      expect(detail('source-detail-reference')).toHaveTextContent('REF-1');
      expect(detail('source-detail-terms')).toHaveTextContent('10 years');
      expect(detail('source-detail-contact')).toHaveTextContent('Main St 1');
      expect(detail('source-detail-notes')).toHaveTextContent('A note');
    });

    it('shows a dash (with "Not set" for screen readers) for empty values', () => {
      renderSection({
        interestRate: null,
        terms: null,
        reference: null,
        contactAddress: null,
        notes: null,
      });
      for (const id of ['interest-rate', 'terms', 'reference', 'contact', 'notes']) {
        expect(detail(`source-detail-${id}`)).toHaveTextContent('–');
        expect(within(detail(`source-detail-${id}`)).getByText('Not set')).toBeInTheDocument();
      }
    });

    it('shows a whole rate without decimals', () => {
      renderSection({ interestRate: 4 });
      expect(detail('source-detail-interest-rate')).toHaveTextContent(/^4%$/);
    });
  });

  describe('edit form', () => {
    it('opens with the stored values and the type field for a loan', async () => {
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);

      expect(field('source-field-name').value).toBe('Loan Alpha');
      expect(field('source-field-amount').value).toBe('50000');
      expect(field('source-field-interest-rate').value).toBe('3.5');
      expect(field('source-field-interest-rate')).toHaveAttribute('max', '100');
      expect(field('source-field-reference').value).toBe('REF-1');
      expect((screen.getByTestId('source-field-type') as HTMLSelectElement).value).toBe(
        'bank_loan',
      );
      expect(field('source-field-name')).toHaveFocus();
    });

    it('offers no Own funds in the type list, and for Own funds no type field at all', async () => {
      const user = userEvent.setup();
      const { unmount } = renderSection();
      await startEdit(user);
      expect(
        within(screen.getByTestId('source-field-type'))
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Bank loan', 'Credit line', 'Savings', 'Other']);
      unmount();

      renderSection({ sourceType: 'discretionary', isDiscretionary: true });
      await startEdit(user);
      expect(screen.queryByTestId('source-field-type')).toBeNull();
    });

    it('sends only the changed fields: a rename', async () => {
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);

      await user.clear(field('source-field-name'));
      await user.type(field('source-field-name'), '  Loan Beta ');
      await save(user);

      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
      expect(mockUpdate).toHaveBeenCalledWith('bs-1', { name: 'Loan Beta' });
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByTestId('source-details-save')).toBeNull());
    });

    it('sends type, amount and every text field when they changed; blank optional fields become null', async () => {
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);

      await user.selectOptions(screen.getByTestId('source-field-type'), 'credit_line');
      await user.clear(field('source-field-amount'));
      await user.type(field('source-field-amount'), '75000');
      await user.clear(field('source-field-interest-rate'));
      await user.clear(field('source-field-reference'));
      await user.clear(field('source-field-terms'));
      await user.clear(field('source-field-contact'));
      await user.clear(field('source-field-notes'));
      await save(user);

      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
      expect(mockUpdate).toHaveBeenCalledWith('bs-1', {
        sourceType: 'credit_line',
        totalAmount: 75000,
        interestRate: null,
        terms: null,
        reference: null,
        contactAddress: null,
        notes: null,
      });
    });

    it('sends changed text fields trimmed and a changed rate as a number (including 0)', async () => {
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);

      await user.clear(field('source-field-interest-rate'));
      await user.type(field('source-field-interest-rate'), '0');
      await user.type(field('source-field-reference'), ' X ');
      await user.type(field('source-field-terms'), ' more');
      await user.type(field('source-field-contact'), ' b');
      await user.type(field('source-field-notes'), ' n');
      await save(user);

      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
      expect(mockUpdate.mock.calls[0]![1]).toEqual({
        interestRate: 0,
        reference: 'REF-1 X',
        terms: '10 years more',
        contactAddress: 'Main St 1 b',
        notes: 'A note n',
      });
    });

    it('Own funds never sends sourceType, and accepts an amount of 0', async () => {
      const user = userEvent.setup();
      renderSection({
        sourceType: 'discretionary',
        isDiscretionary: true,
        totalAmount: 100,
        interestRate: null,
      });
      await startEdit(user);

      await user.clear(field('source-field-amount'));
      await user.type(field('source-field-amount'), '0');
      await save(user);

      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
      expect(mockUpdate).toHaveBeenCalledWith('bs-1', { totalAmount: 0 });
    });
  });

  describe('validation', () => {
    it('a blank name and a loan amount of 0 are rejected with field errors and no request', async () => {
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);

      await user.clear(field('source-field-name'));
      await user.clear(field('source-field-amount'));
      await user.type(field('source-field-amount'), '0');
      await save(user);

      expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
      expect(screen.getByText('Enter an amount of at least 0.01.')).toBeInTheDocument();
      expect(field('source-field-name')).toHaveAttribute('aria-invalid', 'true');
      expect(field('source-field-name').getAttribute('aria-describedby')).toBeTruthy();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('an empty amount and a negative amount are rejected; Own funds asks for 0 or more', async () => {
      const user = userEvent.setup();
      const { unmount } = renderSection();
      await startEdit(user);
      await user.clear(field('source-field-amount'));
      await save(user);
      expect(await screen.findByText('Enter an amount of at least 0.01.')).toBeInTheDocument();
      unmount();

      renderSection({ sourceType: 'discretionary', isDiscretionary: true });
      await startEdit(user);
      await user.clear(field('source-field-amount'));
      await user.type(field('source-field-amount'), '-5');
      await save(user);
      expect(await screen.findByText('Enter an amount of 0 or more.')).toBeInTheDocument();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it.each(['-1', '100.5'])('rejects the interest rate %s', async (rate) => {
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);
      await user.clear(field('source-field-interest-rate'));
      await user.type(field('source-field-interest-rate'), rate);
      await save(user);

      expect(await screen.findByText('Enter a rate between 0 and 100.')).toBeInTheDocument();
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('failures and discard', () => {
    it('a server error shows a translated banner and keeps the form open with the edits', async () => {
      mockUpdate.mockRejectedValue(
        new ApiClientError(400, { code: 'VALIDATION_ERROR', message: 'raw' }),
      );
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);
      await user.type(field('source-field-notes'), ' more');
      await save(user);

      const alert = await screen.findByRole('alert');
      expect(alert).not.toHaveTextContent('raw');
      expect(field('source-field-notes').value).toBe('A note more');
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('a failure that is not an API error shows the fixed save error', async () => {
      mockUpdate.mockRejectedValue(new Error('offline'));
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);
      await user.type(field('source-field-notes'), 'x');
      await save(user);

      expect(
        await screen.findByText('The changes could not be saved. Please try again.'),
      ).toBeInTheDocument();
    });

    it('a failed page refresh after a successful save does not turn the save into an error', async () => {
      onSaved.mockRejectedValue(new Error('refresh failed'));
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);
      await user.type(field('source-field-notes'), 'x');
      await save(user);

      await waitFor(() => expect(screen.queryByTestId('source-details-save')).toBeNull());
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('Cancel without changes closes the form and restores the stored values on the next edit', async () => {
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);
      await user.click(screen.getByTestId('source-details-cancel'));

      await startEdit(user);
      expect(field('source-field-name').value).toBe('Loan Alpha');
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('starting a new edit discards earlier errors and edits', async () => {
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);
      await user.clear(field('source-field-name'));
      await save(user);
      await screen.findByText('Enter a name.');
      await user.click(screen.getByTestId('source-details-cancel'));
      const discard = screen.queryByRole('button', { name: /Discard/ });
      if (discard) await user.click(discard);

      await startEdit(user);
      expect(screen.queryByText('Enter a name.')).toBeNull();
      expect(field('source-field-name').value).toBe('Loan Alpha');
    });
  });
});

describe('FundingSourceDetailsSection on the schema (#2255)', () => {
  let Section: typeof SectionModule.FundingSourceDetailsSection;
  const onSaved = jest.fn<() => Promise<unknown>>();

  beforeEach(async () => {
    mockUpdate.mockReset().mockResolvedValue({});
    onSaved.mockReset().mockResolvedValue(undefined);
    if (!Section)
      ({ FundingSourceDetailsSection: Section } = await import('./FundingSourceDetailsSection.js'));
  });

  const open = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(await screen.findByTestId('source-details-edit'));

  it('has no Status control in the card (Status is a create-only essential)', async () => {
    const user = userEvent.setup();
    render(<Section source={source()} onSaved={onSaved} />);
    await open(user);

    const form = screen.getByTestId('source-details-form');
    expect(within(form).queryByLabelText(enBudget.financing.fields.status)).toBeNull();
  });

  it('labels the inputs with the schema (en) labels, and the type field only for non-Own funds', async () => {
    const user = userEvent.setup();
    render(<Section source={source()} onSaved={onSaved} />);
    await open(user);

    expect(screen.getByTestId('source-field-name')).toHaveAccessibleName(
      new RegExp(enBudget.financing.fields.name),
    );
    expect(screen.getByTestId('source-field-amount')).toHaveAccessibleName(
      new RegExp(enBudget.financing.fields.amount),
    );
    expect(screen.getByTestId('source-field-interest-rate')).toHaveAccessibleName(
      new RegExp(enBudget.financing.fields.interestRate),
    );
    expect(screen.getByTestId('source-field-type')).toHaveAccessibleName(
      new RegExp(enBudget.financing.fields.type),
    );
  });

  it('Own funds: no Type, an amount of 0 saves, -1 shows the not-negative message, sourceType is never sent', async () => {
    const user = userEvent.setup();
    render(
      <Section
        source={source({ sourceType: 'discretionary', isDiscretionary: true, totalAmount: 100 })}
        onSaved={onSaved}
      />,
    );
    await open(user);
    expect(screen.queryByTestId('source-field-type')).toBeNull();
    const amount = screen.getByTestId('source-field-amount');

    await user.clear(amount);
    await user.type(amount, '-1');
    await user.click(screen.getByTestId('source-details-save'));
    expect(await screen.findByText(enBudget.financing.errors.amountNotNegative)).toBeVisible();
    expect(mockUpdate).not.toHaveBeenCalled();

    await user.clear(amount);
    await user.type(amount, '0');
    await user.click(screen.getByTestId('source-details-save'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    const body = mockUpdate.mock.calls[0]![1];
    expect(body).toEqual({ totalAmount: 0 });
    expect(body).not.toHaveProperty('sourceType');
  });

  it('a loan with amount 0 shows the amountMinimum message', async () => {
    const user = userEvent.setup();
    render(<Section source={source()} onSaved={onSaved} />);
    await open(user);
    const amount = screen.getByTestId('source-field-amount');

    await user.clear(amount);
    await user.type(amount, '0');
    await user.click(screen.getByTestId('source-details-save'));

    expect(await screen.findByText(enBudget.financing.errors.amountMinimum)).toBeVisible();
    expect(amount).toHaveAttribute('aria-invalid', 'true');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('Cancel on a dirty card asks to discard, and discarding restores the stored value', async () => {
    const user = userEvent.setup();
    render(<Section source={source()} onSaved={onSaved} />);
    await open(user);
    await user.type(screen.getByTestId('source-field-notes'), ' edited');

    await user.click(screen.getByTestId('source-details-cancel'));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));

    await open(user);
    expect(screen.getByTestId('source-field-notes')).toHaveValue('A note');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('keeps ids unique and prefixed per card instance', async () => {
    const user = userEvent.setup();
    render(<Section source={source()} onSaved={onSaved} />);
    await open(user);

    const ids = Array.from(document.querySelectorAll('[id]')).map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(screen.getByTestId('source-field-name').id).toMatch(/-name$/);
  });
});
