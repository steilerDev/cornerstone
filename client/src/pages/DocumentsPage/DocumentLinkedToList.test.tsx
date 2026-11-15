/**
 * @jest-environment jsdom
 *
 * "Linked to" of the Documents page panel (#2252): every link of the document across the five
 * kinds, Unlink with Undo, and "Link to…" for tasks and purchases with inline refusals.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { DocumentLinkWithEntity } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import { makeLinkWithEntity, plainEntity } from '../../test/documentsPageFixtures.js';
import { ToastView } from '../../test/toastView.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import type * as DocumentLinksApiTypes from '../../lib/documentLinksApi.js';
import type * as SearchApiTypes from '../../lib/searchApi.js';
import type * as UndoApiTypes from '../../lib/undoApi.js';
import type * as ListModule from './DocumentLinkedToList.js';

const mockListForDocument = jest.fn<typeof DocumentLinksApiTypes.listDocumentLinksForDocument>();
const mockCreateLink = jest.fn<typeof DocumentLinksApiTypes.createDocumentLink>();
const mockDeleteLink = jest.fn<typeof DocumentLinksApiTypes.deleteDocumentLink>();
const mockListAllLinkedIds = jest.fn<typeof DocumentLinksApiTypes.listAllLinkedDocumentIds>();
const mockSearchEverywhere = jest.fn<typeof SearchApiTypes.searchEverywhere>();
const mockUndoChange = jest.fn<typeof UndoApiTypes.undoChange>();

jest.unstable_mockModule('../../lib/documentLinksApi.js', () => ({
  listDocumentLinksForDocument: mockListForDocument,
  createDocumentLink: mockCreateLink,
  deleteDocumentLink: mockDeleteLink,
  listAllLinkedDocumentIds: mockListAllLinkedIds,
}));
jest.unstable_mockModule('../../lib/searchApi.js', () => ({
  searchEverywhere: mockSearchEverywhere,
}));
jest.unstable_mockModule('../../lib/undoApi.js', () => ({ undoChange: mockUndoChange }));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let List: typeof ListModule;
const onLinksChanged = jest.fn<() => void>();
const UNDO = { token: 'tok-1', expiresAt: '2026-01-01T00:00:30Z' };

const WORK_ITEM_LINK = makeLinkWithEntity(
  'l-task',
  'work_item',
  'w1',
  plainEntity('Frame the roof'),
);
const PURCHASE_LINK = makeLinkWithEntity(
  'l-buy',
  'household_item',
  'h1',
  plainEntity('Sample oven'),
);
const INVOICE_LINK = makeLinkWithEntity('l-inv', 'invoice', 'inv-1', {
  title: 'RE-2026-14',
  vendorName: 'Sample Roofing',
  invoiceStatus: 'paid',
});
const OFFER_LINK = makeLinkWithEntity('l-offer', 'invoice', 'inv-2', {
  title: null,
  vendorName: 'Sample Plumbing',
  invoiceStatus: 'quotation',
});
const SOURCE_LINK = makeLinkWithEntity('l-src', 'budget_source', 's1', plainEntity('Sample loan'));
const GRANT_LINK = makeLinkWithEntity(
  'l-grant',
  'subsidy_program',
  'g1',
  plainEntity('Sample grant'),
);
const GONE_LINK = makeLinkWithEntity('l-gone', 'work_item', 'w-gone', null);

function renderList(documentId = 7) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/documents?doc=7']}>
        <OriginProbe />
        <List.DocumentLinkedToList
          paperlessDocumentId={documentId}
          onLinksChanged={onLinksChanged}
        />
        <ToastView />
      </MemoryRouter>
    </ToastProvider>,
  );
}

const rowOf = (id: string) => screen.getByTestId(`documents-library-linked-to-row-${id}`);

async function listed(links: DocumentLinkWithEntity[]) {
  mockListForDocument.mockResolvedValue(links);
  const view = renderList();
  await screen.findByRole('heading', { level: 3 });
  await waitFor(() => expect(screen.queryByLabelText(/loading/i)).toBeNull());
  return view;
}

/** Opens the Link to… picker and types, since the picker offers nothing below two characters. */
async function openAndSearch(query = 'Sa') {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Link to…' }));
  const input = await screen.findByRole('textbox');
  await user.click(input);
  await user.type(input, query);
  return user;
}

