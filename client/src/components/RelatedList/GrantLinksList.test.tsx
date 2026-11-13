/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { SubsidyProgram } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { ToastView } from '../../test/toastView.js';
import { ToastProvider } from '../Toast/ToastContext.js';
import type * as SubsidyApiTypes from '../../lib/subsidyProgramsApi.js';
import type * as UndoApiTypes from '../../lib/undoApi.js';
import type * as ListModule from './GrantLinksList.js';

const mockFetchPrograms = jest.fn<typeof SubsidyApiTypes.fetchSubsidyPrograms>();
const mockUndoChange = jest.fn<typeof UndoApiTypes.undoChange>();
jest.unstable_mockModule('../../lib/subsidyProgramsApi.js', () => ({
  fetchSubsidyPrograms: mockFetchPrograms,
}));
jest.unstable_mockModule('../../lib/undoApi.js', () => ({ undoChange: mockUndoChange }));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let List: typeof ListModule;
const mockFetchGrants = jest.fn<() => Promise<SubsidyProgram[]>>();
const mockLink = jest.fn<(grantId: string) => Promise<unknown>>();
const mockUnlink = jest.fn<(grantId: string) => Promise<never>>();
const refresh = jest.fn<() => Promise<void>>();
const ORIGIN = { origin: { to: '/project/work-items/wi-1?tab=cost', name: 'Pour slab' } };
const UNDO = { token: 'tok-1', expiresAt: '2026-01-01T00:00:30Z' };
const LABELS = {
  title: 'Grants',
  empty: 'No grant covers this.',
  add: 'Add',
  loadError: 'Could not load the list.',
  linkError: 'Could not add it.',
};

const grant = (id: string, over: Partial<SubsidyProgram> = {}): SubsidyProgram =>
  ({
    id,
    name: `Grant ${id}`,
    reductionType: 'percentage',
    reductionValue: 15,
    applicationStatus: 'approved',
    ...over,
  }) as SubsidyProgram;

function renderList(revision = 0) {
  const view = (rev: number) => (
    <ToastProvider>
      <MemoryRouter>
        <List.GrantLinksList
          revision={rev}
          load={mockFetchGrants}
          link={mockLink}
          unlink={mockUnlink}
          onChanged={refresh}
          labels={LABELS}
          linkState={ORIGIN}
          testId="task-grants"
        />
        <ToastView />
      </MemoryRouter>
    </ToastProvider>
  );
  const result = render(view(revision));
  return { ...result, setRevision: (rev: number) => result.rerender(view(rev)) };
}

