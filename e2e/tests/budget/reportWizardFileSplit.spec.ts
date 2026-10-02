/**
 * E2E tests for the Bank Report Wizard's "Maximum file size" setting and the resulting
 * multi-PDF split (Story #2161 — `/budget/reports`).
 *
 * Step 4 (Settings) gained an optional "Maximum file size (MB)" input. With a limit set, advancing
 * to step 5 runs an attachment-sizing phase (each linked invoice PDF is fetched once), and the
 * report is split into several PDFs (`Part k of N`) that each stay under the limit where
 * possible. Step 5 then shows a "Generated files" list (`FileList`, testIdPrefix `report-parts`
 * — rendered ONLY when N > 1), "Download all (N PDFs)" / "Upload all (N) to Paperless" actions
 * and, in the PDF preview modal, a part selector. 1 MB = 10^6 bytes.
 *
 * Attachments are real PDFs of exact byte size (`buildPaddedPdf`), served through
 * `page.route()` on the Paperless preview proxy; documents are linked to invoices via
 * `POST /api/document-links` (the link endpoint does not validate the document ID against
 * Paperless). No Paperless testcontainer exists — see `story-epic08-e2e.md` in agent memory.
 *
 * - Scenario 1: Split happy path — three invoices with a 600,000 B attachment each and a 1 MB
 *   limit produce three files; Download all fires three downloads named
 *   `claim-<slug>-<today>-part-{1,2,3}-of-3.pdf`; no part is over the limit.
 * - Scenario 2: Upload all with a partial failure (2nd POST returns 502) shows "1 of 3 files
 *   failed to upload"; "Retry failed (1)" re-sends only the failed part, titled `… (2 of 3)`.
 * - Scenario 3: An attachment larger than the limit shows the oversized-attachment warning
 *   naming the vendor and invoice number.
 * - Scenario 4: Validation — `0.5` (min), `1.25` (decimals) disable Next; clearing re-enables it;
 *   unticking "Attach invoice PDFs" disables the input and shows the hint.
 * - Scenario 5: No-limit regression — an empty limit yields a single, plainly named PDF and no
 *   "Generated files" list.
 * - Scenario 6: The preview modal's part selector switches to "Part 2 of 3".
 *
 * Every scenario runs on all three viewports (`@responsive`). PDF generation (pdfmake + pdf-lib
 * via dynamic `import()`) is slow on a cold chunk, so scenarios that generate use `test.slow()`.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { ReportWizardPage } from '../../pages/ReportWizardPage.js';
import { API } from '../../fixtures/testData.js';
import { buildPaddedPdf } from '../../fixtures/pdfFixtures.js';
import {
  createVendorViaApi,
  deleteVendorViaApi,
  createBudgetSourceViaApi,
  deleteBudgetSourceViaApi,
  createWorkItemViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Local API / mock helpers (mirror reportWizardEditableContent.spec.ts)
// ─────────────────────────────────────────────────────────────────────────────

const PAPERLESS_BASE_URL = 'http://paperless.local:8000';

interface InvoiceApiResponse {
  id: string;
  invoiceNumber: string | null;
}

async function createInvoiceViaApi(
  page: Page,
  vendorId: string,
  data: { invoiceNumber: string; amount: number; date: string },
): Promise<InvoiceApiResponse> {
  const response = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
    data: { status: 'pending', ...data },
  });
  expect(response.ok(), `POST invoice failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { invoice: InvoiceApiResponse };
  return body.invoice;
}

/** Creates an invoice fully allocated (single budget line) to `sourceId` via `workItemId`. */
async function seedAllocatedInvoice(
  page: Page,
  workItemId: string,
  vendorId: string,
  sourceId: string,
  data: { invoiceNumber: string; amount: number; date: string },
): Promise<InvoiceApiResponse> {
  const invoice = await createInvoiceViaApi(page, vendorId, data);
  const budgetResponse = await page.request.post(`${API.workItems}/${workItemId}/budgets`, {
    data: { confidence: 'own_estimate', plannedAmount: data.amount, budgetSourceId: sourceId },
  });
  expect(budgetResponse.ok(), `POST work item budget for ${workItemId}`).toBeTruthy();
  const { budget } = (await budgetResponse.json()) as { budget: { id: string } };
  const lineResponse = await page.request.post(`/api/invoices/${invoice.id}/budget-lines`, {
    data: { workItemBudgetId: budget.id, itemizedAmount: data.amount },
  });
  expect(lineResponse.ok(), `POST invoice budget line for ${invoice.id}`).toBeTruthy();
  return invoice;
}

