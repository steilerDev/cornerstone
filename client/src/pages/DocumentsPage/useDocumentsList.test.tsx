/**
 * @jest-environment jsdom
 *
 * The Documents list hook (#2252): URL state to API params, the Type / Tags / Hide-already-linked
 * filters and their options, the sort config, row de-duplication across batches.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, render, renderHook, screen, waitFor, fireEvent } from '@testing-library/react';
import type { PaperlessDocumentListQuery } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { makeDocument, makeTag } from '../../test/documentsPageFixtures.js';
import type {
  ObjectListFilterRenderContext,
  ObjectListQuery,
} from '../../components/ObjectList/types.js';
import type * as PaperlessApiTypes from '../../lib/paperlessApi.js';
import type * as ListModule from './useDocumentsList.js';

const mockListDocuments = jest.fn<typeof PaperlessApiTypes.listPaperlessDocuments>();
const mockListTypes = jest.fn<typeof PaperlessApiTypes.listPaperlessDocumentTypes>();
const mockListTags = jest.fn<typeof PaperlessApiTypes.listPaperlessTags>();
jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  listPaperlessDocuments: mockListDocuments,
  listPaperlessDocumentTypes: mockListTypes,
  listPaperlessTags: mockListTags,
}));

let Hook: typeof ListModule;

const page = (ids: number[], totalItems = ids.length) => ({
  documents: ids.map((id) => makeDocument(id)),
  pagination: { page: 1, pageSize: 100, totalItems, totalPages: 1 },
});

function setup(url = '/documents') {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
  return renderHook(() => Hook.useDocumentsList(), { wrapper });
}

async function loaded(result: { current: ListModule.UseDocumentsListResult }) {
  await waitFor(() => expect(result.current.list.totalItems).not.toBeNull());
}

/** Lets the resolved option requests apply (a macrotask is enough for already-resolved mocks). */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const lastQuery = (): PaperlessDocumentListQuery =>
  mockListDocuments.mock.calls[mockListDocuments.mock.calls.length - 1]![0]!;

beforeEach(async () => {
  if (!Hook) Hook = await import('./useDocumentsList.js');
  mockListDocuments.mockReset();
  mockListTypes.mockReset();
  mockListTags.mockReset();
  mockListDocuments.mockResolvedValue(page([1, 2, 3]));
  mockListTypes.mockResolvedValue({
    documentTypes: [
      { id: 9, name: 'Receipt' },
      { id: 3, name: 'Contract' },
      { id: 5, name: 'Plan' },
    ],
  });
  mockListTags.mockResolvedValue({
    tags: [makeTag(8, 'Roof'), makeTag(2, 'Archive'), makeTag(4, 'Permit')],
  });
});

describe('documentsApiQuery', () => {
  const base: ObjectListQuery = {
    q: '',
    chip: 'all',
    searchingAll: false,
    serverGroup: null,
    sortBy: 'added',
    sortOrder: 'desc',
    isDefaultSort: true,
    filters: {},
  };

  it('maps the default list to page, pageSize and the default sort only', () => {
    expect(Hook.documentsApiQuery(base, 1, 100)).toEqual({
      query: undefined,
      tags: undefined,
      documentType: undefined,
      excludeLinked: undefined,
      page: 1,
      pageSize: 100,
      sortBy: 'added',
      sortOrder: 'desc',
    });
  });

  it('maps the search, tags, type and unlinked params', () => {
    const query = Hook.documentsApiQuery(
      { ...base, q: 'roof', filters: { tags: '2,4', type: '5', unlinked: '1' } },
      3,
      100,
    );

    expect(query).toMatchObject({
      query: 'roof',
      tags: '2,4',
      documentType: 5,
      excludeLinked: true,
      page: 3,
      pageSize: 100,
    });
  });

  it('sends excludeLinked only for unlinked=1', () => {
    for (const unlinked of ['0', 'true', '', 'yes']) {
      expect(Hook.documentsApiQuery({ ...base, filters: { unlinked } }, 1, 100).excludeLinked).toBe(
        undefined,
      );
    }
    expect(
      Hook.documentsApiQuery({ ...base, filters: { unlinked: '1' } }, 1, 100).excludeLinked,
    ).toBe(true);
  });

  it('sends the document type only for a positive integer', () => {
    for (const type of ['abc', '0', '-3', '1.5', '', '03', '5x', '1e3']) {
      expect(
        Hook.documentsApiQuery({ ...base, filters: { type } }, 1, 100).documentType,
      ).toBeUndefined();
    }
    expect(Hook.documentsApiQuery({ ...base, filters: { type: '12' } }, 1, 100).documentType).toBe(
      12,
    );
  });

  it.each(['added', 'created', 'modified', 'title', 'archive_serial_number'])(
    'passes the known sort field %s through',
    (sortBy) => {
      expect(Hook.documentsApiQuery({ ...base, sortBy, sortOrder: 'asc' }, 1, 100)).toMatchObject({
        sortBy,
        sortOrder: 'asc',
      });
    },
  );

  it('drops an unknown sort field instead of sending it', () => {
    expect(Hook.documentsApiQuery({ ...base, sortBy: 'bogus' }, 1, 100).sortBy).toBeUndefined();
  });

  it('drops an empty tags filter', () => {
    expect(Hook.documentsApiQuery({ ...base, filters: { tags: '' } }, 1, 100).tags).toBeUndefined();
  });
});