describe('GrantLinksList', () => {
  beforeEach(async () => {
    for (const mock of [
      mockFetchGrants,
      mockLink,
      mockUnlink,
      mockFetchPrograms,
      mockUndoChange,
      refresh,
    ]) {
      mock.mockReset();
    }
    mockFetchGrants.mockResolvedValue([
      grant('g1'),
      grant('g2', { reductionType: 'fixed', reductionValue: 500 }),
    ]);
    mockFetchPrograms.mockResolvedValue({
      subsidyPrograms: [grant('g1'), grant('g2'), grant('g3', { name: 'Heat pump grant' })],
    } as never);
    mockUnlink.mockResolvedValue({ undo: UNDO } as never);
    mockLink.mockResolvedValue({});
    mockUndoChange.mockResolvedValue({} as never);
    refresh.mockResolvedValue(undefined);
    if (!List) List = await import('./GrantLinksList.js');
  });

  it('exports the list as the default too', () => {
    expect(List.default).toBe(List.GrantLinksList);
  });

  it('lists the grants with their reduction and status', async () => {
    renderList();
    expect(await screen.findByTestId('task-grants-row-g1')).toHaveTextContent('Grant g1');
    expect(screen.getByTestId('task-grants-row-g1')).toHaveTextContent('15% reduction');
    expect(screen.getByTestId('task-grants-row-g2')).toHaveTextContent(/500/);
    expect(screen.getByTestId('task-grants-row-g2')).toHaveTextContent('reduction');
    expect(screen.getByTestId('task-grants-link-g1')).toHaveAttribute(
      'href',
      '/budget/financing/grants/g1',
    );
  });

  it('shows the empty sentence without grants', async () => {
    mockFetchGrants.mockResolvedValue([]);
    renderList();
    expect(await screen.findByText('No grant covers this.')).toBeInTheDocument();
    expect(screen.queryByTestId('task-grants-row-g1')).toBeNull();
  });

  it('reloads the grants when the revision changes', async () => {
    const { setRevision } = renderList();
    await screen.findByTestId('task-grants-row-g1');
    setRevision(1);
    await waitFor(() => expect(mockFetchGrants).toHaveBeenCalledTimes(2));
  });

  describe('load failure', () => {
    it('shows the translated message with Try again, which loads again', async () => {
      mockFetchGrants.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
      );
      renderList();
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByTestId('task-grants-row-g1')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('uses the fallback sentence for a non-API failure', async () => {
      mockFetchGrants.mockRejectedValueOnce(new Error('down'));
      renderList();
      expect(await screen.findByRole('alert')).toHaveTextContent(/.+/);
    });

    it('ignores a response that arrives after unmount', async () => {
      let resolve!: (value: SubsidyProgram[]) => void;
      mockFetchGrants.mockReturnValueOnce(new Promise((res) => (resolve = res)));
      const { unmount } = renderList();
      unmount();
      await act(async () => resolve([grant('g1')]));
    });

    it('ignores a failure that arrives after unmount', async () => {
      let reject!: (error: unknown) => void;
      mockFetchGrants.mockReturnValueOnce(new Promise((_res, rej) => (reject = rej)));
      const { unmount } = renderList();
      unmount();
      await act(async () => reject(new Error('late')));
    });
  });

  describe('link a grant', () => {
    async function openPicker() {
      await screen.findByTestId('task-grants-row-g1');
      fireEvent.click(screen.getByTestId('task-grants-add'));
      return screen.findByRole('textbox');
    }

    it('offers only the grants not yet linked, links the pick, reloads and refreshes, then closes the picker', async () => {
      const user = userEvent.setup();
      renderList();
      const input = await openPicker();
      await user.click(input);
      expect(await screen.findByRole('option', { name: /Heat pump grant/ })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /Grant g1/ })).toBeNull();
      mockFetchGrants.mockResolvedValue([grant('g1'), grant('g2'), grant('g3')]);
      await user.click(screen.getByRole('option', { name: /Heat pump grant/ }));
      await waitFor(() => expect(mockLink).toHaveBeenCalledWith('g3'));
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      expect(await screen.findByTestId('task-grants-row-g3')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    });

    it('shows a 409 as the translated error and keeps the picker open', async () => {
      const user = userEvent.setup();
      mockLink.mockRejectedValueOnce(new ApiClientError(409, { code: 'CONFLICT', message: 'x' }));
      renderList();
      const input = await openPicker();
      await user.click(input);
      await user.click(await screen.findByRole('option', { name: /Heat pump grant/ }));
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(refresh).not.toHaveBeenCalled();
    });

    it('falls back to the link error sentence for a failure without a code', async () => {
      const user = userEvent.setup();
      mockLink.mockRejectedValueOnce(new Error('network'));
      renderList();
      const input = await openPicker();
      await user.click(input);
      await user.click(await screen.findByRole('option', { name: /Heat pump grant/ }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/.+/);
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('clears the earlier error on the next pick', async () => {
      const user = userEvent.setup();
      mockLink.mockRejectedValueOnce(new Error('network'));
      renderList();
      const input = await openPicker();
      await user.click(input);
      await user.click(await screen.findByRole('option', { name: /Heat pump grant/ }));
      await screen.findByRole('alert');
      await user.click(screen.getByRole('textbox'));
      await user.click(await screen.findByRole('option', { name: /Heat pump grant/ }));
      await waitFor(() => expect(mockLink).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    });
  });

  describe('remove a grant', () => {
    it('unlinks it, reloads, refreshes and offers Undo', async () => {
      renderList();
      await screen.findByTestId('task-grants-row-g1');
      fireEvent.click(screen.getByTestId('task-grants-actions-g1'));
      mockFetchGrants.mockResolvedValue([grant('g2')]);
      await act(async () => {
        fireEvent.click(await screen.findByTestId('task-grants-remove-g1'));
      });
      expect(mockUnlink).toHaveBeenCalledWith('g1');
      expect(refresh).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.queryByTestId('task-grants-row-g1')).toBeNull());
      mockFetchGrants.mockResolvedValue([grant('g1'), grant('g2')]);
      await act(async () => {
        fireEvent.click(await screen.findByTestId('toast-undo'));
      });
      expect(mockUndoChange).toHaveBeenCalledWith('tok-1');
      expect(await screen.findByTestId('task-grants-row-g1')).toBeInTheDocument();
      expect(refresh).toHaveBeenCalledTimes(2);
    });
  });
});