/**
 * Links a Paperless document reference to an invoice (`POST /api/document-links`) — see
 * `linkDocumentToInvoiceViaApi` in reportWizardEditableContent.spec.ts. The document ID need not
 * exist in Paperless; the bytes come from the `page.route()` mock below.
 */
async function linkDocumentToInvoiceViaApi(
  page: Page,
  invoiceId: string,
  paperlessDocumentId: number,
): Promise<void> {
  const response = await page.request.post('/api/document-links', {
    data: {
      entityType: 'invoice',
      entityId: invoiceId,
      paperlessDocumentId,
      attachmentType: 'invoice',
    },
  });
  expect(response.ok(), `POST document-link failed: ${response.status()}`).toBeTruthy();
}

/**
 * Serves a real PDF of exactly `sizes[documentId]` bytes for
 * `GET /api/paperless/documents/:id/preview` (the proxy the report generator fetches attachments
 * from). Unknown IDs get a 404.
 */
async function mockDocumentPreviews(page: Page, sizes: Map<number, number>): Promise<void> {
  await page.route('**/api/paperless/documents/*/preview', async (route) => {
    const match = /\/documents\/(\d+)\/preview/.exec(route.request().url());
    const id = match ? Number(match[1]) : NaN;
    const size = sizes.get(id);
    if (size === undefined) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      body: Buffer.from(buildPaddedPdf(size, `E2E attachment ${id}`)),
    });
  });
}