async function unlink(id: string) {
  fireEvent.click(screen.getByTestId(`documents-library-linked-to-actions-${id}`));
  const item = await screen.findByTestId(`documents-library-linked-to-remove-${id}`);
  await act(async () => {
    fireEvent.click(item);
  });
}

describe('DocumentLinkedToList', () => {
  beforeEach(async () => {
    for (const mock of [
      mockListForDocument,
      mockCreateLink,
      mockDeleteLink,
      mockListAllLinkedIds,
      mockSearchEverywhere,
      mockUndoChange,
      onLinksChanged,
    ]) {
      mock.mockReset();
    }
    mockListForDocument.mockResolvedValue([]);
    mockListAllLinkedIds.mockResolvedValue([]);
    mockDeleteLink.mockResolvedValue({ undo: UNDO });
    mockUndoChange.mockResolvedValue({} as never);
    mockCreateLink.mockResolvedValue({
      id: 'new-link',
      entityType: 'work_item',
      entityId: 'w20',
      paperlessDocumentId: 7,
      attachmentType: null,
      createdBy: null,
      createdAt: '2026-02-06T09:00:00Z',
    });
    mockSearchEverywhere.mockResolvedValue({
      query: 'Sa',
      groups: [
        {
          type: 'work_item',
          items: [
            { id: 'w1', label: 'Frame the roof' },
            { id: 'w20', label: 'Lay floor' },
          ],
        },
        {
          type: 'household_item',
          items: [
            { id: 'h1', label: 'Sample oven' },
            { id: 'h20', label: 'Sample lamp' },
          ],
        },
      ],
    } as never);
    if (!List) List = await import('./DocumentLinkedToList.js');
  });

  it('exports the list as the default too', () => {
    expect(List.default).toBe(List.DocumentLinkedToList);
  });

  describe('loading and states', () => {
    it('shows an h3 "Linked to" heading without a count while the links load', () => {
      mockListForDocument.mockReturnValue(new Promise(() => undefined));
      renderList();

      expect(screen.getByRole('heading', { level: 3, name: 'Linked to' })).toBeInTheDocument();
      expect(screen.queryByText('Not linked to anything yet.')).toBeNull();
    });

    it('loads the links of the document it is given', async () => {
      await listed([WORK_ITEM_LINK]);

      expect(mockListForDocument).toHaveBeenCalledWith(7);
      expect(mockListForDocument).toHaveBeenCalledTimes(1);
    });

    it('says the document is not linked to anything, with a Link to… action', async () => {
      await listed([]);

      expect(screen.getByText('Not linked to anything yet.')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Link to…' })).toBeVisible();
    });

    it('shows the count in the heading', async () => {
      await listed([WORK_ITEM_LINK, PURCHASE_LINK]);

      expect(screen.getByRole('heading', { level: 3, name: 'Linked to (2)' })).toBeInTheDocument();
    });

    it('shows the translated load failure and Try again reloads', async () => {
      mockListForDocument.mockRejectedValueOnce(new Error('boom'));
      renderList();

      expect(await screen.findByText('The links could not be loaded.')).toBeVisible();
      expect(screen.queryByText('boom')).toBeNull();
      mockListForDocument.mockResolvedValue([WORK_ITEM_LINK]);
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByText('Frame the roof')).toBeVisible();
      expect(screen.queryByText('The links could not be loaded.')).toBeNull();
      expect(mockListForDocument).toHaveBeenCalledTimes(2);
    });

    it('starts over from a loading list when the document changes', async () => {
      mockListForDocument.mockResolvedValueOnce([WORK_ITEM_LINK]);
      const view = render(
        <ToastProvider>
          <MemoryRouter>
            <List.DocumentLinkedToList paperlessDocumentId={7} onLinksChanged={onLinksChanged} />
          </MemoryRouter>
        </ToastProvider>,
      );
      expect(await screen.findByText('Frame the roof')).toBeVisible();

      mockListForDocument.mockReturnValueOnce(new Promise(() => undefined));
      view.rerender(
        <ToastProvider>
          <MemoryRouter>
            <List.DocumentLinkedToList paperlessDocumentId={8} onLinksChanged={onLinksChanged} />
          </MemoryRouter>
        </ToastProvider>,
      );

      expect(screen.queryByText('Frame the roof')).toBeNull();
      await waitFor(() => expect(mockListForDocument).toHaveBeenLastCalledWith(8));
    });

    it('ignores a response that arrives after unmount', async () => {
      let resolve: (links: DocumentLinkWithEntity[]) => void = () => undefined;
      mockListForDocument.mockReturnValue(new Promise((r) => (resolve = r)));
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const view = renderList();
      view.unmount();

      resolve([WORK_ITEM_LINK]);
      await Promise.resolve();

      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('ignores a failure that arrives after unmount', async () => {
      let reject: (e: Error) => void = () => undefined;
      mockListForDocument.mockReturnValue(new Promise((_, r) => (reject = r)));
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const view = renderList();
      view.unmount();

      reject(new Error('late'));
      await Promise.resolve();

      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('rows', () => {
    it('lists the links of all five kinds with their kind words and titles', async () => {
      await listed([WORK_ITEM_LINK, PURCHASE_LINK, INVOICE_LINK, SOURCE_LINK, GRANT_LINK]);

      expect(rowOf('l-task')).toHaveTextContent('Frame the roof');
      expect(rowOf('l-task')).toHaveTextContent('Task');
      expect(rowOf('l-buy')).toHaveTextContent('Sample oven');
      expect(rowOf('l-buy')).toHaveTextContent('Purchase');
      expect(rowOf('l-inv')).toHaveTextContent('Sample Roofing · RE-2026-14');
      expect(rowOf('l-inv')).toHaveTextContent('Invoice');
      expect(rowOf('l-src')).toHaveTextContent('Sample loan');
      expect(rowOf('l-src')).toHaveTextContent('Funding source');
      expect(rowOf('l-grant')).toHaveTextContent('Sample grant');
      expect(rowOf('l-grant')).toHaveTextContent('Grant');
    });

    it('titles an offer without a number by the company and the offer noun', async () => {
      await listed([OFFER_LINK]);

      expect(rowOf('l-offer')).toHaveTextContent('Sample Plumbing · Offer');
    });

    it('links each row to the page of its record', async () => {
      await listed([WORK_ITEM_LINK, PURCHASE_LINK, INVOICE_LINK, SOURCE_LINK, GRANT_LINK]);

      const hrefs = Object.fromEntries(
        ['l-task', 'l-buy', 'l-inv', 'l-src', 'l-grant'].map((id) => [
          id,
          within(rowOf(id)).getByRole('link').getAttribute('href'),
        ]),
      );
      expect(hrefs).toEqual({
        'l-task': '/project/work-items/w1',
        'l-buy': '/project/household-items/h1',
        'l-inv': '/budget/invoices/inv-1',
        'l-src': '/budget/financing/sources/s1',
        'l-grant': '/budget/financing/grants/g1',
      });
    });

    it('carries the origin (this page) when a row link is opened', async () => {
      await listed([WORK_ITEM_LINK]);

      fireEvent.click(within(rowOf('l-task')).getByRole('link'));

      expect(probedPath()).toBe('/project/work-items/w1');
      expect(probedOrigin()).toMatchObject({ to: '/documents?doc=7' });
    });

    it('shows a record that no longer exists as plain text, not a link, and keeps it removable', async () => {
      await listed([GONE_LINK]);

      const row = rowOf('l-gone');
      expect(row).toHaveTextContent('Record no longer exists');
      expect(row).toHaveTextContent('Task');
      expect(within(row).queryByRole('link')).toBeNull();
      expect(screen.getByTestId('documents-library-linked-to-actions-l-gone')).toBeInTheDocument();
    });

    it('unlinks a record that no longer exists', async () => {
      await listed([GONE_LINK]);
      mockListForDocument.mockResolvedValue([]);

      await unlink('l-gone');

      expect(mockDeleteLink).toHaveBeenCalledWith('l-gone');
      await waitFor(() =>
        expect(screen.queryByTestId('documents-library-linked-to-row-l-gone')).toBeNull(),
      );
    });
  });

  describe('unlink', () => {
    it('labels the row action "Unlink", not "Remove"', async () => {
      await listed([WORK_ITEM_LINK]);

      fireEvent.click(screen.getByTestId('documents-library-linked-to-actions-l-task'));

      expect(screen.getByRole('menuitem', { name: 'Unlink' })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'Remove' })).toBeNull();
    });

    it('deletes the link, reloads the list, tells the page and shows "Unlinked from <title>" with Undo', async () => {
      await listed([WORK_ITEM_LINK, PURCHASE_LINK]);
      mockListForDocument.mockResolvedValue([PURCHASE_LINK]);

      await unlink('l-task');

      expect(mockDeleteLink).toHaveBeenCalledWith('l-task');
      await waitFor(() =>
        expect(screen.queryByTestId('documents-library-linked-to-row-l-task')).toBeNull(),
      );
      expect(rowOf('l-buy')).toBeInTheDocument();
      expect(onLinksChanged).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('toasts')).toHaveTextContent('Unlinked from Frame the roof');
      expect(screen.getByTestId('toast-undo')).toBeInTheDocument();
    });

    it('names the unlinked row by its invoice title in the toast', async () => {
      await listed([INVOICE_LINK]);
      mockListForDocument.mockResolvedValue([]);

      await unlink('l-inv');

      expect(screen.getByTestId('toasts')).toHaveTextContent(
        'Unlinked from Sample Roofing · RE-2026-14',
      );
    });

    it('Undo restores the link: undoChange with the token, a reload and the page told again', async () => {
      await listed([WORK_ITEM_LINK]);
      mockListForDocument.mockResolvedValue([]);
      await unlink('l-task');
      expect(onLinksChanged).toHaveBeenCalledTimes(1);
      mockListForDocument.mockResolvedValue([WORK_ITEM_LINK]);

      await act(async () => {
        fireEvent.click(screen.getByTestId('toast-undo'));
      });

      expect(mockUndoChange).toHaveBeenCalledWith('tok-1');
      await waitFor(() =>
        expect(screen.getByTestId('documents-library-linked-to-row-l-task')).toBeInTheDocument(),
      );
      expect(onLinksChanged).toHaveBeenCalledTimes(2);
    });

    it('keeps the row, shows the removal failure and does not tell the page when the delete fails', async () => {
      await listed([WORK_ITEM_LINK]);
      mockDeleteLink.mockRejectedValueOnce(new Error('boom'));

      await unlink('l-task');

      expect(
        await screen.findByText('Frame the roof could not be removed. Try again.'),
      ).toBeVisible();
      expect(rowOf('l-task')).toBeInTheDocument();
      expect(onLinksChanged).not.toHaveBeenCalled();
      expect(screen.queryByTestId('toast-undo')).toBeNull();
    });
  });

  describe('Link to…', () => {
    it('searches tasks and purchases together', async () => {
      await listed([]);
      await openAndSearch();

      await screen.findByRole('option', { name: /Lay floor/ });
      expect(mockSearchEverywhere.mock.calls[0]![0]).toMatchObject({
        types: ['work_item', 'household_item'],
      });
    });

    it('does not offer the tasks and purchases this document is already linked to', async () => {
      await listed([WORK_ITEM_LINK, PURCHASE_LINK]);
      await openAndSearch();

      expect(await screen.findByRole('option', { name: /Lay floor/ })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Sample lamp/ })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /Frame the roof/ })).toBeNull();
      expect(screen.queryByRole('option', { name: /Sample oven/ })).toBeNull();
    });

    it('still offers a task when the document is linked to a different kind with the same id', async () => {
      await listed([
        makeLinkWithEntity('l-src', 'budget_source', 'w1', plainEntity('Sample loan')),
      ]);
      await openAndSearch();

      expect(await screen.findByRole('option', { name: /Frame the roof/ })).toBeInTheDocument();
    });

    it('links a task: creates the link, reloads, tells the page, closes the picker and shows "Linked to <title>"', async () => {
      await listed([WORK_ITEM_LINK]);
      const user = await openAndSearch();
      mockListForDocument.mockResolvedValue([
        WORK_ITEM_LINK,
        makeLinkWithEntity('new-link', 'work_item', 'w20', plainEntity('Lay floor')),
      ]);

      await user.click(await screen.findByRole('option', { name: /Lay floor/ }));

      await waitFor(() =>
        expect(mockCreateLink).toHaveBeenCalledWith({
          entityType: 'work_item',
          entityId: 'w20',
          paperlessDocumentId: 7,
        }),
      );
      expect(mockCreateLink).toHaveBeenCalledTimes(1);
      expect(
        await screen.findByTestId('documents-library-linked-to-row-new-link'),
      ).toBeInTheDocument();
      expect(onLinksChanged).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
      expect(screen.getByTestId('toasts')).toHaveTextContent('Linked to Lay floor');
    });

    it('links a purchase with the household_item kind', async () => {
      await listed([WORK_ITEM_LINK]);
      const user = await openAndSearch();
      mockCreateLink.mockResolvedValue({
        id: 'new-buy',
        entityType: 'household_item',
        entityId: 'h20',
        paperlessDocumentId: 7,
        attachmentType: null,
        createdBy: null,
        createdAt: '2026-02-06T09:00:00Z',
      });

      await user.click(await screen.findByRole('option', { name: /Sample lamp/ }));

      await waitFor(() =>
        expect(mockCreateLink).toHaveBeenCalledWith({
          entityType: 'household_item',
          entityId: 'h20',
          paperlessDocumentId: 7,
        }),
      );
      expect(screen.getByTestId('toasts')).toHaveTextContent('Linked to Sample lamp');
    });

    it('Undo of a new link deletes exactly that link, reloads and tells the page', async () => {
      await listed([WORK_ITEM_LINK]);
      const user = await openAndSearch();
      await user.click(await screen.findByRole('option', { name: /Lay floor/ }));
      await screen.findByTestId('toast-undo');
      expect(onLinksChanged).toHaveBeenCalledTimes(1);
      mockListForDocument.mockResolvedValue([WORK_ITEM_LINK]);

      await act(async () => {
        fireEvent.click(screen.getByTestId('toast-undo'));
      });

      await waitFor(() => expect(mockDeleteLink).toHaveBeenCalledWith('new-link'));
      expect(mockDeleteLink).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(onLinksChanged).toHaveBeenCalledTimes(2));
      expect(mockUndoChange).not.toHaveBeenCalled();
    });

    it('shows the server refusal as the translated inline error and keeps the picker open', async () => {
      await listed([WORK_ITEM_LINK]);
      mockCreateLink.mockRejectedValueOnce(
        new ApiClientError(409, { code: 'DUPLICATE_DOCUMENT_LINK', message: 'raw server text' }),
      );
      const user = await openAndSearch();
      const loadsBefore = mockListForDocument.mock.calls.length;

      await user.click(await screen.findByRole('option', { name: /Lay floor/ }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'This document is already linked.',
      );
      expect(screen.queryByText('raw server text')).toBeNull();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(mockListForDocument.mock.calls.length).toBe(loadsBefore);
      expect(onLinksChanged).not.toHaveBeenCalled();
      expect(screen.queryByTestId('toast-undo')).toBeNull();
    });

    it('falls back to "Couldn\'t link the document. Try again." for a failure without a code', async () => {
      await listed([]);
      mockCreateLink.mockRejectedValueOnce(new Error('network down'));
      const user = await openAndSearch();

      await user.click(await screen.findByRole('option', { name: /Lay floor/ }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        "Couldn't link the document. Try again.",
      );
      expect(onLinksChanged).not.toHaveBeenCalled();
    });

    it('clears the inline error on the next pick', async () => {
      await listed([]);
      mockCreateLink.mockRejectedValueOnce(new Error('network down'));
      const user = await openAndSearch();
      await user.click(await screen.findByRole('option', { name: /Lay floor/ }));
      await screen.findByRole('alert');

      await user.type(screen.getByRole('textbox'), 'Sa');
      await user.click(await screen.findByRole('option', { name: /Sample lamp/ }));

      await waitFor(() => expect(mockCreateLink).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    });

    it('closes the picker with Escape without creating anything', async () => {
      await listed([]);
      const user = await openAndSearch();

      // the first Escape closes the open results, the second the picker
      await user.keyboard('{Escape}');
      await user.keyboard('{Escape}');

      await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
      expect(mockCreateLink).not.toHaveBeenCalled();
    });
  });
});
