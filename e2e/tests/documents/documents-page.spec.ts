/**
 * E2E tests for the Documents page (#2252, EPIC-21 P5.8): the Paperless library on the
 * ObjectList template with a details side panel (`/documents?doc=<paperless id>`).
 *
 * The E2E container runs with Paperless off, so `/api/paperless/*` is answered in the browser by
 * `mockPaperlessLibrary` (a synthetic corpus of 12 documents). `/api/document-links*` and
 * `/api/undo` stay REAL: links are seeded through the API, the reverse lookup ("Linked to"),
 * Unlink, Undo and "Link to..." run against the server. Paperless ids start at a per-test random
 * base, so parallel workers never share linked ids.
 *
 * Scenarios:
 * A1  Paperless off (real container): /documents redirects Home; no Documents in the sidebar /
 *     More sheet, no Go-to row in the command search (AC4, AC4.1)
 * B1  Configured: the sidebar / More sheet entry; h1 with count, tab title, no primary button,
 *     exactly one search field, no Back (page identity, X4)
 * B2  Rows: Type, tags with "+n", dates; default order "Date added, newest first"
 * B3  Search (request carries `query`), no-match state with Clear filters
 * B4  Type filter: options come from document-types (a type on no loaded row, AC1.1)
 * B5  Tags filter: URL `tags`, request `tags`
 * B6  Linked badge (real links) and Hide already linked: exact count, `excludeLinked=true`,
 *     `unlinked=1`, survives a reload (AC1, AC1.2)
 * B7  Sort by each of the five options and by a column header
 * B8  URL params survive a reload
 * C1  Row title opens the panel (`?doc=` pushed): metadata, content preview, Open in Paperless
 * C2  Back closes the panel; Close returns focus to the row title; deep link reopens it
 * C3  404 id / invalid id: "That document is not available"
 * C4  Docked `<aside>` at 1440 px and wider, a dialog Sheet below
 * D1  Linked to: five kinds with kind words and titles; a row link opens the object, Back returns
 * D2  A link whose record no longer exists shows "Record no longer exists" and can be unlinked
 * D3  Unlink + Undo (badge refreshes without a list reload)
 * D4  Link to... a task and a purchase, Undo; already-linked targets are not offered
 * D5  A server refusal shows as the picker's inline error
 * E1  Documents panel on a task page: Browse all opens the page (AC3)
 * E2  Unreachable Paperless: alert with Try again and the Integrations link, no list
 * E3  Filter tag note
 * E4  Command search: a paperless_document result opens /documents?doc=<id>
 * F1  Responsive layout (cards below 768 px of list width), no horizontal overflow, dark mode
 */

