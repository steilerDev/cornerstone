/**
 * @jest-environment jsdom
 */
/**
 * GrantDetailsSection (#2242, MNY-038, D11): read facts plus an explicit-Save edit form.
 *
 * Mutations these tests catch: a fixed grant edited as a percentage (capped at 100, labelled
 * Rate) or the type sent in the PATCH; a percentage accepted above 100 or at 0; a cap of 0
 * accepted; every field sent instead of the changed ones; a cleared optional field sent as ""
 * rather than null; a failed save closing the form.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SubsidyProgram, UpdateSubsidyProgramRequest } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import type * as SectionModule from './GrantDetailsSection.js';

const mockUpdate = jest.fn<(id: string, body: UpdateSubsidyProgramRequest) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/subsidyProgramsApi.js', () => ({
  updateSubsidyProgram: mockUpdate,
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

const grant = (over: Partial<SubsidyProgram> = {}): SubsidyProgram =>
  ({
    id: 'sp-1',
    name: 'Energy grant',
    reductionType: 'percentage',
    reductionValue: 30,
    maximumAmount: 12000,
    applicationDeadline: '2026-09-01',
    description: 'A description',
    notes: 'A note',
    ...over,
  }) as SubsidyProgram;

describe('GrantDetailsSection', () => {
  let Section: typeof SectionModule.GrantDetailsSection;
  const onSaved = jest.fn<() => Promise<unknown>>();

  beforeEach(async () => {
    mockUpdate.mockReset().mockResolvedValue({});
    onSaved.mockReset().mockResolvedValue(undefined);
    if (!Section) ({ GrantDetailsSection: Section } = await import('./GrantDetailsSection.js'));
  });

  const renderSection = (over: Partial<SubsidyProgram> = {}) =>
    render(<Section grant={grant(over)} onSaved={onSaved} />);
  const startEdit = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(await screen.findByTestId('grant-details-edit'));
  const field = (id: string) => screen.getByTestId(id) as HTMLInputElement;
  const save = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByTestId('grant-details-save'));
  const detail = (id: string) => screen.getByTestId(id);

  describe('read mode', () => {
    it('shows name, rate, cap, deadline, description and notes', () => {
      renderSection();
      expect(detail('grant-detail-name')).toHaveTextContent('Energy grant');
      expect(detail('grant-detail-rate')).toHaveTextContent('30%');
      expect(detail('grant-detail-cap')).toHaveTextContent('€12,000.00');
      expect(detail('grant-detail-deadline')).toHaveTextContent('Sep');
      expect(detail('grant-detail-description')).toHaveTextContent('A description');
      expect(detail('grant-detail-notes')).toHaveTextContent('A note');
    });

    it('shows "No cap" and dashes (with "Not set" for screen readers) when empty', () => {
      renderSection({
        maximumAmount: null,
        applicationDeadline: null,
        description: null,
        notes: null,
      });
      expect(detail('grant-detail-cap')).toHaveTextContent('No cap');
      for (const id of ['deadline', 'description', 'notes']) {
        expect(within(detail(`grant-detail-${id}`)).getByText('Not set')).toBeInTheDocument();
      }
    });

    it('a fixed grant shows its stored amount as "Fixed reduction", never as a percentage', () => {
      renderSection({ reductionType: 'fixed', reductionValue: 1500 });
      expect(screen.getByText('Fixed reduction', { selector: 'dt' })).toBeInTheDocument();
      expect(detail('grant-detail-rate')).toHaveTextContent('€1,500.00');
      expect(detail('grant-detail-rate').textContent).not.toContain('%');
    });
  });

  describe('edit form', () => {
    it('opens with the stored values, labelled "Rate (%)"', async () => {
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);

      expect(screen.getByLabelText(/Rate \(%\)/)).toBe(field('grant-field-rate'));
      expect(field('grant-field-name').value).toBe('Energy grant');
      expect(field('grant-field-rate').value).toBe('30');
      expect(field('grant-field-rate')).toHaveAttribute('max', '100');
      expect(field('grant-field-cap').value).toBe('12000');
      expect(field('grant-field-deadline').value).toBe('2026-09-01');
      expect(field('grant-field-name')).toHaveFocus();
    });

    it('a fixed grant edits "Fixed reduction" without a maximum of 100', async () => {
      const user = userEvent.setup();
      renderSection({ reductionType: 'fixed', reductionValue: 1500 });
      await startEdit(user);

      expect(screen.getByLabelText(/Fixed reduction/)).toBe(field('grant-field-rate'));
      expect(field('grant-field-rate')).not.toHaveAttribute('max');
    });

    it('sends only the changed fields: a rename, never the type', async () => {
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);
      await user.clear(field('grant-field-name'));
      await user.type(field('grant-field-name'), ' New name ');
      await save(user);

      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
      expect(mockUpdate).toHaveBeenCalledWith('sp-1', { name: 'New name' });
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByTestId('grant-details-save')).toBeNull());
    });

    it('a fixed grant sends reductionValue only (never reductionType), even above 100', async () => {
      const user = userEvent.setup();
      renderSection({ reductionType: 'fixed', reductionValue: 1500 });
      await startEdit(user);
      await user.clear(field('grant-field-rate'));
      await user.type(field('grant-field-rate'), '2500');
      await save(user);

      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
      expect(mockUpdate).toHaveBeenCalledWith('sp-1', { reductionValue: 2500 });
    });

    it('sends the rate, a cleared cap and deadline as null, and trimmed texts', async () => {
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);
      await user.clear(field('grant-field-rate'));
      await user.type(field('grant-field-rate'), '45.5');
      await user.clear(field('grant-field-cap'));
      await user.clear(field('grant-field-deadline'));
      await user.clear(field('grant-field-description'));
      await user.type(field('grant-field-notes'), ' more ');
      await save(user);

      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
      expect(mockUpdate.mock.calls[0]![1]).toEqual({
        reductionValue: 45.5,
        maximumAmount: null,
        applicationDeadline: null,
        description: null,
        notes: 'A note more',
      });
    });

    it('sends a new cap and deadline', async () => {
      const user = userEvent.setup();
      renderSection({ maximumAmount: null, applicationDeadline: null });
      await startEdit(user);
      await user.type(field('grant-field-cap'), '8000');
      await user.type(field('grant-field-deadline'), '2027-01-15');
      await save(user);

      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
      expect(mockUpdate.mock.calls[0]![1]).toEqual({
        maximumAmount: 8000,
        applicationDeadline: '2027-01-15',
      });
    });
  });

  describe('validation', () => {
    it('a blank name is rejected with a field error and no request', async () => {
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);
      await user.clear(field('grant-field-name'));
      await save(user);

      expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
      expect(field('grant-field-name')).toHaveAttribute('aria-invalid', 'true');
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it.each(['', '0', '-3', '100.5'])('rejects the percentage %j', async (value) => {
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);
      await user.clear(field('grant-field-rate'));
      if (value) await user.type(field('grant-field-rate'), value);
      await save(user);

      expect(await screen.findByText('Enter a rate above 0 and up to 100.')).toBeInTheDocument();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it.each(['0', '-1'])(
      'rejects the fixed reduction %s with the amount message',
      async (value) => {
        const user = userEvent.setup();
        renderSection({ reductionType: 'fixed', reductionValue: 1500 });
        await startEdit(user);
        await user.clear(field('grant-field-rate'));
        await user.type(field('grant-field-rate'), value);
        await save(user);

        expect(await screen.findByText('Enter an amount greater than 0.')).toBeInTheDocument();
        expect(mockUpdate).not.toHaveBeenCalled();
      },
    );

    it('rejects a cap of 0 but accepts a blank cap', async () => {
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);
      await user.clear(field('grant-field-cap'));
      await user.type(field('grant-field-cap'), '0');
      await save(user);
      expect(await screen.findByText('Enter an amount greater than 0.')).toBeInTheDocument();
      expect(mockUpdate).not.toHaveBeenCalled();

      await user.clear(field('grant-field-cap'));
      await save(user);
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('sp-1', { maximumAmount: null }));
    });
  });

  describe('failures and discard', () => {
    it('a server error shows a translated banner and keeps the edits', async () => {
      mockUpdate.mockRejectedValue(
        new ApiClientError(400, { code: 'VALIDATION_ERROR', message: 'raw' }),
      );
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);
      await user.type(field('grant-field-notes'), ' x');
      await save(user);

      expect(await screen.findByRole('alert')).not.toHaveTextContent('raw');
      expect(field('grant-field-notes').value).toBe('A note x');
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('a non-API failure shows the fixed save error', async () => {
      mockUpdate.mockRejectedValue(new Error('offline'));
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);
      await user.type(field('grant-field-notes'), 'x');
      await save(user);
      expect(
        await screen.findByText('The changes could not be saved. Please try again.'),
      ).toBeInTheDocument();
    });

    it('a failed page refresh after a successful save is not a failed save', async () => {
      onSaved.mockRejectedValue(new Error('refresh failed'));
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);
      await user.type(field('grant-field-notes'), 'x');
      await save(user);

      await waitFor(() => expect(screen.queryByTestId('grant-details-save')).toBeNull());
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('Cancel without changes restores the stored values on the next edit', async () => {
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);
      await user.click(screen.getByTestId('grant-details-cancel'));
      await startEdit(user);
      expect(field('grant-field-name').value).toBe('Energy grant');
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
});
