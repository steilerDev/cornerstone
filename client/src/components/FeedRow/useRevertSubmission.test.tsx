/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import type { DiaryEntrySummary, RevertSubmissionResponse } from '@cornerstone/shared';
import type * as HookModule from './useRevertSubmission.js';
import type * as ApiClientModule from '../../lib/apiClient.js';
import i18n from '../../i18n/index.js';

const mockRevert = jest.fn<(batchId: string) => Promise<RevertSubmissionResponse>>();
jest.unstable_mockModule('../../lib/sourceReportsApi.js', () => ({ revertSubmission: mockRevert }));

const mockShowToast = jest.fn();
jest.unstable_mockModule('../Toast/ToastContext.js', () => ({
  useToast: () => ({ toasts: [], showToast: mockShowToast, dismissToast: jest.fn() }),
}));

jest.unstable_mockModule('../../lib/formatters.js', () => ({
  useFormatters: () => ({
    formatDate: (d: string) => `D(${d})`,
    formatCurrency: (n: number) => `EUR ${n.toFixed(2)}`,
  }),
}));

let useRevertSubmission: (typeof HookModule)['useRevertSubmission'];
let ApiClientError: (typeof ApiClientModule)['ApiClientError'];
let NetworkError: (typeof ApiClientModule)['NetworkError'];

type Batch = NonNullable<DiaryEntrySummary['batch']>;

function entry(id: string, batch: Partial<Batch> | null): DiaryEntrySummary {
  return {
    id,
    entryDate: '2026-03-10',
    batch:
      batch === null
        ? undefined
        : {
            batchId: `batch-${id}`,
            invoiceCount: 2,
            amount: 300,
            invoiceLabels: ['T-1', 'T-2'],
            budgetSourceId: 'src-1',
            budgetSourceName: 'Bank A',
            budgetSourceExists: true,
            kind: 'submission',
            reverted: false,
            invoicesFrom: { pending: 2, paid: 0 },
            progressPaymentCount: 0,
            ...batch,
          },
  } as unknown as DiaryEntrySummary;
}

