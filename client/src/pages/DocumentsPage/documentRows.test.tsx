/**
 * @jest-environment jsdom
 *
 * How the Documents list draws a row (#2252): the title link that opens the panel (keeping the
 * other URL params), the columns, the Linked badge and the card facts.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { makeLocaleContextMock, localeState } from '../../test/photoSpotFixtures.js';
import { makeDocument, makeTag } from '../../test/documentsPageFixtures.js';
import type * as RowsModule from './documentRows.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let Rows: typeof RowsModule;

beforeEach(async () => {
  localeState.resolvedLocale = 'en';
  if (!Rows) Rows = await import('./documentRows.js');
});

function rowProps(linked: number[] = [], search = '') {
  return renderHook(() =>
    Rows.useDocumentRows({ linkedIds: new Set(linked), searchParams: new URLSearchParams(search) }),
  ).result.current;
}

function column(props: ReturnType<typeof rowProps>, key: string) {
  const found = props.columns?.find((c) => c.key === key);
  if (!found) throw new Error(`no column ${key}`);
  return found;
}

/** Renders a cell in its own container, so several cells can be read in one test. */
const cell = (node: ReactNode) => {
  const { container } = render(<div>{node}</div>);
  return container.firstElementChild as HTMLElement;
};

describe('splitTags', () => {
  const tags = ['a', 'b', 'c', 'd', 'e'].map((name, i) => makeTag(i + 1, name));

  it('shows at most three tags and counts the rest', () => {
    const { shown, rest } = Rows.splitTags(tags);
    expect(shown.map((t) => t.name)).toEqual(['a', 'b', 'c']);
    expect(rest).toBe(2);
    expect(Rows.VISIBLE_TAG_COUNT).toBe(3);
  });

  it('shows exactly three tags without a rest', () => {
    expect(Rows.splitTags(tags.slice(0, 3))).toEqual({ shown: tags.slice(0, 3), rest: 0 });
  });

  it('shows fewer than three tags as they are', () => {
    expect(Rows.splitTags(tags.slice(0, 1))).toEqual({ shown: tags.slice(0, 1), rest: 0 });
    expect(Rows.splitTags([])).toEqual({ shown: [], rest: 0 });
  });
});

describe('documentRowUrl', () => {
  it('opens the panel on the document and keeps every other param', () => {
    const url = Rows.documentRowUrl(
      new URLSearchParams('q=roof&type=3&tags=1,2&unlinked=1&sortBy=title&sortOrder=asc'),
      42,
    );
    const parsed = new URL(url, 'http://localhost');
    expect(parsed.pathname).toBe('/documents');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      q: 'roof',
      type: '3',
      tags: '1,2',
      unlinked: '1',
      sortBy: 'title',
      sortOrder: 'asc',
      doc: '42',
    });
  });

  it('is just ?doc=<id> without other params', () => {
    expect(Rows.documentRowUrl(new URLSearchParams(), 5)).toBe('/documents?doc=5');
  });

  it('replaces an already open document instead of adding a second doc param', () => {
    expect(Rows.documentRowUrl(new URLSearchParams('doc=3&q=x'), 9)).toBe('/documents?doc=9&q=x');
  });
});

describe('useDocumentRows: title and headers', () => {
  it('draws the title as a user-text link that opens the panel', () => {
    const props = rowProps([], 'q=roof');
    expect(props.title(makeDocument(7, { title: 'Roof contract' }))).toEqual({
      text: 'Roof contract',
      to: '/documents?q=roof&doc=7',
      isUserText: true,
    });
  });

  it('names the title and status headers from the en locale', () => {
    const props = rowProps();
    expect(props.titleHeader).toBe('Title');
    expect(props.statusHeader).toBe('Linked');
  });

  it('has no row menu and no bulk selection hooks (documents are managed in Paperless)', () => {
    const props = rowProps() as Record<string, unknown>;
    expect(props.rowMenu).toBeUndefined();
    expect(props.bulkActions).toBeUndefined();
  });
});

