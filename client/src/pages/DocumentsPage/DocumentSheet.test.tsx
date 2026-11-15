/**
 * @jest-environment jsdom
 *
 * Body of the Documents page side panel (#2252): the document's detail (loaded in full), its
 * states (loading, gone, failed with Try again) and the "Linked to" list below it.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiClientError } from '../../lib/apiClient.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import {
  makeDocumentDetail,
  makeLinkWithEntity,
  plainEntity,
} from '../../test/documentsPageFixtures.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import type * as DocumentLinksApiTypes from '../../lib/documentLinksApi.js';
import type * as PaperlessApiTypes from '../../lib/paperlessApi.js';
import type * as SheetModule from './DocumentSheet.js';

const mockGetDocument = jest.fn<typeof PaperlessApiTypes.getPaperlessDocument>();
jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessDocument: mockGetDocument,
  // the shared pickers imported through the Linked to list read these
  getPaperlessStatus: jest.fn(),
  listPaperlessDocuments: jest.fn(),
  listPaperlessTags: jest.fn(),
  listPaperlessCorrespondents: jest.fn(),
  listPaperlessDocumentTypes: jest.fn(),
  getDocumentPreviewUrl: jest.fn(),
  getDocumentThumbnailUrl: (id: number) => `/api/paperless/documents/${id}/thumb`,
}));

const mockListForDocument = jest.fn<typeof DocumentLinksApiTypes.listDocumentLinksForDocument>();
jest.unstable_mockModule('../../lib/documentLinksApi.js', () => ({
  listDocumentLinksForDocument: mockListForDocument,
  createDocumentLink: jest.fn(),
  deleteDocumentLink: jest.fn(),
  listAllLinkedDocumentIds: jest.fn(),
}));
jest.unstable_mockModule('../../lib/undoApi.js', () => ({ undoChange: jest.fn() }));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let Sheet: typeof SheetModule;
const onUnavailable = jest.fn<() => void>();
const onTitle = jest.fn<(title: string) => void>();
const onLinksChanged = jest.fn<() => void>();

type SheetProps = Partial<SheetModule.DocumentSheetProps>;

function tree(props: SheetProps = {}) {
  return (
    <ToastProvider>
      <MemoryRouter>
        <Sheet.DocumentSheet
          docId={7}
          paperlessUrl="https://paperless.example.test"
          onUnavailable={onUnavailable}
          onTitle={onTitle}
          onLinksChanged={onLinksChanged}
          {...props}
        />
      </MemoryRouter>
    </ToastProvider>
  );
}

beforeEach(async () => {
  for (const mock of [
    mockGetDocument,
    mockListForDocument,
    onUnavailable,
    onTitle,
    onLinksChanged,
  ]) {
    mock.mockReset();
  }
  mockGetDocument.mockResolvedValue({
    document: makeDocumentDetail(7, { title: 'Roof contract', content: 'Synthetic roof text.' }),
  });
  mockListForDocument.mockResolvedValue([]);
  if (!Sheet) Sheet = await import('./DocumentSheet.js');
});

describe('DocumentSheet', () => {
  it('exports the sheet as the default too', () => {
    expect(Sheet.default).toBe(Sheet.DocumentSheet);
  });

  it('shows a loading skeleton, no details and no failure until the document arrives', () => {
    mockGetDocument.mockReturnValue(new Promise(() => undefined));
    render(tree());

    // one skeleton for the details, one for the Linked to list
    expect(screen.getAllByLabelText('Loading...')).toHaveLength(2);
    expect(screen.queryByText('Content Preview')).toBeNull();
    expect(screen.queryByText('This document could not be loaded.')).toBeNull();
    expect(onTitle).not.toHaveBeenCalled();
  });

  it('loads the full document by id and reports its title to the host', async () => {
    render(tree());

    await screen.findByText('Content Preview');

    expect(mockGetDocument).toHaveBeenCalledWith(7);
    expect(onTitle).toHaveBeenCalledWith('Roof contract');
    expect(onTitle).toHaveBeenCalledTimes(1);
  });

  it('shows the details in the sheet layout: content preview, metadata and no title row', async () => {
    render(tree());

    expect(await screen.findByRole('heading', { level: 3, name: 'Content Preview' })).toBeVisible();
    expect(screen.getByText('Synthetic roof text.')).toBeVisible();
    expect(screen.getByText('Sample Roofing Ltd')).toBeVisible();
    // the panel title belongs to the side panel, not the body
    expect(screen.queryByRole('heading', { name: 'Roof contract' })).toBeNull();
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
  });

  it('offers Open in Paperless in a new tab with the document details URL', async () => {
    render(tree());

    const link = await screen.findByRole('link', {
      name: 'Open in Paperless (opens in a new tab)',
    });

    expect(link).toHaveAttribute('href', 'https://paperless.example.test/documents/7/details');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('omits Open in Paperless without a Paperless URL', async () => {
    render(tree({ paperlessUrl: null }));

    await screen.findByText('Content Preview');

    expect(screen.queryByRole('link', { name: /Open in Paperless/ })).toBeNull();
  });

  it('shows the Linked to list of the document under the details', async () => {
    mockListForDocument.mockResolvedValue([
      makeLinkWithEntity('l1', 'work_item', 'w1', plainEntity('Frame the roof')),
    ]);
    render(tree());

    expect(await screen.findByRole('heading', { level: 3, name: 'Linked to (1)' })).toBeVisible();
    expect(await screen.findByText('Frame the roof')).toBeVisible();
    expect(mockListForDocument).toHaveBeenCalledWith(7);
  });

  it('shows the Linked to list while the details are still loading', async () => {
    mockGetDocument.mockReturnValue(new Promise(() => undefined));
    render(tree());

    expect(screen.getByRole('heading', { level: 3, name: /^Linked to/ })).toBeInTheDocument();
    await waitFor(() => expect(mockListForDocument).toHaveBeenCalled());
  });

  describe('a document that is gone (404)', () => {
    beforeEach(() => {
      mockGetDocument.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'raw' }),
      );
    });

    it('tells the host and shows no failure message', async () => {
      render(tree());

      await waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1));
      expect(screen.queryByText('This document could not be loaded.')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Try Again' })).toBeNull();
      expect(onTitle).not.toHaveBeenCalled();
    });
  });

  describe('a failed load', () => {
    it.each([
      ['a network error', new Error('boom')],
      [
        'a server error',
        new ApiClientError(502, { code: 'PAPERLESS_UNREACHABLE', message: 'raw' }),
      ],
      ['a forbidden error', new ApiClientError(403, { code: 'FORBIDDEN', message: 'raw' })],
    ])(
      'shows the translated failure and Try Again after %s, without telling the host it is gone',
      async (_name, error) => {
        mockGetDocument.mockRejectedValue(error);
        render(tree());

        expect(await screen.findByText('This document could not be loaded.')).toBeVisible();
        expect(screen.getByTestId('documents-library-sheet-retry')).toHaveTextContent('Try Again');
        expect(screen.queryByText('raw')).toBeNull();
        expect(onUnavailable).not.toHaveBeenCalled();
      },
    );

    it('Try Again loads the document again and replaces the failure with the details', async () => {
      mockGetDocument.mockRejectedValueOnce(new Error('boom'));
      render(tree());
      await screen.findByText('This document could not be loaded.');

      fireEvent.click(screen.getByTestId('documents-library-sheet-retry'));

      expect(await screen.findByText('Content Preview')).toBeVisible();
      expect(screen.queryByText('This document could not be loaded.')).toBeNull();
      expect(mockGetDocument).toHaveBeenCalledTimes(2);
      expect(onTitle).toHaveBeenCalledWith('Roof contract');
    });

    it('keeps showing the failure when Try Again fails again', async () => {
      mockGetDocument.mockRejectedValue(new Error('boom'));
      render(tree());
      await screen.findByText('This document could not be loaded.');

      fireEvent.click(screen.getByTestId('documents-library-sheet-retry'));

      await waitFor(() => expect(mockGetDocument).toHaveBeenCalledTimes(2));
      expect(await screen.findByText('This document could not be loaded.')).toBeVisible();
    });

    it('still shows the Linked to list under a failed detail', async () => {
      mockGetDocument.mockRejectedValue(new Error('boom'));
      render(tree());

      await screen.findByText('This document could not be loaded.');

      expect(screen.getByRole('heading', { level: 3, name: /^Linked to/ })).toBeInTheDocument();
    });
  });

  describe('changing document', () => {
    it('starts over from a loading state and loads the new document', async () => {
      const view = render(tree());
      await screen.findByText('Synthetic roof text.');
      mockGetDocument.mockResolvedValue({
        document: makeDocumentDetail(9, { title: 'Permit', content: 'Synthetic permit text.' }),
      });

      view.rerender(tree({ docId: 9 }));

      expect(screen.queryByText('Synthetic roof text.')).toBeNull();
      expect(await screen.findByText('Synthetic permit text.')).toBeVisible();
      expect(mockGetDocument).toHaveBeenLastCalledWith(9);
      expect(onTitle).toHaveBeenLastCalledWith('Permit');
    });

    it('clears a failure of the previous document', async () => {
      mockGetDocument.mockRejectedValueOnce(new Error('boom'));
      const view = render(tree());
      await screen.findByText('This document could not be loaded.');

      view.rerender(tree({ docId: 9 }));

      expect(screen.queryByText('This document could not be loaded.')).toBeNull();
      await screen.findByText('Content Preview');
    });

    it('ignores the answer of a document that was replaced before it arrived', async () => {
      let resolveOld: (v: { document: ReturnType<typeof makeDocumentDetail> }) => void = () =>
        undefined;
      mockGetDocument.mockReturnValueOnce(new Promise((r) => (resolveOld = r)));
      const view = render(tree());
      mockGetDocument.mockResolvedValue({
        document: makeDocumentDetail(9, { title: 'Permit', content: 'Synthetic permit text.' }),
      });
      view.rerender(tree({ docId: 9 }));
      await screen.findByText('Synthetic permit text.');

      resolveOld({
        document: makeDocumentDetail(7, {
          title: 'Roof contract',
          content: 'Synthetic roof text.',
        }),
      });
      await Promise.resolve();

      expect(screen.queryByText('Synthetic roof text.')).toBeNull();
      expect(onTitle).not.toHaveBeenCalledWith('Roof contract');
    });

    it('does not reload when only the host callbacks change identity', async () => {
      const view = render(tree());
      await screen.findByText('Content Preview');

      view.rerender(
        tree({ onTitle: jest.fn(), onUnavailable: jest.fn(), onLinksChanged: jest.fn() }),
      );
      await Promise.resolve();

      expect(mockGetDocument).toHaveBeenCalledTimes(1);
    });

    it('reports to the callbacks it holds now, not the first ones', async () => {
      let resolve: (v: { document: ReturnType<typeof makeDocumentDetail> }) => void = () =>
        undefined;
      mockGetDocument.mockReturnValue(new Promise((r) => (resolve = r)));
      const view = render(tree());
      const latestOnTitle = jest.fn<(title: string) => void>();
      view.rerender(tree({ onTitle: latestOnTitle }));

      resolve({ document: makeDocumentDetail(7, { title: 'Roof contract' }) });

      await waitFor(() => expect(latestOnTitle).toHaveBeenCalledWith('Roof contract'));
      expect(onTitle).not.toHaveBeenCalled();
    });
  });

  describe('unmount', () => {
    it('ignores a detail that arrives after unmount', async () => {
      let resolve: (v: { document: ReturnType<typeof makeDocumentDetail> }) => void = () =>
        undefined;
      mockGetDocument.mockReturnValue(new Promise((r) => (resolve = r)));
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const view = render(tree());
      view.unmount();

      resolve({ document: makeDocumentDetail(7) });
      await Promise.resolve();

      expect(onTitle).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('ignores a 404 and a failure that arrive after unmount', async () => {
      let reject: (e: Error) => void = () => undefined;
      mockGetDocument.mockReturnValue(new Promise((_, r) => (reject = r)));
      const view = render(tree());
      view.unmount();

      reject(new ApiClientError(404, { code: 'NOT_FOUND', message: 'raw' }));
      await Promise.resolve();

      expect(onUnavailable).not.toHaveBeenCalled();
    });
  });
});