function Host({ entries, onChanged }: { entries: DiaryEntrySummary[]; onChanged: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { renderRowActions, dialog } = useRevertSubmission({
    onChanged,
    returnFocusRef: headingRef,
  });
  return (
    <div>
      <h2 ref={headingRef} tabIndex={-1}>
        History
      </h2>
      {entries.map((e) => (
        <div key={e.id} data-testid={`row-${e.id}`}>
          {renderRowActions(e)}
        </div>
      ))}
      {dialog}
    </div>
  );
}

function setup(entries: DiaryEntrySummary[]) {
  const onChanged = jest.fn();
  const view = render(<Host entries={entries} onChanged={onChanged} />);
  return { onChanged, user: userEvent.setup(), ...view };
}

async function openDialog(user: ReturnType<typeof userEvent.setup>, batchId = 'batch-a') {
  await user.click(screen.getByTestId(`revert-submission-${batchId}`));
  return screen.findByRole('alertdialog');
}

beforeEach(async () => {
  mockRevert.mockReset();
  mockShowToast.mockReset();
  await i18n.changeLanguage('en');
  ({ useRevertSubmission } = (await import('./useRevertSubmission.js')) as typeof HookModule);
  ({ ApiClientError, NetworkError } =
    (await import('../../lib/apiClient.js')) as typeof ApiClientModule);
});

describe('useRevertSubmission: the row button', () => {
  it('appears only on an unreverted submission batch row', () => {
    setup([
      entry('a', {}),
      entry('reverted', { reverted: true }),
      entry('revert-row', { kind: 'revert' }),
      entry('plain', null),
    ]);

    expect(screen.getByTestId('revert-submission-batch-a')).toHaveTextContent('Revert submission');
    expect(screen.queryByTestId('revert-submission-batch-reverted')).toBeNull();
    expect(screen.queryByTestId('revert-submission-batch-revert-row')).toBeNull();
    expect(within(screen.getByTestId('row-plain')).queryByRole('button')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('names the batch and its date in the accessible name, singular and plural', () => {
    setup([entry('a', {}), entry('one', { invoiceCount: 1 })]);

    expect(screen.getByTestId('revert-submission-batch-a')).toHaveAccessibleName(
      'Revert submission of 2 invoices submitted on D(2026-03-10)',
    );
    expect(screen.getByTestId('revert-submission-batch-one')).toHaveAccessibleName(
      'Revert submission of 1 invoice submitted on D(2026-03-10)',
    );
  });
});

describe('useRevertSubmission: the dialog', () => {
  it('is closed until a button is pressed, then asks with the batch figures', async () => {
    const { user } = setup([entry('a', {})]);
    expect(screen.queryByRole('alertdialog')).toBeNull();

    const dialog = await openDialog(user);

    expect(within(dialog).getByText('Revert submission of 2 invoices?')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Submitted on D(2026-03-10). Total EUR 300.00. Each invoice returns to the status it had before.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('revert-submission-confirm')).toHaveTextContent('Revert submission');
    expect(screen.getByTestId('revert-submission-cancel')).toHaveTextContent('Keep submission');
    expect(screen.getByTestId('revert-submission-cancel')).toHaveFocus();
  });

  it('uses the lead without a total when the batch has no amount', async () => {
    const { user } = setup([entry('a', { amount: null })]);
    const dialog = await openDialog(user);
    expect(
      within(dialog).getByText(
        'Submitted on D(2026-03-10). Each invoice returns to the status it had before.',
      ),
    ).toBeInTheDocument();
  });

  it('lists only the consequences that are not zero', async () => {
    const { user } = setup([
      entry('a', { invoicesFrom: { pending: 3, paid: 0 }, progressPaymentCount: 2 }),
    ]);
    await openDialog(user);

    const list = screen.getByTestId('revert-submission-consequences');
    expect(within(list).getByText(/Invoices that go back to To pay/)).toHaveTextContent('3');
    expect(within(list).getByText(/Progress payments that go back/)).toHaveTextContent('2');
    expect(within(list).queryByText(/go back to Paid/)).toBeNull();
  });

  it('lists the Paid consequence when invoices were paid', async () => {
    const { user } = setup([entry('a', { invoicesFrom: { pending: 0, paid: 4 } })]);
    await openDialog(user);
    const list = screen.getByTestId('revert-submission-consequences');
    expect(within(list).getByText(/Invoices that go back to Paid/)).toHaveTextContent('4');
    expect(within(list).queryByText(/go back to To pay/)).toBeNull();
  });

  it('shows no consequence list when every count is zero', async () => {
    const { user } = setup([entry('a', { invoicesFrom: { pending: 0, paid: 0 } })]);
    await openDialog(user);
    expect(screen.queryByTestId('revert-submission-consequences')).toBeNull();
  });

  it('Keep submission closes it without calling the API or reloading', async () => {
    const { user, onChanged } = setup([entry('a', {})]);
    await openDialog(user);

    await user.click(screen.getByTestId('revert-submission-cancel'));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mockRevert).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe('useRevertSubmission: confirming', () => {
  it.each([
    [2, 'Submission reverted. 2 invoices are back to To pay or Paid.'],
    [1, 'Submission reverted. 1 invoice is back to To pay or Paid.'],
    [0, 'Submission reverted.'],
  ])('with %i restored invoices: toast, reload and focus on the page heading', async (n, text) => {
    mockRevert.mockResolvedValue({
      batchId: 'r',
      restoredInvoiceIds: Array.from({ length: n }, (_, i) => `i${i}`),
      restoredDepositIds: n === 0 ? ['d1'] : [],
    });
    const { user, onChanged } = setup([entry('a', {})]);
    await openDialog(user);

    await user.click(screen.getByTestId('revert-submission-confirm'));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mockRevert).toHaveBeenCalledWith('batch-a');
    expect(mockShowToast).toHaveBeenCalledWith('info', text);
    expect(onChanged).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'History' })).toHaveFocus());
  });

  it('shows Reverting… while the request is pending and ignores a second press', async () => {
    let resolve!: (v: RevertSubmissionResponse) => void;
    mockRevert.mockReturnValue(new Promise((r) => (resolve = r)));
    const { user } = setup([entry('a', {})]);
    await openDialog(user);

    await user.click(screen.getByTestId('revert-submission-confirm'));
    expect(screen.getByTestId('revert-submission-confirm')).toHaveTextContent('Reverting…');
    await user.click(screen.getByTestId('revert-submission-confirm'));
    expect(mockRevert).toHaveBeenCalledTimes(1);

    resolve({ batchId: 'r', restoredInvoiceIds: [], restoredDepositIds: [] });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it.each([
    ['SUBMISSION_ALREADY_REVERTED', 'This submission was already reverted.'],
    ['SUBMISSION_CHANGED', "Some invoices changed since the submission, so it can't be reverted."],
    ['NOT_FOUND', 'The requested resource was not found.'],
  ])('%s shows its text, hides the action, and reloads the feed on close', async (code, text) => {
    mockRevert.mockRejectedValue(new ApiClientError(409, { code, message: 'x' } as never));
    const { user, onChanged } = setup([entry('a', {})]);
    await openDialog(user);

    await user.click(screen.getByTestId('revert-submission-confirm'));

    const dialog = await screen.findByRole('alertdialog');
    expect(await within(dialog).findByText(text)).toBeInTheDocument();
    expect(screen.queryByTestId('revert-submission-confirm')).toBeNull();
    expect(onChanged).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('revert-submission-cancel'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('another API error keeps the action available and does not reload on close', async () => {
    mockRevert.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' } as never),
    );
    const { user, onChanged } = setup([entry('a', {})]);
    await openDialog(user);

    await user.click(screen.getByTestId('revert-submission-confirm'));

    expect(
      await screen.findByText('An unexpected error occurred. Please try again.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('revert-submission-confirm')).toBeInTheDocument();
    await user.click(screen.getByTestId('revert-submission-cancel'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('a network error says the server cannot be reached and allows another try', async () => {
    mockRevert.mockRejectedValueOnce(new NetworkError('offline', null));
    mockRevert.mockResolvedValueOnce({
      batchId: 'r',
      restoredInvoiceIds: ['i'],
      restoredDepositIds: [],
    });
    const { user, onChanged } = setup([entry('a', {})]);
    await openDialog(user);

    await user.click(screen.getByTestId('revert-submission-confirm'));
    expect(
      await screen.findByText("Can't reach the server. Check your connection and try again."),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId('revert-submission-confirm'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('an unknown failure shows the generic revert message', async () => {
    mockRevert.mockRejectedValue(new Error('boom'));
    const { user } = setup([entry('a', {})]);
    await openDialog(user);

    await user.click(screen.getByTestId('revert-submission-confirm'));

    expect(
      await screen.findByText('Reverting the submission failed. Please try again.'),
    ).toBeInTheDocument();
  });
});