describe('useDocumentRows: columns', () => {
  it('declares the columns in order, with the hidden-by-default ones marked', () => {
    const props = rowProps();
    expect(props.columns?.map((c) => [c.key, c.label, c.defaultVisible ?? true])).toEqual([
      ['type', 'Type', true],
      ['tags', 'Tags', true],
      ['created', 'Document date', true],
      ['added', 'Added', false],
      ['modified', 'Last modified', false],
      ['archiveNumber', 'Archive no.', false],
    ]);
  });

  it('maps the sortable columns to the API sort fields', () => {
    const props = rowProps();
    expect(props.columns?.map((c) => [c.key, c.sortValue])).toEqual([
      ['type', undefined],
      ['tags', undefined],
      ['created', 'created'],
      ['added', 'added'],
      ['modified', 'modified'],
      ['archiveNumber', 'archive_serial_number'],
    ]);
  });

  it('right-aligns only the archive number', () => {
    const props = rowProps();
    expect(props.columns?.filter((c) => c.align === 'end').map((c) => c.key)).toEqual([
      'archiveNumber',
    ]);
  });

  it('shows the document type, or a dash without one', () => {
    const type = column(rowProps(), 'type');
    expect(cell(type.render(makeDocument(1, { documentType: 'Contract' }))).textContent).toBe(
      'Contract',
    );
    expect(cell(type.render(makeDocument(1, { documentType: null }))).textContent).toBe('—');
  });

  it('shows up to three tag names as text chips and "+n" for the rest', () => {
    const tags = ['Roof', 'Permit', 'Plan', 'Invoice', 'Misc'].map((name, i) =>
      makeTag(i + 1, name),
    );
    const tagsColumn = column(rowProps(), 'tags');

    const el = cell(tagsColumn.render(makeDocument(1, { tags })));

    expect(el.textContent).toBe('RoofPermitPlan+2');
    expect(el.querySelectorAll('span > span')).toHaveLength(4);
  });

  it('shows all tags without "+n" at three or fewer, and a dash for none', () => {
    const tagsColumn = column(rowProps(), 'tags');
    const three = cell(
      tagsColumn.render(
        makeDocument(1, { tags: [makeTag(1, 'A'), makeTag(2, 'B'), makeTag(3, 'C')] }),
      ),
    );
    expect(three.textContent).toBe('ABC');
    expect(three.textContent).not.toContain('+');
    expect(cell(tagsColumn.render(makeDocument(1, { tags: [] }))).textContent).toBe('—');
  });

  it('never renders Paperless tag colours', () => {
    const tagsColumn = column(rowProps(), 'tags');
    const el = cell(
      tagsColumn.render(
        makeDocument(1, { tags: [{ id: 1, name: 'Red', color: '#ff0000', documentCount: 1 }] }),
      ),
    );
    expect(el.innerHTML).not.toContain('#ff0000');
    expect(el.innerHTML).not.toContain('style=');
  });

  it('formats the document, added and modified dates in the locale', () => {
    const props = rowProps();
    const doc = makeDocument(1, {
      created: '2026-02-03',
      added: '2026-03-04T09:00:00Z',
      modified: '2026-04-05T09:00:00Z',
    });
    const created = cell(column(props, 'created').render(doc)).textContent;
    const added = cell(column(props, 'added').render(doc)).textContent;
    const modified = cell(column(props, 'modified').render(doc)).textContent;
    expect(created).toBe('Feb 3, 2026');
    expect(added).toBe('Mar 4, 2026');
    expect(modified).toBe('Apr 5, 2026');
  });

  it('shows a dash for a date Paperless did not give', () => {
    const props = rowProps();
    const doc = makeDocument(1, { created: null, added: null, modified: null });
    for (const key of ['created', 'added', 'modified']) {
      expect(cell(column(props, key).render(doc)).textContent).toBe('—');
    }
  });

  it('formats dates in German when the locale is German', () => {
    localeState.resolvedLocale = 'de';
    const created = cell(
      column(rowProps(), 'created').render(makeDocument(1, { created: '2026-02-03' })),
    ).textContent;
    expect(created).toBe('3. Feb. 2026');
  });

  it('shows the archive serial number, or a dash without one', () => {
    const archive = column(rowProps(), 'archiveNumber');
    expect(cell(archive.render(makeDocument(1, { archiveSerialNumber: 1042 }))).textContent).toBe(
      '1042',
    );
    expect(cell(archive.render(makeDocument(1, { archiveSerialNumber: 0 }))).textContent).toBe('0');
    expect(cell(archive.render(makeDocument(1, { archiveSerialNumber: null }))).textContent).toBe(
      '—',
    );
  });
});

describe('useDocumentRows: Linked badge', () => {
  it('shows the Linked badge for a document in the linked set', () => {
    const props = rowProps([7]);

    render(<>{props.renderStatus?.(makeDocument(7), 'table')}</>);

    expect(screen.getByText('Linked')).toBeInTheDocument();
  });

  it('shows nothing for a document that is not linked', () => {
    const props = rowProps([7]);

    expect(props.renderStatus?.(makeDocument(8), 'table')).toBeNull();
  });

  it('shows nothing while the linked set is empty', () => {
    expect(rowProps([]).renderStatus?.(makeDocument(7), 'table')).toBeNull();
  });

  it('marks the badge with the completed (positive) style, not a primary one', () => {
    const props = rowProps([7]);
    const { container } = render(<>{props.renderStatus?.(makeDocument(7), 'table')}</>);

    expect(container.firstElementChild?.className).toContain('completed');
    expect(container.innerHTML).not.toMatch(/primary/i);
  });
});

describe('useDocumentRows: card facts', () => {
  const facts = (doc = makeDocument(1)) => rowProps().facts?.(doc) ?? [];

  it('is exactly three facts: type, date and tags, the tag line always kept', () => {
    const result = facts(makeDocument(1, { tags: [makeTag(1, 'Roof')] }));

    expect(result.map((f) => f.key)).toEqual(['type', 'created', 'tags']);
    expect(result.map((f) => f.keep ?? false)).toEqual([false, false, true]);
  });

  it('puts the type, the formatted date and the tag names into the facts', () => {
    const result = facts(
      makeDocument(1, {
        documentType: 'Plan',
        created: '2026-02-03',
        tags: [makeTag(1, 'Roof'), makeTag(2, 'Permit')],
      }),
    );

    expect(result.map((f) => f.content)).toEqual(['Plan', 'Feb 3, 2026', 'Roof, Permit']);
  });

  it('shows dashes for a missing type and no tags', () => {
    const result = facts(makeDocument(1, { documentType: null, tags: [] }));

    expect(result.map((f) => f.content)).toEqual(['—', 'Feb 3, 2026', '—']);
  });

  it('abbreviates the tag line after three tags with "+n"', () => {
    const tags = ['A', 'B', 'C', 'D', 'E'].map((name, i) => makeTag(i + 1, name));

    const result = facts(makeDocument(1, { tags }));

    expect(result[2]!.content).toBe('A, B, C +2');
  });

  it('lists exactly three tags without "+n"', () => {
    const tags = ['A', 'B', 'C'].map((name, i) => makeTag(i + 1, name));

    expect(facts(makeDocument(1, { tags }))[2]!.content).toBe('A, B, C');
  });
});