async function mockPaperlessConfigured(page: Page): Promise<void> {
  await page.route(`**${API.paperlessStatus}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        configured: true,
        reachable: true,
        error: null,
        paperlessUrl: PAPERLESS_BASE_URL,
        filterTag: null,
      }),
    });
  });
}

/** Distinct, collision-resistant Paperless document IDs for one test. */
function uniqueDocumentIds(count: number): number[] {
  const base = 1_000_000 + Math.floor(Math.random() * 8_000_000);
  return Array.from({ length: count }, (_, i) => base + i);
}

/** Same slug rules as the wizard's download filename / Paperless title. */
function reportBaseName(sourceName: string): string {
  const slug = sourceName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '');
  const today = new Date().toISOString().slice(0, 10);
  return `claim-${slug}-${today}`;
}

/** Walks steps 1-3 of a fresh `claim` wizard and stops on step 4 (Settings). */
async function reachStep4(wizard: ReportWizardPage, sourceId: string): Promise<void> {
  await wizard.goto();
  await wizard.selectUseCase('claim');
  await wizard.goNextFromStep1();
  await wizard.selectSource(sourceId);
  await wizard.goNextFromStep2();
  await wizard.goNextFromStep3();
  await expect(wizard.maxFileSizeInput).toBeVisible();
}

interface SplitFixture {
  vendorName: string;
  sourceName: string;
  sourceId: string;
  invoiceNumbers: string[];
  documentIds: number[];
  cleanup: () => Promise<void>;
}

/**
 * Seeds one vendor, one source and `sizes.length` invoices, each linked to its own Paperless
 * document of `sizes[i]` bytes, and installs the preview mock for them.
 */
async function seedInvoicesWithAttachments(
  page: Page,
  testPrefix: string,
  sizes: number[],
): Promise<SplitFixture> {
  const vendorName = `${testPrefix} Split Vendor`;
  const sourceName = `${testPrefix} Split Source`;
  const vendorId = await createVendorViaApi(page, { name: vendorName });
  const sourceId = await createBudgetSourceViaApi(page, { name: sourceName, totalAmount: 50000 });
  const workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Split` });
  const documentIds = uniqueDocumentIds(sizes.length);
  const invoiceNumbers: string[] = [];

  const previewSizes = new Map<number, number>();
  for (const [i, size] of sizes.entries()) {
    const documentId = documentIds[i]!;
    previewSizes.set(documentId, size);
    const invoiceNumber = `${testPrefix}-SPLIT-00${i + 1}`;
    const invoice = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
      invoiceNumber,
      amount: 100 + i,
      date: `2026-06-0${i + 1}`,
    });
    await linkDocumentToInvoiceViaApi(page, invoice.id, documentId);
    invoiceNumbers.push(invoiceNumber);
  }

  await mockDocumentPreviews(page, previewSizes);

  return {
    vendorName,
    sourceName,
    sourceId,
    invoiceNumbers,
    documentIds,
    cleanup: async () => {
      await deleteWorkItemViaApi(page, workItemId);
      await deleteBudgetSourceViaApi(page, sourceId);
      await deleteVendorViaApi(page, vendorId);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Split happy path
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard file split — happy path (Scenario 1)', { tag: '@responsive' }, () => {
  test('Three 600,000 B attachments with a 1 MB limit produce three files that Download all saves with part names', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const wizard = new ReportWizardPage(page);
    const fixture = await seedInvoicesWithAttachments(
      page,
      testPrefix,
      [600_000, 600_000, 600_000],
    );
    try {
      await reachStep4(wizard, fixture.sourceId);
      await wizard.setMaxFileSize('1');
      await wizard.step4NextButton.click();

      await expect(wizard.generatedFilesList).toBeVisible();
      await expect(wizard.generatedFilesList.getByRole('heading')).toHaveText('Generated files');
      await expect(wizard.generatedFilesList.locator('li')).toHaveCount(3);
      for (const k of [1, 2, 3]) {
        await expect(wizard.fileRow(k)).toContainText(`Part ${k} of 3`);
      }
      await expect(wizard.generatedFilesList.getByText('Over limit')).toHaveCount(0);
      await expect(wizard.partWarnings).toHaveCount(0);
      await expect(wizard.downloadAllButton).toHaveText(/Download all \(3 PDFs\)/);

      const base = reportBaseName(fixture.sourceName);
      const names = await wizard.downloadAll(3);
      // Arrival order (AC 6.3): downloads are sequential with a 400 ms stagger.
      expect(names).toEqual([
        `${base}-part-1-of-3.pdf`,
        `${base}-part-2-of-3.pdf`,
        `${base}-part-3-of-3.pdf`,
      ]);
    } finally {
      await fixture.cleanup();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Upload all with a partial failure, then retry only the failed part
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Report wizard file split — upload all with partial failure (Scenario 2)',
  { tag: '@responsive' },
  () => {
    test('A failed 2nd upload is reported, and "Retry failed" re-sends only that part', async ({
      page,
      testPrefix,
    }) => {
      test.slow();
      const wizard = new ReportWizardPage(page);
      const fixture = await seedInvoicesWithAttachments(
        page,
        testPrefix,
        [600_000, 600_000, 600_000],
      );
      try {
        await mockPaperlessConfigured(page);

        // Titles of every POST to the Paperless upload endpoint, in arrival order. The 2nd POST
        // overall fails with 502; the retry (4th POST) succeeds.
        const uploadTitles: string[] = [];
        await page.route(`**${API.paperlessDocuments}`, async (route) => {
          const request = route.request();
          if (request.method() !== 'POST') {
            await route.fallback();
            return;
          }
          const body = (request.postDataBuffer() ?? Buffer.alloc(0)).toString('latin1');
          const title = /name="title"\r\n\r\n([^\r\n]*)\r\n/.exec(body)?.[1] ?? '';
          uploadTitles.push(title);
          if (uploadTitles.length === 2) {
            await route.fulfill({
              status: 502,
              contentType: 'application/json',
              body: JSON.stringify({
                error: { code: 'PAPERLESS_UNREACHABLE', message: 'Paperless unreachable' },
              }),
            });
            return;
          }
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ taskId: `task-e2e-2161-${uploadTitles.length}` }),
          });
        });

        await reachStep4(wizard, fixture.sourceId);
        await wizard.setMaxFileSize('1');
        await wizard.step4NextButton.click();
        await expect(wizard.generatedFilesList).toBeVisible();

        await expect(wizard.uploadAllButton).toHaveText(/Upload all \(3\) to Paperless/);
        await wizard.uploadAllButton.click();

        await expect(wizard.page.getByText('1 of 3 files failed to upload.')).toBeVisible();
        await expect(wizard.retryFailedButton).toHaveText(/Retry failed \(1\)/);
        await expect(wizard.fileRow(2)).toContainText('Failed');
        await expect(wizard.fileRow(1)).toContainText('Uploaded');
        await expect(wizard.fileRow(3)).toContainText('Uploaded');
        expect(uploadTitles).toHaveLength(3);

        await wizard.retryFailedButton.click();
        await expect(wizard.page.getByText('1 of 3 files failed to upload.')).toBeHidden();
        await expect(wizard.fileRow(2)).toContainText('Uploaded');

        // Exactly ONE additional request, for the failed part only.
        expect(uploadTitles).toHaveLength(4);
        const base = reportBaseName(fixture.sourceName);
        expect(uploadTitles).toEqual([
          `${base} (1 of 3)`,
          `${base} (2 of 3)`,
          `${base} (3 of 3)`,
          `${base} (2 of 3)`,
        ]);
      } finally {
        await fixture.cleanup();
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Oversized attachment warning
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Report wizard file split — oversized attachment (Scenario 3)',
  { tag: '@responsive' },
  () => {
    test('A 1,500,000 B attachment with a 1 MB limit shows a warning naming the vendor and invoice number', async ({
      page,
      testPrefix,
    }) => {
      test.slow();
      const wizard = new ReportWizardPage(page);
      const fixture = await seedInvoicesWithAttachments(page, testPrefix, [1_500_000]);
      try {
        await reachStep4(wizard, fixture.sourceId);
        await wizard.setMaxFileSize('1');
        await wizard.step4NextButton.click();

        await expect(wizard.partWarnings).toHaveCount(1);
        await expect(wizard.partWarnings.first()).toContainText(fixture.vendorName);
        await expect(wizard.partWarnings.first()).toContainText(fixture.invoiceNumbers[0]!);
        await expect(wizard.partWarnings.first()).toContainText('larger than the');
        await expect(wizard.partWarnings.first()).toContainText('placed in its own file');
      } finally {
        await fixture.cleanup();
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Validation of the limit input
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Report wizard file split — limit validation (Scenario 4)',
  { tag: '@responsive' },
  () => {
    test('0.5 and 1.25 are rejected and disable Next; clearing re-enables it; unticking attachments disables the input', async ({
      page,
      testPrefix,
    }) => {
      const wizard = new ReportWizardPage(page);
      let vendorId = '';
      let sourceId = '';
      let workItemId = '';
      try {
        vendorId = await createVendorViaApi(page, { name: `${testPrefix} Val Vendor` });
        sourceId = await createBudgetSourceViaApi(page, {
          name: `${testPrefix} Val Source`,
          totalAmount: 10000,
        });
        workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Val` });
        await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
          invoiceNumber: `${testPrefix}-VAL-001`,
          amount: 100,
          date: '2026-06-01',
        });

        await reachStep4(wizard, sourceId);
        await expect(wizard.maxFileSizeInput).toBeEnabled();
        await expect(wizard.maxFileSizeError).toHaveCount(0);
        await expect(wizard.step4NextButton).toBeEnabled();

        await wizard.setMaxFileSize('0.5');
        await expect(wizard.maxFileSizeError).toHaveText('The minimum is 1 MB.');
        await expect(wizard.maxFileSizeInput).toHaveAttribute('aria-invalid', 'true');
        await expect(wizard.step4NextButton).toBeDisabled();

        await wizard.setMaxFileSize('1.25');
        await expect(wizard.maxFileSizeError).toHaveText('Use at most one decimal place.');
        await expect(wizard.step4NextButton).toBeDisabled();

        await wizard.setMaxFileSize('');
        await expect(wizard.maxFileSizeError).toHaveCount(0);
        await expect(wizard.step4NextButton).toBeEnabled();

        // A valid value is accepted.
        await wizard.setMaxFileSize('9.5');
        await expect(wizard.maxFileSizeError).toHaveCount(0);
        await expect(wizard.step4NextButton).toBeEnabled();

        // The limit only applies to attached invoice PDFs.
        await wizard.setMaxFileSize('');
        await wizard.toggleAttachDocuments();
        await expect(wizard.attachDocumentsCheckbox).not.toBeChecked();
        await expect(wizard.maxFileSizeInput).toBeDisabled();
        await expect(wizard.maxFileSizeHelper).toHaveText('Only applies to attached invoice PDFs.');
      } finally {
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
        if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: No-limit regression — single, plainly named PDF and no file list
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Report wizard file split — no limit regression (Scenario 5)',
  { tag: '@responsive' },
  () => {
    test('With an empty limit Download PDF saves one PDF named exactly as before and no file list renders', async ({
      page,
      testPrefix,
    }) => {
      test.slow();
      const wizard = new ReportWizardPage(page);
      const fixture = await seedInvoicesWithAttachments(page, testPrefix, [600_000, 600_000]);
      try {
        await reachStep4(wizard, fixture.sourceId);
        await expect(wizard.maxFileSizeInput).toHaveValue('');
        await wizard.step4NextButton.click();

        await expect(wizard.downloadButton).toBeVisible();
        await expect(wizard.generatedFilesList).toHaveCount(0);
        await expect(wizard.downloadAllButton).toHaveCount(0);
        await expect(wizard.sizingStatus).toHaveCount(0);

        const download = await wizard.download();
        expect(download.suggestedFilename()).toBe(`${reportBaseName(fixture.sourceName)}.pdf`);
      } finally {
        await fixture.cleanup();
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Preview part selector
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Report wizard file split — preview part selector (Scenario 6)',
  { tag: '@responsive' },
  () => {
    test('The preview modal offers a part selector and switches to "Part 2 of 3"', async ({
      page,
      testPrefix,
    }) => {
      test.slow();
      const wizard = new ReportWizardPage(page);
      const fixture = await seedInvoicesWithAttachments(
        page,
        testPrefix,
        [600_000, 600_000, 600_000],
      );
      try {
        await reachStep4(wizard, fixture.sourceId);
        await wizard.setMaxFileSize('1');
        await wizard.step4NextButton.click();
        await expect(wizard.generatedFilesList).toBeVisible();

        await wizard.openPdfPreviewModal();
        await expect(wizard.previewPartSelect).toBeVisible();
        await expect(wizard.previewPartSelect.locator('option')).toHaveCount(3);
        await expect(wizard.previewPartSelect.locator('option:checked')).toHaveText('Part 1 of 3');
        const firstSrc = await wizard.getPreviewSrc();

        await wizard.previewPartSelect.selectOption({ label: 'Part 2 of 3' });
        await expect(wizard.previewPartSelect.locator('option:checked')).toHaveText('Part 2 of 3');
        // A fresh blob URL proves the second part was actually generated and loaded.
        await expect.poll(() => wizard.getPreviewSrc()).not.toBe(firstSrc);
        await expect(wizard.pdfPreviewModalLoadingOverlay).toBeHidden();
        await expect(wizard.pdfPreviewModalIframe).toBeVisible();
        expect(wizard.getCspViolations()).toEqual([]);

        await wizard.closePdfPreviewModal();
      } finally {
        await fixture.cleanup();
      }
    });
  },
);