describe('useDocumentsList: fetchPage', () => {
  it('requests the first batch with the default sort (Date added, newest first) and maps the response', async () => {
    const { result } = setup();
    await loaded(result);

    expect(lastQuery()).toMatchObject({
      page: 1,
      pageSize: 100,
      sortBy: 'added',
      sortOrder: 'desc',
    });
    expect(result.current.list.items.map((d) => d.id)).toEqual([1, 2, 3]);
    expect(result.current.list.totalItems).toBe(3);
  });

  it('turns URL params into the API query', async () => {
    const { result } = setup(
      '/documents?q=roof&type=5&tags=2,4&unlinked=1&sortBy=title&sortOrder=asc',
    );
    await loaded(result);

    expect(lastQuery()).toMatchObject({
      query: 'roof',
      documentType: 5,
      tags: '2,4',
      excludeLinked: true,
      sortBy: 'title',
      sortOrder: 'asc',
    });
  });

  it('keeps the doc param out of the API query', async () => {
    const { result } = setup('/documents?doc=7');
    await loaded(result);

    expect(Object.keys(lastQuery())).not.toContain('doc');
    expect(lastQuery().excludeLinked).toBeUndefined();
  });

  it('reports the exact server total, not the number of rows loaded', async () => {
    mockListDocuments.mockResolvedValue(page([1, 2], 250));
    const { result } = setup();
    await loaded(result);

    expect(result.current.list.items).toHaveLength(2);
    expect(result.current.list.totalItems).toBe(250);
    expect(result.current.list.hasMore).toBe(true);
  });

  it('drops rows already shown when a later batch repeats them (unstable full-text pages)', async () => {
    // 150 rows exist, so a second batch is requested; it repeats row 3
    mockListDocuments.mockResolvedValueOnce(page([1, 2, 3], 150));
    mockListDocuments.mockResolvedValueOnce({
      ...page([3, 4, 5], 150),
      pagination: { page: 2, pageSize: 100, totalItems: 150, totalPages: 2 },
    });
    const { result } = setup('/documents?q=roof');
    await loaded(result);

    act(() => result.current.list.loadMore());

    await waitFor(() => expect(result.current.list.items).toHaveLength(5));
    expect(result.current.list.items.map((d) => d.id)).toEqual([1, 2, 3, 4, 5]);
    expect(mockListDocuments.mock.calls[1]![0]).toMatchObject({ page: 2 });
  });

  it('starts the de-duplication over when the first batch is fetched again', async () => {
    mockListDocuments.mockResolvedValue(page([1, 2, 3], 3));
    const { result } = setup();
    await loaded(result);

    mockListDocuments.mockResolvedValue(page([2, 3], 2));
    act(() => result.current.list.setFilter('unlinked', '1'));

    await waitFor(() => expect(result.current.list.items.map((d) => d.id)).toEqual([2, 3]));
    expect(lastQuery().excludeLinked).toBe(true);
  });

  it('surfaces a failed first batch as the list failure', async () => {
    mockListDocuments.mockRejectedValue(new Error('boom'));
    const { result } = setup();

    await waitFor(() => expect(result.current.list.status).toBe('error'));
    expect(result.current.list.items).toEqual([]);
  });
});

describe('useDocumentsList: config', () => {
  it('identifies the list and avoids the Documents panel testids', async () => {
    const { result } = setup();
    await loaded(result);

    expect(result.current.config.listKey).toBe('documents');
    expect(result.current.config.testIdPrefix).toBe('documents-library');
    expect(result.current.config.chips).toBeUndefined();
    expect(result.current.config.groupBy).toBeUndefined();
  });

  it('offers the five sorts, defaulting to Date added, newest first', async () => {
    const { result } = setup();
    await loaded(result);
    const { sort } = result.current.config;

    expect(sort.options).toEqual([
      { value: 'added', label: 'Date added' },
      { value: 'created', label: 'Document date' },
      { value: 'modified', label: 'Last modified' },
      { value: 'title', label: 'Title' },
      { value: 'archive_serial_number', label: 'Archive number' },
    ]);
    expect(sort.defaultValue).toBe('added');
    expect(sort.defaultOrder).toBe('desc');
  });

  it('declares the Type, Tags and Linked filters on their URL params', async () => {
    const { result } = setup();
    await loaded(result);

    expect(result.current.config.filters!.map((f) => [f.param, f.label])).toEqual([
      ['type', 'Type'],
      ['tags', 'Tags'],
      ['unlinked', 'Linked'],
    ]);
  });

  it('labels the list from the documents namespace', async () => {
    const { result } = setup();
    await loaded(result);
    const { labels } = result.current;

    expect(labels.title).toBe('Documents');
    expect(labels.search).toBe('Search documents');
    expect(labels.resultCount(1)).toBe('1 document');
    expect(labels.resultCount(2)).toBe('2 documents');
    expect(labels.empty).toBe('No documents in Paperless yet.');
    expect(labels.noMatch).toBe('No documents match.');
    expect(labels.loadFailed).toBe('Documents could not be loaded.');
  });
});

