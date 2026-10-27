/**
 * @jest-environment jsdom
 */
/**
 * GrantWorkPanel (#2242, MNY-044, AC11, AC13): the tasks and purchases a grant covers.
 *
 * Mutations these tests catch: a row with an Edit button (the share is computed, not stored);
 * Remove calling the task route for a purchase (or the reverse); Remove not reloading and
 * refreshing the page, or Undo not re-linking and refreshing; link sending one request per item
 * instead of one atomic POST; the picker not excluding already-linked items; Link enabled with
 * nothing chosen or while busy; a failed link closing the picker (the error must stay in it);
 * the empty sentence missing the Expected amount.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type {
  GrantCoveredItem,
  GrantCoveredItemsResponse,
  GrantItemRef,
} from '@cornerstone/shared';
import type { EntityOption } from '../../components/EntityPicker/types.js';
import { ApiClientError } from '../../lib/apiClient.js';
import i18n from '../../i18n/index.js';
import * as workItemsApiActual from '../../lib/workItemsApi.js';
import * as householdSubsidiesActual from '../../lib/householdItemSubsidiesApi.js';
import type * as PanelModule from './GrantWorkPanel.js';

const mockFetchItems = jest.fn<(id: string) => Promise<GrantCoveredItemsResponse>>();
const mockLinkItems =
  jest.fn<(id: string, items: readonly GrantItemRef[]) => Promise<GrantCoveredItemsResponse>>();
jest.unstable_mockModule('../../lib/financingApi.js', () => ({
  fetchGrantItems: mockFetchItems,
  linkGrantItems: mockLinkItems,
}));
const mockUnlinkTask = jest.fn<(item: string, grant: string) => Promise<unknown>>();
const mockUnlinkPurchase = jest.fn<(item: string, grant: string) => Promise<unknown>>();
// The picker kinds import more of workItemsApi; keep the rest real.
jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  ...workItemsApiActual,
  unlinkWorkItemSubsidy: mockUnlinkTask,
}));
jest.unstable_mockModule('../../lib/householdItemSubsidiesApi.js', () => ({
  ...householdSubsidiesActual,
  unlinkHouseholdItemSubsidy: mockUnlinkPurchase,
}));
const mockUndo = jest.fn<(token: string) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/undoApi.js', () => ({ undoChange: mockUndo }));
jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useEntriesLanguage: () => 'en',
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

const mockShowToast = jest.fn();
let lastUndoToast: { message: string; onUndo: () => Promise<void> } | null = null;
jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  ToastProvider: ({ children }: { children: unknown }) => children,
  useToast: () => ({
    toasts: [],
    showToast: mockShowToast,
    showUndoToast: (toast: NonNullable<typeof lastUndoToast>) => {
      lastUndoToast = toast;
    },
    dismissToast: jest.fn(),
  }),
}));

interface MultiProps {
  value: readonly EntityOption[];
  onChange: (next: readonly EntityOption[]) => void;
  excludeIds?: readonly string[];
  picker: { kind: string; disabled?: boolean; autoFocus?: boolean };
  removeLabel: (option: EntityOption) => string;
  countLabel: (count: number) => string;
  testId: string;
}
const TASK_OPTION: EntityOption = {
  id: 'work_item:wi-9',
  label: 'Windows',
  itemType: 'work_item',
  entityId: 'wi-9',
};
const PURCHASE_OPTION: EntityOption = {
  id: 'household_item:hi-9',
  label: 'Door',
  itemType: 'household_item',
  entityId: 'hi-9',
};
jest.unstable_mockModule('../../components/EntityPicker/EntityMultiPicker.js', () => ({
  EntityMultiPicker: (props: MultiProps) => (
    <div
      data-testid={props.testId}
      data-kind={props.picker.kind}
      data-disabled={String(props.picker.disabled)}
      data-exclude={(props.excludeIds ?? []).join(',')}
    >
      <span data-testid="count">{props.countLabel(props.value.length)}</span>
      {props.value.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => props.onChange(props.value.filter((o) => o.id !== option.id))}
        >
          {props.removeLabel(option)}
        </button>
      ))}
      <button type="button" onClick={() => props.onChange([...props.value, TASK_OPTION])}>
        pick-task
      </button>
      <button type="button" onClick={() => props.onChange([...props.value, PURCHASE_OPTION])}>
        pick-purchase
      </button>
    </div>
  ),
}));

let GrantWorkPanel: (typeof PanelModule)['GrantWorkPanel'];

const GRANT = 'sp-1';

const item = (over: Partial<GrantCoveredItem> = {}): GrantCoveredItem => ({
  type: 'work_item',
  id: 'wi-1',
  title: 'Roof',
  area: null,
  covered: 1200,
  ...over,
});

const TWO: GrantCoveredItemsResponse = {
  items: [
    item(),
    item({
      type: 'household_item',
      id: 'hi-1',
      title: 'Oven',
      covered: 300.5,
      area: {
        id: 'ar-k',
        name: 'Kitchen',
        color: null,
        ancestors: [{ id: 'ar-h', name: 'House', color: null }],
      } as never,
    }),
  ],
};

const onChanged = jest.fn();

beforeEach(async () => {
  mockFetchItems.mockReset().mockResolvedValue(TWO);
  mockLinkItems.mockReset().mockResolvedValue(TWO);
  mockUnlinkTask.mockReset().mockResolvedValue({ undo: { token: 'tok-t', expiresAt: 'x' } });
  mockUnlinkPurchase.mockReset().mockResolvedValue({ undo: { token: 'tok-p', expiresAt: 'x' } });
  mockUndo.mockReset().mockResolvedValue({});
  mockShowToast.mockReset();
  onChanged.mockReset();
  lastUndoToast = null;
  ({ GrantWorkPanel } = (await import('./GrantWorkPanel.js')) as typeof PanelModule);
});

function renderPanel(
  expectedAmount = 0,
  state: unknown = { origin: { to: '/budget/financing/grants/sp-1' } },
) {
  return render(
    <MemoryRouter>
      <GrantWorkPanel
        grantId={GRANT}
        expectedAmount={expectedAmount}
        onChanged={onChanged}
        originState={state as never}
      />
    </MemoryRouter>,
  );
}

const row = (type: string, id: string) =>
  screen.getByTestId(`grant-covered-items-row-${type}:${id}`);

describe('GrantWorkPanel', () => {
  describe('rows', () => {
    it('lists tasks and purchases with the kind word, the area path and the computed share, linking to each page', async () => {
      renderPanel();
      const task = within(await screen.findByTestId('grant-covered-items-row-work_item:wi-1'));
      const purchase = within(row('household_item', 'hi-1'));

      expect(task.getByRole('link', { name: 'Roof' })).toHaveAttribute(
        'href',
        '/project/work-items/wi-1',
      );
      expect(task.getByText(/Task/)).toBeInTheDocument();
      expect(task.getByText('€1,200.00')).toBeInTheDocument();
      expect(purchase.getByRole('link', { name: 'Oven' })).toHaveAttribute(
        'href',
        '/project/household-items/hi-1',
      );
      expect(purchase.getByText(/Purchase/)).toBeInTheDocument();
      expect(purchase.getByText(/House/)).toBeInTheDocument();
      expect(purchase.getByText(/Kitchen/)).toBeInTheDocument();
      expect(purchase.getByText('€300.50')).toBeInTheDocument();
    });

    it('has no Edit action on any row (the share is computed, not stored)', async () => {
      renderPanel();
      await screen.findByTestId('grant-covered-items-row-work_item:wi-1');
      expect(screen.queryByTestId('grant-covered-items-edit-work_item:wi-1')).toBeNull();
      expect(screen.queryByTestId('grant-covered-items-edit-household_item:hi-1')).toBeNull();
      expect(screen.getByTestId('grant-covered-items-actions-work_item:wi-1')).toBeInTheDocument();
    });

    it('titles the list "Covered items" with the Link tasks / purchases action', async () => {
      renderPanel();
      await screen.findByTestId('grant-covered-items-row-work_item:wi-1');
      expect(screen.getByRole('heading', { name: /Covered items/ })).toBeInTheDocument();
      expect(screen.getByTestId('grant-covered-items-add')).toHaveTextContent(
        'Link tasks / purchases',
      );
    });

    it('shows the empty sentence with the Expected amount and no banner (AC11)', async () => {
      mockFetchItems.mockResolvedValue({ items: [] });
      renderPanel(0);

      expect(
        await screen.findByText(
          'No covered items yet. Expected counts €0.00 until you link tasks or purchases.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('a failed load shows a translated error with Retry that loads again', async () => {
      mockFetchItems.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'raw' }),
      );
      renderPanel();

      const alert = await screen.findByRole('alert');
      expect(alert).not.toHaveTextContent('raw');
      await userEvent.click(screen.getByRole('button', { name: /retry|try again/i }));

      await screen.findByTestId('grant-covered-items-row-work_item:wi-1');
      expect(mockFetchItems).toHaveBeenCalledTimes(2);
    });

    it('a failure that is not an API error shows the fixed copy', async () => {
      mockFetchItems.mockRejectedValueOnce(new Error('offline'));
      renderPanel();
      expect(await screen.findByText('The grant could not be loaded.')).toBeInTheDocument();
    });

    it('ignores a response that arrives after unmount', async () => {
      let resolve: (value: GrantCoveredItemsResponse) => void = () => {};
      mockFetchItems.mockReturnValue(new Promise((res) => (resolve = res)));
      const { unmount, container } = renderPanel();
      unmount();

      resolve(TWO);
      await Promise.resolve();

      expect(container).toBeEmptyDOMElement();
    });

    it('ignores a failure that arrives after unmount', async () => {
      let reject: (error: unknown) => void = () => {};
      mockFetchItems.mockReturnValue(new Promise((_res, rej) => (reject = rej)));
      const { unmount, container } = renderPanel();
      unmount();

      reject(new Error('late'));
      await Promise.resolve();

      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('a language change (#2242)', () => {
    afterEach(async () => {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    });

    it('re-renders without loading the covered items again', async () => {
      renderPanel();
      await screen.findByTestId('grant-covered-items-row-work_item:wi-1');
      const calls = mockFetchItems.mock.calls.length;

      await act(async () => {
        await i18n.changeLanguage('de');
      });

      expect(mockFetchItems).toHaveBeenCalledTimes(calls);
      expect(screen.getByTestId('grant-covered-items-add')).not.toHaveTextContent(
        'Link tasks / purchases',
      );
    });

    it('the load error is translated again in the new language, without a new request', async () => {
      mockFetchItems.mockRejectedValue(new Error('offline'));
      renderPanel();
      expect(await screen.findByText('The grant could not be loaded.')).toBeInTheDocument();
      const calls = mockFetchItems.mock.calls.length;

      await act(async () => {
        await i18n.changeLanguage('de');
      });

      expect(
        screen.getByText('Das Förderprogramm konnte nicht geladen werden.'),
      ).toBeInTheDocument();
      expect(mockFetchItems).toHaveBeenCalledTimes(calls);
    });
  });

  describe('Remove and Undo', () => {
    async function remove(type: string, id: string) {
      const user = userEvent.setup();
      await screen.findByTestId(`grant-covered-items-row-${type}:${id}`);
      await user.click(screen.getByTestId(`grant-covered-items-actions-${type}:${id}`));
      await user.click(await screen.findByTestId(`grant-covered-items-remove-${type}:${id}`));
    }

    it('a task is unlinked through the task route, the list reloads, the page refreshes and Undo is offered', async () => {
      renderPanel();
      mockFetchItems.mockResolvedValue({ items: [TWO.items[1]!] });

      await remove('work_item', 'wi-1');

      await waitFor(() => expect(mockUnlinkTask).toHaveBeenCalledWith('wi-1', GRANT));
      expect(mockUnlinkPurchase).not.toHaveBeenCalled();
      await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(screen.queryByTestId('grant-covered-items-row-work_item:wi-1')).toBeNull(),
      );
      expect(lastUndoToast).not.toBeNull();
    });

    it('a purchase is unlinked through the purchase route', async () => {
      renderPanel();
      await remove('household_item', 'hi-1');

      await waitFor(() => expect(mockUnlinkPurchase).toHaveBeenCalledWith('hi-1', GRANT));
      expect(mockUnlinkTask).not.toHaveBeenCalled();
    });

    it('Undo posts the token, reloads the list and refreshes the page', async () => {
      renderPanel();
      await remove('work_item', 'wi-1');
      await waitFor(() => expect(lastUndoToast).not.toBeNull());
      onChanged.mockClear();
      mockFetchItems.mockClear();

      await lastUndoToast!.onUndo();

      expect(mockUndo).toHaveBeenCalledWith('tok-t');
      expect(mockFetchItems).toHaveBeenCalledWith(GRANT);
      expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it('a failed unlink shows the remove error and no Undo', async () => {
      mockUnlinkTask.mockRejectedValue(new Error('boom'));
      renderPanel();
      await remove('work_item', 'wi-1');

      expect(
        await screen.findByText(/Roof/, { selector: '[role="alert"] *, [role="alert"]' }),
      ).toBeInTheDocument();
      expect(lastUndoToast).toBeNull();
      expect(onChanged).not.toHaveBeenCalled();
    });
  });

  describe('Link tasks / purchases', () => {
    async function openPicker() {
      const user = userEvent.setup();
      await screen.findByTestId('grant-covered-items-row-work_item:wi-1');
      await user.click(screen.getByTestId('grant-covered-items-add'));
      await screen.findByTestId('grant-link-picker');
      return user;
    }
    const submit = () => screen.getByTestId('grant-link-submit');

    it('opens a task / purchase picker that excludes the already linked items', async () => {
      renderPanel();
      await openPicker();

      const picker = screen.getByTestId('grant-link-picker');
      expect(picker).toHaveAttribute('data-kind', 'taskOrPurchase');
      expect(picker).toHaveAttribute('data-exclude', 'work_item:wi-1,household_item:hi-1');
    });

    it('Link is aria-disabled with nothing chosen and does nothing when pressed', async () => {
      renderPanel();
      const user = await openPicker();

      expect(submit()).toHaveAttribute('aria-disabled', 'true');
      expect(submit()).toHaveTextContent('Link 0 items');
      await user.click(submit());

      expect(mockLinkItems).not.toHaveBeenCalled();
    });

    it('the footer counts the chosen items and sends ONE atomic request with { type, id } pairs', async () => {
      mockLinkItems.mockResolvedValue({
        items: [...TWO.items, item({ id: 'wi-9', title: 'Windows' })],
      });
      renderPanel();
      const user = await openPicker();

      await user.click(screen.getByRole('button', { name: 'pick-task' }));
      expect(submit()).toHaveTextContent('Link 1 item');
      expect(submit()).not.toHaveAttribute('aria-disabled');
      await user.click(screen.getByRole('button', { name: 'pick-purchase' }));
      expect(submit()).toHaveTextContent('Link 2 items');
      expect(screen.getByTestId('count')).toHaveTextContent('2 selected');
      await user.click(submit());

      await waitFor(() => expect(mockLinkItems).toHaveBeenCalledTimes(1));
      expect(mockLinkItems).toHaveBeenCalledWith(GRANT, [
        { type: 'work_item', id: 'wi-9' },
        { type: 'household_item', id: 'hi-9' },
      ]);
      await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
      expect(mockShowToast).toHaveBeenCalledWith('success', 'Linked 2 items.');
      await waitFor(() => expect(screen.queryByTestId('grant-link-picker')).toBeNull());
      expect(
        await screen.findByTestId('grant-covered-items-row-work_item:wi-9'),
      ).toBeInTheDocument();
    });

    it('is busy while linking: the picker is disabled and a second press is ignored', async () => {
      let resolve: (value: GrantCoveredItemsResponse) => void = () => {};
      mockLinkItems.mockReturnValue(new Promise((res) => (resolve = res)));
      renderPanel();
      const user = await openPicker();
      await user.click(screen.getByRole('button', { name: 'pick-task' }));

      await user.click(submit());
      await waitFor(() => expect(submit()).toHaveAttribute('aria-disabled', 'true'));
      expect(screen.getByTestId('grant-link-picker')).toHaveAttribute('data-disabled', 'true');
      await user.click(submit());
      expect(mockLinkItems).toHaveBeenCalledTimes(1);

      resolve(TWO);
      await waitFor(() => expect(screen.queryByTestId('grant-link-picker')).toBeNull());
    });

    it('a failed link keeps the picker open with the chosen items and shows the error inside it', async () => {
      mockLinkItems.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'raw' }),
      );
      renderPanel();
      const user = await openPicker();
      await user.click(screen.getByRole('button', { name: 'pick-task' }));
      await user.click(submit());

      const alert = await screen.findByRole('alert');
      expect(
        within(screen.getByTestId('grant-link-picker').parentElement!).getByRole('alert'),
      ).toBe(alert);
      expect(alert).not.toHaveTextContent('raw');
      expect(screen.getByTestId('count')).toHaveTextContent('1 selected');
      expect(onChanged).not.toHaveBeenCalled();
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('a failure that is not an API error shows the fixed copy', async () => {
      mockLinkItems.mockRejectedValue(new Error('offline'));
      renderPanel();
      const user = await openPicker();
      await user.click(screen.getByRole('button', { name: 'pick-task' }));
      await user.click(submit());
      expect(await screen.findByText('The grant could not be loaded.')).toBeInTheDocument();
    });

    it('Cancel closes the picker and clears its error', async () => {
      mockLinkItems.mockRejectedValue(new Error('offline'));
      renderPanel();
      const user = await openPicker();
      await user.click(screen.getByRole('button', { name: 'pick-task' }));
      await user.click(submit());
      await screen.findByRole('alert');

      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByTestId('grant-link-picker')).toBeNull());

      await user.click(screen.getByTestId('grant-covered-items-add'));
      await screen.findByTestId('grant-link-picker');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByTestId('count')).toHaveTextContent('0 selected');
    });

    it('removing a chip lowers the count again', async () => {
      renderPanel();
      const user = await openPicker();
      await user.click(screen.getByRole('button', { name: 'pick-task' }));
      await user.click(screen.getByRole('button', { name: 'Remove Windows' }));
      expect(submit()).toHaveTextContent('Link 0 items');
      fireEvent.click(submit());
      expect(mockLinkItems).not.toHaveBeenCalled();
    });
  });
});