import type { Page, Route } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import {
  createBudgetSourceViaApi,
  createDocumentLinkViaApi,
  createHouseholdItemViaApi,
  createSubsidyProgramViaApi,
  createVendorViaApi,
  createWorkItemViaApi,
  deleteBudgetSourceViaApi,
  deleteHouseholdItemViaApi,
  deleteSubsidyProgramViaApi,
  deleteVendorViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { enableDarkTheme, expectLegibleInDark } from '../../fixtures/darkMode.js';
import {
  LIBRARY_PAPERLESS_URL,
  LIBRARY_STATUS_CONFIGURED,
  LIBRARY_STATUS_UNREACHABLE,
  LIBRARY_TAGS,
  LIBRARY_TYPES,
  mockPaperlessLibrary,
} from '../../fixtures/paperlessLibraryMock.js';
import type { LibraryMock, LibrarySortBy } from '../../fixtures/paperlessLibraryMock.js';
import { API, ROUTES } from '../../fixtures/testData.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { BreadcrumbsBar } from '../../pages/BreadcrumbsBar.js';
import { DocumentsLibraryPage } from '../../pages/DocumentsLibraryPage.js';
import { DocumentsPanel } from '../../pages/DocumentsPanel.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import { CommandSearchPanel } from '../../pages/components/CommandSearchPanel.js';
import { pickByKeyboard } from '../../pages/components/SearchPickerControl.js';
import { ToastRegion } from '../../pages/components/ToastRegion.js';

const DOCUMENTS = routeUrl('documents');
const TASK_KIND = 'Task';

const TAG = Object.fromEntries(LIBRARY_TAGS.map((tag) => [tag.name, tag.id])) as Record<
  string,
  number
>;
const TYPE = Object.fromEntries(LIBRARY_TYPES.map((type) => [type.name, type.id])) as Record<
  string,
  number
>;

/** Mocks the library and opens the page; returns the page object and the mock. */
async function openLibrary(
  page: Page,
  query = '',
): Promise<{ docs: DocumentsLibraryPage; mock: LibraryMock }> {
  const mock = await mockPaperlessLibrary(page);
  const docs = new DocumentsLibraryPage(page);
  await docs.goto(query);
  await docs.waitForLoaded();
  return { docs, mock };
}

function requestParam(mock: LibraryMock, name: string): string | null | undefined {
  return mock.listRequests.at(-1)?.get(name);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// A: Paperless off (the real container state)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Documents page: Paperless off (AC4, AC4.1)', { tag: '@responsive' }, () => {
  test('A1: /documents redirects Home; no Documents entry or command-search row', async ({
    page,
  }) => {
    const shell = new AppShellPage(page);
    const search = new CommandSearchPanel(page);

    // The shell's Paperless status answers before absence is asserted
    const statusAnswered = page.waitForResponse((resp) =>
      resp.url().includes('/api/paperless/status'),
    );
    await page.goto(`${DOCUMENTS}?doc=1`);
    await expect(page).toHaveURL((url) => url.pathname === ROUTES.home);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await statusAnswered;
    await expect(shell.sectionLink('history')).toBeAttached();
    await expect(shell.sectionLink('documents')).toHaveCount(0);

    await shell.openSearch();
    await search.search('Documents');
    await expect(search.destByLabel('Documents')).toHaveCount(0);
    await expect(search.dest('documents')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B: the list
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Documents page: list (AC1)', { tag: '@responsive' }, () => {
  test('B1: the shell offers Documents; the page has a count, a title and no primary', async ({
    page,
  }) => {
    const { docs, mock } = await openLibrary(page);
    const shell = new AppShellPage(page);

    // Sidebar secondary group (desktop) / More sheet row (below 1024 px)
    const entry = shell.sectionLink('documents');
    await expect(entry).toHaveAttribute('href', DOCUMENTS);
    if (!shell.isCompact()) await expect(entry).toBeVisible();
    else {
      await shell.openMoreSheet();
      await expect(entry).toBeVisible();
      await shell.moreSheetClose.click();
    }

    await expect(docs.heading).toHaveText(`Documents (${mock.docs.length})`);
    await expect(page).toHaveTitle(/^Documents · /);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

    // X4: no primary button, exactly one search field in <main>, no Back or trail
    await expect(page.locator('main [class*="btnPrimary"]').filter({ visible: true })).toHaveCount(
      0,
    );
    await expect(page.getByTestId('documents-library-new')).toHaveCount(0);
    await expect(
      page
        .locator('main')
        .locator('[data-page-search], input[type="search"]')
        .filter({ visible: true }),
    ).toHaveCount(1);
    await expect(new BreadcrumbsBar(page).backLink).toHaveCount(0);
  });

  test('B2: rows show type, tags with "+n" and the date; default order is newest added first', async ({
    page,
  }) => {
    const { docs, mock } = await openLibrary(page);

    expect(await docs.titles()).toEqual(mock.sortedTitles('added', 'desc'));
    expect(requestParam(mock, 'sortBy')).toBe('added');
    expect(requestParam(mock, 'sortOrder')).toBe('desc');
    expect(requestParam(mock, 'pageSize')).toBe('100');

    // Golf: type Bill and four tags, three shown plus "+1"
    const golf = docs.olist.rowByTitle(mock.doc('Golf').title);
    await expect(golf).toContainText('Bill');
    await expect(golf).toContainText('Invoice');
    await expect(golf).toContainText('Receipt');
    await expect(golf).toContainText('+1');
    // Foxtrot has no type and one tag
    const foxtrot = docs.olist.rowByTitle(mock.doc('Foxtrot').title);
    await expect(foxtrot).toContainText('Warranty');
    await expect(foxtrot).not.toContainText('+');
    // Not linked to anything: no badge anywhere
    await expect(docs.linkedBadge(mock.doc('Golf').id)).toHaveCount(0);
  });

  test('B3: search sends `query`; no match shows the empty message and Clear filters', async ({
    page,
  }) => {
    const { docs, mock } = await openLibrary(page);

    await docs.search('Alpha');
    expect(await docs.titles()).toEqual([mock.doc('Alpha').title]);
    await expect(docs.heading).toHaveText('Documents (1)');

    await docs.search(`nothing-matches-${mock.token}`);
    await expect(docs.olist.emptyState).toContainText('No documents match.');
    await expect(docs.olist.clearFiltersButton).toBeVisible();

    await docs.olist.clearFiltersButton.click();
    await expect(docs.searchInput).toHaveValue('');
    await expect.poll(() => docs.titles()).toHaveLength(mock.docs.length);
  });

  test('B4: the Type options are the Paperless document types, also one on no loaded row (AC1.1)', async ({
    page,
  }) => {
    const { docs, mock } = await openLibrary(page);
    await docs.olist.openFilters();

    await expect(docs.typeSelect.locator('option')).toHaveText([
      'Any type',
      ...LIBRARY_TYPES.map((type) => type.name),
    ]);

    await docs.selectType(String(TYPE.Bill));
    expect(requestParam(mock, 'documentType')).toBe(String(TYPE.Bill));
    await expect
      .poll(() => docs.titles())
      .toEqual(
        mock
          .sortedTitles('added', 'desc')
          .filter((title) => mock.docs.find((d) => d.title === title)?.typeId === TYPE.Bill),
      );
    await expect(page).toHaveURL((url) => url.searchParams.get('type') === String(TYPE.Bill));

    // "Manual" is on no document: the list is empty with the no-match message
    await docs.selectType(String(TYPE.Manual));
    await expect(docs.olist.emptyState).toContainText('No documents match.');
    await expect(page).toHaveURL((url) => url.searchParams.get('type') === String(TYPE.Manual));
  });

  test('B5: the Tags filter writes `tags` to the URL and the request', async ({ page }) => {
    const { docs, mock } = await openLibrary(page);
    await docs.olist.openFilters();

    await docs.toggleTag(TAG.Invoice!);
    await expect(page).toHaveURL((url) => url.searchParams.get('tags') === String(TAG.Invoice));
    expect(requestParam(mock, 'tags')).toBe(String(TAG.Invoice));
    const invoiceTitles = mock.docs
      .filter((doc) => doc.tagIds.includes(TAG.Invoice!))
      .map((doc) => doc.title);
    await expect
      .poll(async () => (await docs.titles()).slice().sort())
      .toEqual(invoiceTitles.slice().sort());

    await docs.toggleTag(TAG.Receipt!);
    await expect(page).toHaveURL(
      (url) => url.searchParams.get('tags') === `${TAG.Invoice},${TAG.Receipt}`,
    );
    expect(requestParam(mock, 'tags')).toBe(`${TAG.Invoice},${TAG.Receipt}`);
    await expect(docs.tagCheckbox(TAG.Invoice!)).toBeChecked();
    await expect(docs.tagCheckbox(TAG.Receipt!)).toBeChecked();

    await docs.toggleTag(TAG.Invoice!);
    await docs.toggleTag(TAG.Receipt!);
    await expect(page).toHaveURL((url) => !url.searchParams.has('tags'));
  });

  test('B6: the Linked badge and Hide already linked keep the count and paging exact (AC1.2)', async ({
    page,
    testPrefix,
  }) => {
    const mock = await mockPaperlessLibrary(page);
    const taskId = await createWorkItemViaApi(page, { title: `${testPrefix} ${mock.token} task` });
    try {
      const linked = ['Alpha', 'Bravo', 'Charlie'].map((key) => mock.doc(key));
      for (const doc of linked) {
        await createDocumentLinkViaApi(page, {
          entityType: 'work_item',
          entityId: taskId,
          paperlessDocumentId: doc.id,
        });
      }

      const docs = new DocumentsLibraryPage(page);
      await docs.goto();
      await docs.waitForLoaded();
      await expect(docs.heading).toHaveText(`Documents (${mock.docs.length})`);
      for (const doc of linked) await expect(docs.linkedBadge(doc.id)).toBeVisible();
      await expect(docs.linkedBadge(mock.doc('Delta').id)).toHaveCount(0);

      await docs.toggleHideLinked();
      expect(requestParam(mock, 'excludeLinked')).toBe('true');
      await expect(page).toHaveURL((url) => url.searchParams.get('unlinked') === '1');
      await expect(docs.heading).toHaveText(`Documents (${mock.docs.length - linked.length})`);
      const titles = await docs.titles();
      expect(titles).toHaveLength(mock.docs.length - linked.length);
      for (const doc of linked) expect(titles).not.toContain(doc.title);

      // The filter survives a reload
      await page.reload();
      await docs.waitForLoaded();
      await expect(docs.heading).toHaveText(`Documents (${mock.docs.length - linked.length})`);
      await docs.olist.openFilters();
      await expect(docs.hideLinkedCheckbox).toBeChecked();

      await docs.toggleHideLinked();
      await expect(docs.heading).toHaveText(`Documents (${mock.docs.length})`);
      await expect(page).toHaveURL((url) => !url.searchParams.has('unlinked'));
    } finally {
      await deleteWorkItemViaApi(page, taskId);
    }
  });

  test('B7: all five sort options and a column header sort the list', async ({ page }) => {
    const { docs, mock } = await openLibrary(page);

    const sortKeys = (): string => {
      const last = mock.listRequests.at(-1);
      return `${last?.get('sortBy')}:${last?.get('sortOrder')}`;
    };
    const options: LibrarySortBy[] = [
      'added',
      'created',
      'modified',
      'title',
      'archive_serial_number',
    ];
    for (const sortBy of options) {
      await docs.olist.setSort(sortBy, 'asc');
      await expect.poll(sortKeys).toBe(`${sortBy}:asc`);
      await expect.poll(() => docs.titles()).toEqual(mock.sortedTitles(sortBy, 'asc'));
    }

    await docs.olist.setSort('created', 'desc');
    await expect.poll(sortKeys).toBe('created:desc');
    await expect.poll(() => docs.titles()).toEqual(mock.sortedTitles('created', 'desc'));

    // Columns with a sort value are sort buttons on the table surface (the Title column is not a
    // sort button in any ObjectList, so use the Document date column)
    if (await docs.olist.isTableSurface()) {
      await docs.olist.setSort('title', 'asc');
      await expect.poll(sortKeys).toBe('title:asc');
      await docs.olist
        .columnHeader(/^Document date/)
        .getByRole('button')
        .click();
      await expect.poll(() => mock.listRequests.at(-1)?.get('sortBy')).toBe('created');
      const order = requestParam(mock, 'sortOrder') === 'desc' ? 'desc' : 'asc';
      await expect.poll(() => docs.titles()).toEqual(mock.sortedTitles('created', order));
      await expect(page).toHaveURL((url) => url.searchParams.get('sortBy') === 'created');
    }
  });

  test('B8: search, filters and sort survive a reload', async ({ page }) => {
    const mock = await mockPaperlessLibrary(page);
    const docs = new DocumentsLibraryPage(page);
    const query = `type=${TYPE.Letter}&tags=${TAG.Contract}&unlinked=1&sortBy=title&sortOrder=desc`;
    await docs.goto(query);
    await docs.waitForLoaded();

    const expected = ['Lima', 'Delta', 'Alpha'].map((key) => mock.doc(key).title);
    await expect.poll(() => docs.titles()).toEqual(expected);
    expect(requestParam(mock, 'documentType')).toBe(String(TYPE.Letter));
    expect(requestParam(mock, 'tags')).toBe(String(TAG.Contract));
    expect(requestParam(mock, 'excludeLinked')).toBe('true');
    expect(requestParam(mock, 'sortBy')).toBe('title');
    expect(requestParam(mock, 'sortOrder')).toBe('desc');

    await page.reload();
    await docs.waitForLoaded();
    await expect.poll(() => docs.titles()).toEqual(expected);
    await docs.olist.openFilters();
    await expect(docs.typeSelect).toHaveValue(String(TYPE.Letter));
    await expect(docs.tagCheckbox(TAG.Contract!)).toBeChecked();
    await expect(docs.hideLinkedCheckbox).toBeChecked();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C: the details panel
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Documents page: details panel (AC2)', { tag: '@responsive' }, () => {
  test('C1: the row title opens the panel with metadata, preview and Open in Paperless', async ({
    page,
  }) => {
    const { docs, mock } = await openLibrary(page);
    const alpha = mock.doc('Alpha');

    await docs.openDocument(alpha.id);
    await expect(page).toHaveURL(
      (url) => url.pathname === DOCUMENTS && url.searchParams.get('doc') === String(alpha.id),
    );
    // The docked panel and the sheet both move focus to the heading
    await expect(docs.sheetHeading).toHaveText(alpha.title);
    await expect(docs.sheetHeading).toBeFocused();

    await expect(docs.fact('Correspondent')).toHaveText('Roofing Example Ltd');
    await expect(docs.fact('Document Type')).toHaveText('Letter');
    await expect(docs.fact('Archive #')).toHaveText(String(alpha.archiveSerialNumber));
    await expect(docs.fact('Pages')).toHaveText(String(alpha.pageCount));
    await expect(docs.fact('Tags')).toContainText('Contract');
    await expect(docs.fact('Created')).toBeVisible();
    await expect(docs.fact('Added')).toBeVisible();
    await expect(docs.fact('Last modified')).toBeVisible();
    await expect(docs.thumbnail).toHaveAttribute('alt', alpha.title);

    // Content preview: the first 300 characters, then an ellipsis
    await expect(docs.contentPreviewHeading).toBeVisible();
    const preview = docs.sheetBody.locator('[class*="snippetText"]');
    await expect(preview).toContainText(`Subject ${mock.token}.`);
    await expect(preview).toContainText('...');

    await expect(docs.openInPaperless).toHaveAttribute(
      'href',
      `${LIBRARY_PAPERLESS_URL}/documents/${alpha.id}/details`,
    );
    await expect(docs.openInPaperless).toHaveAttribute('target', '_blank');
    await expect(docs.openInPaperless).toHaveAttribute('rel', /noopener/);
  });

  test('C2: Back closes the panel, Close returns focus to the row, a deep link reopens it', async ({
    page,
  }) => {
    const { docs, mock } = await openLibrary(page);
    const bravo = mock.doc('Bravo');

    await docs.openDocument(bravo.id);
    await page.goBack();
    await expect(docs.sheet).toBeHidden();
    await expect(page).toHaveURL((url) => !url.searchParams.has('doc'));

    await docs.openDocument(bravo.id);
    await docs.closeSheet();
    await expect(page).toHaveURL((url) => !url.searchParams.has('doc'));
    await expect(docs.titleLink(bravo.id)).toBeFocused();

    // Escape closes too and returns focus the same way
    await docs.openDocument(bravo.id);
    await page.keyboard.press('Escape');
    await expect(docs.sheet).toBeHidden();
    await expect(docs.titleLink(bravo.id)).toBeFocused();

    // A shared URL reopens the panel
    await page.goto(`${DOCUMENTS}?doc=${bravo.id}`);
    await docs.waitForSheetLoaded(bravo.id);
    await expect(docs.sheetHeading).toHaveText(bravo.title);
    expect(mock.detailRequests).toContain(bravo.id);
  });

  test('C3: an unknown or invalid document id shows "That document is not available"', async ({
    page,
  }) => {
    const mock = await mockPaperlessLibrary(page);
    const docs = new DocumentsLibraryPage(page);

    await docs.goto(`doc=${mock.missingId}`);
    await expect(docs.unavailableNote).toHaveText('That document is not available');
    await expect(docs.sheet).toBeHidden();
    await expect(page).toHaveURL((url) => !url.searchParams.has('doc'));
    await docs.waitForLoaded();
    await expect(docs.heading).toHaveText(`Documents (${mock.docs.length})`);

    // Opening a real document clears the note
    await docs.openDocument(mock.doc('Alpha').id);
    await expect(docs.unavailableNote).toHaveCount(0);

    await docs.goto('doc=not-a-number');
    await expect(docs.unavailableNote).toHaveText('That document is not available');
    await expect(page).toHaveURL((url) => !url.searchParams.has('doc'));
  });

  test('C4: the panel docks beside the list from 1440 px and is a dialog Sheet below', async ({
    page,
  }) => {
    const { docs, mock } = await openLibrary(page);
    await docs.openDocument(mock.doc('Echo').id);

    if (docs.isDocked()) {
      await expect(docs.sheet).toHaveJSProperty('tagName', 'ASIDE');
      await expect(docs.sheet).not.toHaveAttribute('role', 'dialog');
      // Not modal: the list stays reachable beside the panel
      await expect(docs.titleLink(mock.doc('Foxtrot').id)).toBeVisible();
      await docs.titleLink(mock.doc('Foxtrot').id).click();
      await docs.waitForSheetLoaded(mock.doc('Foxtrot').id);
      await expect(docs.sheetHeading).toHaveText(mock.doc('Foxtrot').title);
    } else {
      await expect(docs.sheet).toHaveAttribute('role', 'dialog');
      await expect(docs.sheet).toHaveAttribute('aria-modal', 'true');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D: Linked to
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Documents page: Linked to (AC2.1, AC2.2)', { tag: '@responsive' }, () => {
  test('D1: every link of the document shows with its kind and title; a row opens the record', async ({
    page,
    testPrefix,
  }) => {
    const mock = await mockPaperlessLibrary(page);
    const name = (what: string) => `${testPrefix} ${mock.token} ${what}`;
    const delta = mock.doc('Delta');
    const ids = { task: '', purchase: '', vendor: '', invoice: '', source: '', grant: '' };
    try {
      ids.task = await createWorkItemViaApi(page, { title: name('task') });
      ids.purchase = await createHouseholdItemViaApi(page, { name: name('purchase') });
      ids.vendor = await createVendorViaApi(page, { name: name('company') });
      const invoiceResponse = await page.request.post(`${API.vendors}/${ids.vendor}/invoices`, {
        data: {
          amount: 100,
          date: '2026-01-15',
          status: 'pending',
          invoiceNumber: `D1-${mock.token}`,
        },
      });
      expect(invoiceResponse.ok()).toBeTruthy();
      ids.invoice = ((await invoiceResponse.json()) as { invoice: { id: string } }).invoice.id;
      ids.source = await createBudgetSourceViaApi(page, {
        name: name('source'),
        sourceType: 'bank_loan',
        totalAmount: 1000,
      });
      ids.grant = await createSubsidyProgramViaApi(page, {
        name: name('grant'),
        reductionValue: 5,
      });
      const targets = [
        ['work_item', ids.task],
        ['household_item', ids.purchase],
        ['invoice', ids.invoice],
        ['budget_source', ids.source],
        ['subsidy_program', ids.grant],
      ] as const;
      for (const [entityType, entityId] of targets) {
        await createDocumentLinkViaApi(page, {
          entityType,
          entityId,
          paperlessDocumentId: delta.id,
        });
      }

      const docs = new DocumentsLibraryPage(page);
      await docs.goto(`doc=${delta.id}`);
      await docs.waitForSheetLoaded(delta.id);

      await expect(docs.linkedToHeading).toHaveText(/^Linked to \(5\)$/);
      const expectedRows: ReadonlyArray<readonly [string, string]> = [
        [name('task'), TASK_KIND],
        [name('purchase'), 'Purchase'],
        [`${name('company')} · D1-${mock.token}`, 'Invoice'],
        [name('source'), 'Funding source'],
        [name('grant'), 'Grant'],
      ];
      // Links created in the same millisecond have no defined order: compare as sets
      expect((await docs.linkedToTitles()).sort()).toEqual(
        expectedRows.map(([title]) => title).sort(),
      );
      for (const [title, kind] of expectedRows) {
        await expect(docs.linkedTo.rowWith(title)).toContainText(kind);
      }
      await expect(docs.linkedBadge(delta.id)).toBeVisible();

      // A row link opens the record; Back returns to the panel URL
      await page.getByRole('link', { name: name('task'), exact: true }).click();
      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('workItem', { id: ids.task }),
      );
      await page.goBack();
      await expect(page).toHaveURL(
        (url) => url.pathname === DOCUMENTS && url.searchParams.get('doc') === String(delta.id),
      );
      await docs.waitForSheetLoaded(delta.id);
    } finally {
      // Deleting a record removes its document links
      if (ids.grant) await deleteSubsidyProgramViaApi(page, ids.grant);
      if (ids.source) await deleteBudgetSourceViaApi(page, ids.source);
      if (ids.invoice) {
        await page.request.delete(`${API.vendors}/${ids.vendor}/invoices/${ids.invoice}`);
      }
      if (ids.vendor) await deleteVendorViaApi(page, ids.vendor);
      if (ids.purchase) await deleteHouseholdItemViaApi(page, ids.purchase);
      if (ids.task) await deleteWorkItemViaApi(page, ids.task);
    }
  });

  test('D2: a link whose record no longer exists still shows and can be unlinked', async ({
    page,
  }) => {
    const mock = await mockPaperlessLibrary(page);
    const hotel = mock.doc('Hotel');
    const ghostId = `ghost-link-${mock.token}`;
    let unlinked = false;

    // The server removes a record's links with the record, so the orphan is answered here
    await page.route(
      (url) =>
        url.pathname === API.documentLinks &&
        url.searchParams.get('paperlessDocumentId') === String(hotel.id),
      async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            documentLinks: unlinked
              ? []
              : [
                  {
                    id: ghostId,
                    entityType: 'work_item',
                    entityId: 'gone-record',
                    paperlessDocumentId: hotel.id,
                    attachmentType: null,
                    createdBy: null,
                    createdAt: '2026-01-15T10:00:00.000Z',
                    entity: null,
                  },
                ],
          }),
        });
      },
    );
    await page.route(`**/api/document-links/${ghostId}`, async (route: Route) => {
      unlinked = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          undo: { token: 'ghost-token', expiresAt: '2099-01-01T00:00:00.000Z' },
        }),
      });
    });

    const docs = new DocumentsLibraryPage(page);
    await docs.goto(`doc=${hotel.id}`);
    await docs.waitForSheetLoaded(hotel.id);

    const row = docs.linkedTo.row(ghostId);
    await expect(row).toContainText('Record no longer exists');
    await expect(row).toContainText(TASK_KIND);
    await expect(docs.linkedTo.link(ghostId)).toHaveCount(0);

    await docs.linkedTo.remove(ghostId);
    const toasts = new ToastRegion(page);
    await expect(toasts.undoToastWith('Unlinked from Record no longer exists')).toBeVisible();
    await expect(row).toHaveCount(0);
    await expect(docs.linkedTo.emptyMessage('Not linked to anything yet.')).toBeVisible();
    await toasts.dismissUndoToasts();
  });

  test('D3: Unlink shows an Undo toast; Undo restores the row; the badge follows without a list reload', async ({
    page,
    testPrefix,
  }) => {
    const mock = await mockPaperlessLibrary(page);
    const taskTitle = `${testPrefix} ${mock.token} unlink task`;
    const taskId = await createWorkItemViaApi(page, { title: taskTitle });
    const echo = mock.doc('Echo');
    try {
      const linkId = await createDocumentLinkViaApi(page, {
        entityType: 'work_item',
        entityId: taskId,
        paperlessDocumentId: echo.id,
      });
      const docs = new DocumentsLibraryPage(page);
      await docs.goto();
      await docs.waitForLoaded();
      await expect(docs.linkedBadge(echo.id)).toBeVisible();
      await docs.openDocument(echo.id);
      await expect(docs.linkedToHeading).toHaveText('Linked to (1)');
      const listRequests = mock.listRequests.length;

      await docs.linkedTo.remove(linkId);
      const toasts = new ToastRegion(page);
      await expect(toasts.undoToastWith(`Unlinked from ${taskTitle}`)).toBeVisible();
      await expect(docs.linkedTo.rowWith(taskTitle)).toHaveCount(0);
      await expect(docs.linkedToHeading).toHaveText(/^Linked to( \(0\))?$/);
      await expect(docs.linkedBadge(echo.id)).toHaveCount(0);

      await toasts.undoViaButton();
      await expect(docs.linkedTo.rowWith(taskTitle)).toBeVisible();
      await expect(docs.linkedToHeading).toHaveText('Linked to (1)');
      await expect(docs.linkedBadge(echo.id)).toBeVisible();

      // The panel stayed open and the list was never reloaded
      await expect(docs.sheet).toBeVisible();
      expect(mock.listRequests.length).toBe(listRequests);
    } finally {
      await deleteWorkItemViaApi(page, taskId);
    }
  });

  test('D4: Link to... a task and a purchase; Undo removes it; linked targets are not offered', async ({
    page,
  }) => {
    const mock = await mockPaperlessLibrary(page);
    // One distinct word per target, so a search finds exactly that record
    const name = (what: string) => `Tgt${mock.token}${what}`;
    const juliet = mock.doc('Juliet');
    const taskId = await createWorkItemViaApi(page, { title: name('Task') });
    const purchaseId = await createHouseholdItemViaApi(page, { name: name('Buy') });
    try {
      const docs = new DocumentsLibraryPage(page);
      await docs.goto();
      await docs.waitForLoaded();
      await docs.openDocument(juliet.id);
      await expect(docs.linkedTo.emptyMessage('Not linked to anything yet.')).toBeVisible();
      await expect(docs.linkedBadge(juliet.id)).toHaveCount(0);
      const listRequests = mock.listRequests.length;
      const toasts = new ToastRegion(page);

      // A task
      await docs.linkToButton.click();
      await docs.linkToInput.fill(name('Task'));
      await pickByKeyboard(page, docs.linkToInput, name('Task'));
      await expect(toasts.undoToastWith(`Linked to ${name('Task')}`)).toBeVisible();
      await expect(docs.linkedTo.rowWith(name('Task'))).toContainText(TASK_KIND);
      await expect(docs.linkedToHeading).toHaveText('Linked to (1)');
      await expect(docs.linkedBadge(juliet.id)).toBeVisible();
      await toasts.dismissUndoToasts();

      // A purchase, then Undo
      await docs.linkToButton.click();
      await docs.linkToInput.fill(name('Buy'));
      await pickByKeyboard(page, docs.linkToInput, name('Buy'));
      await expect(toasts.undoToastWith(`Linked to ${name('Buy')}`)).toBeVisible();
      await expect(docs.linkedTo.rowWith(name('Buy'))).toContainText('Purchase');
      await expect(docs.linkedToHeading).toHaveText('Linked to (2)');

      await toasts.undoViaButton();
      await expect(docs.linkedTo.rowWith(name('Buy'))).toHaveCount(0);
      await expect(docs.linkedToHeading).toHaveText('Linked to (1)');
      await expect(docs.linkedBadge(juliet.id)).toBeVisible();

      // Already-linked targets are not offered again
      await docs.linkToButton.click();
      const searched = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/search') &&
          new URL(resp.url()).searchParams.get('q') === name('Task'),
      );
      await docs.linkToInput.fill(name('Task'));
      await searched;
      await expect(
        page
          .locator('[data-search-picker-dropdown]')
          .getByRole('option')
          .filter({ hasText: name('Task') }),
      ).toHaveCount(0);

      // The panel stayed open and the list was never reloaded
      await expect(docs.sheet).toBeVisible();
      expect(mock.listRequests.length).toBe(listRequests);
    } finally {
      await deleteHouseholdItemViaApi(page, purchaseId);
      await deleteWorkItemViaApi(page, taskId);
    }
  });

  test('D5: a server refusal shows as the picker error and changes nothing', async ({ page }) => {
    const mock = await mockPaperlessLibrary(page);
    const title = `Tgt${mock.token}Refused`;
    const taskId = await createWorkItemViaApi(page, { title });
    const india = mock.doc('India');
    try {
      await page.route('**/api/document-links', async (route: Route) => {
        if (route.request().method() !== 'POST') {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'DUPLICATE_DOCUMENT_LINK', message: 'already linked' },
          }),
        });
      });

      const docs = new DocumentsLibraryPage(page);
      await docs.goto(`doc=${india.id}`);
      await docs.waitForSheetLoaded(india.id);

      await docs.linkToButton.click();
      await docs.linkToInput.fill(title);
      await pickByKeyboard(page, docs.linkToInput, title);
      await expect(docs.linkedTo.root.getByText(/already linked/)).toBeVisible();
      await expect(docs.linkedTo.rowWith(title)).toHaveCount(0);
      await expect(new ToastRegion(page).undoToast).toHaveCount(0);
    } finally {
      await deleteWorkItemViaApi(page, taskId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E: entry points and Paperless states
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Documents page: entry points and states', { tag: '@responsive' }, () => {
  test('E1: Browse all in the Documents panel of a task opens the page (AC3)', async ({
    page,
    testPrefix,
  }) => {
    const mock = await mockPaperlessLibrary(page);
    const taskId = await createWorkItemViaApi(page, { title: `${testPrefix} ${mock.token} host` });
    try {
      await createDocumentLinkViaApi(page, {
        entityType: 'work_item',
        entityId: taskId,
        paperlessDocumentId: mock.doc('Kilo').id,
      });
      await new WorkItemDetailPage(page).goto(taskId);
      const panel = new DocumentsPanel(page);
      await panel.open();

      await expect(panel.browseAll).toBeVisible();
      await panel.browseAll.click();
      await expect(page).toHaveURL((url) => url.pathname === DOCUMENTS);
      const docs = new DocumentsLibraryPage(page);
      await expect(docs.heading).toBeVisible();
      await docs.waitForLoaded();
      await expect(panel.dialog).toHaveCount(0);
    } finally {
      await deleteWorkItemViaApi(page, taskId);
    }
  });

  test('E2: an unreachable Paperless shows the alert with Try again and the Integrations link', async ({
    page,
  }) => {
    const mock = await mockPaperlessLibrary(page, { status: LIBRARY_STATUS_UNREACHABLE });
    const docs = new DocumentsLibraryPage(page);
    await page.goto(DOCUMENTS);

    await expect(docs.unreachable).toBeVisible();
    await expect(docs.unreachable).toHaveAttribute('role', 'alert');
    await expect(docs.unreachable).toContainText('Paperless-ngx Unreachable');
    await expect(docs.integrationsLink).toBeVisible();
    await expect(docs.integrationsLink).toHaveAttribute(
      'href',
      new RegExp(`^${routeUrl('settingsIntegrations')}`),
    );
    // No list, no filters, no search
    await expect(docs.olist.list).toHaveCount(0);
    await expect(docs.searchInput).toHaveCount(0);
    expect(mock.listRequests).toHaveLength(0);

    mock.setStatus(LIBRARY_STATUS_CONFIGURED);
    await docs.retryButton.click();
    await expect(docs.unreachable).toHaveCount(0);
    await docs.waitForLoaded();
    await expect(docs.heading).toHaveText(`Documents (${mock.docs.length})`);
  });

  test('E3: a configured filter tag shows the note', async ({ page }) => {
    await mockPaperlessLibrary(page, {
      status: { ...LIBRARY_STATUS_CONFIGURED, filterTag: 'Project house' },
    });
    const docs = new DocumentsLibraryPage(page);
    await docs.goto();
    await docs.waitForLoaded();

    await expect(docs.filterNote).toHaveAttribute('role', 'note');
    await expect(docs.filterNote).toHaveText('Showing only documents tagged Project house');
  });

  test('E4: a command-search document result opens /documents?doc=<id> and the panel', async ({
    page,
  }) => {
    const mock = await mockPaperlessLibrary(page);
    const foxtrot = mock.doc('Foxtrot');
    await page.route(/\/api\/search\?/, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          query: 'Foxtrot',
          groups: [
            {
              type: 'paperless_document',
              total: 1,
              status: 'ok',
              items: [
                {
                  id: String(foxtrot.id),
                  label: foxtrot.title,
                  sublabel: null,
                  matchedField: 'title',
                  status: null,
                  kind: null,
                  date: null,
                  phone: null,
                  areaPath: null,
                  parent: null,
                },
              ],
            },
          ],
        }),
      });
    });

    const search = new CommandSearchPanel(page);
    await page.goto(ROUTES.home);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await search.openWithShortcut();
    await search.search('Foxtrot');

    const option = search.option('paperless_document', String(foxtrot.id));
    await expect(option).toBeVisible();
    await option.click();

    const docs = new DocumentsLibraryPage(page);
    await expect(page).toHaveURL(
      (url) => url.pathname === DOCUMENTS && url.searchParams.get('doc') === String(foxtrot.id),
    );
    await docs.waitForSheetLoaded(foxtrot.id);
    await expect(docs.sheetHeading).toHaveText(foxtrot.title);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F: responsive and dark mode
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Documents page: responsive and dark mode', { tag: '@responsive' }, () => {
  test('F1: the layout fits the viewport, the panel adapts, dark mode stays legible', async ({
    page,
  }, testInfo) => {
    const { docs, mock } = await openLibrary(page);
    const project = testInfo.project.name;
    const golf = mock.doc('Golf');

    await expectNoHorizontalOverflow(page);
    if (project === 'mobile') {
      // Cards, never the table
      await expect(docs.olist.tableSurface).toBeHidden();
      await expect(docs.olist.rowByTitle(golf.title)).toContainText('+1');
    } else if (project === 'desktop') {
      await expect(docs.olist.tableSurface).toBeVisible();
    }

    await docs.openDocument(golf.id);
    await expect(docs.openInPaperless).toBeVisible();
    await expectNoHorizontalOverflow(page);
    if (project === 'mobile') {
      // A bottom sheet: it fills the width and the Open in Paperless link is a 44 px target
      const box = await docs.openInPaperless.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    await enableDarkTheme(page);
    await expectLegibleInDark(docs.sheetHeading);
    await expectLegibleInDark(docs.fact('Document Type'));
    await expectLegibleInDark(docs.openInPaperless);
    await expectNoHorizontalOverflow(page);
  });
});