describe('useDocumentsList: filter controls', () => {
  function renderFilter(
    result: { current: ListModule.UseDocumentsListResult },
    param: string,
    ctx: Partial<ObjectListFilterRenderContext> = {},
  ) {
    const onChange = jest.fn<ObjectListFilterRenderContext['onChange']>();
    const filter = result.current.config.filters!.find((f) => f.param === param)!;
    const view = render(<>{filter.render({ id: `f-${param}`, value: null, onChange, ...ctx })}</>);
    return { onChange, ...view };
  }

  it('lists every Paperless document type, by name, after "Any type"', async () => {
    const { result } = setup();
    await loaded(result);
    await settle();

    renderFilter(result, 'type');

    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Any type',
      'Contract',
      'Plan',
      'Receipt',
    ]);
  });

  it('writes the chosen type id and clears with "Any type"', async () => {
    const { result } = setup();
    await loaded(result);
    await settle();
    const { onChange } = renderFilter(result, 'type', { value: '3' });

    const select = screen.getByTestId('documents-library-filter-type');
    expect(select).toHaveValue('3');
    fireEvent.change(select, { target: { value: '5' } });
    expect(onChange).toHaveBeenLastCalledWith('5');
    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('shows a document type that no loaded row carries (options come from the type list, not the rows)', async () => {
    mockListDocuments.mockResolvedValue({
      ...page([1]),
      documents: [makeDocument(1, { documentType: 'Contract' })],
    });
    const { result } = setup();
    await loaded(result);
    await settle();

    renderFilter(result, 'type');

    expect(screen.getByRole('option', { name: 'Receipt' })).toBeInTheDocument();
  });

  it('shows the type load failure under the select without blocking the list', async () => {
    mockListTypes.mockRejectedValue(
      new ApiClientError(502, { code: 'PAPERLESS_UNREACHABLE', message: 'raw server text' }),
    );
    const { result } = setup();
    await loaded(result);
    await settle();

    renderFilter(result, 'type');

    expect(
      screen.getByText('The document management system could not be reached.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('raw server text')).toBeNull();
    expect(result.current.list.items.map((d) => d.id)).toEqual([1, 2, 3]);
  });

  it('uses the fallback message for a type failure without an API code', async () => {
    mockListTypes.mockRejectedValue(new Error('network down'));
    const { result } = setup();
    await loaded(result);
    await settle();

    renderFilter(result, 'type');

    expect(screen.getByText("Couldn't load the choices.")).toBeInTheDocument();
  });

  it('lists the tags by name as checkboxes and writes the checked ids in option order', async () => {
    const { result } = setup();
    await loaded(result);
    await settle();
    const { onChange } = renderFilter(result, 'tags');

    // option order = name order: Archive (2), Permit (4), Roof (8)
    expect(
      screen.getAllByRole('checkbox').map((c) => (c as HTMLInputElement).dataset.testid),
    ).toEqual([
      'documents-library-filter-tag-2',
      'documents-library-filter-tag-4',
      'documents-library-filter-tag-8',
    ]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Roof' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Archive' }));
    expect(onChange).toHaveBeenLastCalledWith('2,8');
  });

  it('keeps the list working with an empty Tags filter when the tags fail to load', async () => {
    mockListTags.mockRejectedValue(new Error('tags down'));
    const { result } = setup();
    await loaded(result);
    await settle();

    const { container } = renderFilter(result, 'tags');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(container.textContent).toBe('');
    expect(result.current.list.items).toHaveLength(3);
  });

  it('offers one "Hide already linked" checkbox that writes 1 or null', async () => {
    const { result } = setup();
    await loaded(result);
    const { onChange } = renderFilter(result, 'unlinked');

    const box = screen.getByRole('checkbox', { name: 'Hide already linked' });
    fireEvent.click(box);
    expect(onChange).toHaveBeenLastCalledWith('1');
    fireEvent.click(box);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('ignores the late type and tag responses after unmount', async () => {
    let resolveTypes: (v: { documentTypes: { id: number; name: string }[] }) => void = () =>
      undefined;
    let resolveTags: (v: { tags: ReturnType<typeof makeTag>[] }) => void = () => undefined;
    mockListTypes.mockReturnValue(new Promise((r) => (resolveTypes = r)));
    mockListTags.mockReturnValue(new Promise((r) => (resolveTags = r)));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { unmount } = setup();
    unmount();

    resolveTypes({ documentTypes: [{ id: 1, name: 'Late' }] });
    resolveTags({ tags: [makeTag(1, 'Late')] });
    await Promise.resolve();

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('ignores late failures after unmount', async () => {
    let rejectTypes: (e: Error) => void = () => undefined;
    mockListTypes.mockReturnValue(new Promise((_, r) => (rejectTypes = r)));
    mockListTags.mockRejectedValue(new Error('x'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { unmount } = setup();
    unmount();

    rejectTypes(new Error('late'));
    await Promise.resolve();

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
