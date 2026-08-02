/**
 * Unit tests for client/src/components/reports/ReportInvoiceList.tsx
 *
 * Covers: tri-state select-all, individual toggles, running-total refund netting (sign
 * behavior), split-badge gating, paperclip/no-document indicator, unallocated group
 * (collapsible, non-selectable), empty state.
 *
 * NOTE: an earlier pass of this file documented two prop-mismatch bugs — the header
 * TriStateCheckbox being called with a nonexistent `ariaLabel` prop instead of `label`, and
 * SelectionActionBar missing its required `clearLabel`/`children` props (both confirmed via
 * `npx tsc -p client/tsconfig.json --noEmit`: TS2322 / TS2739). Both were fixed in production
 * during this same QA session (verified by re-reading the file and re-running these tests) — the
 * two tests below now assert the corrected, accessible behavior directly.
 *
 * FIXED (frontend fix spec item 3 — refund sign contract): the server now returns a NEGATIVE
 * allocatedAmount for refund-adjustment lines (invoiceAmount stays positive), and the component
 * no longer branches on lineKind when summing — `runningTotal` is an unconditional
 * `sum + inv.allocatedAmount`. Refund fixtures below use negative allocatedAmount accordingly.
 *
 * FIXED (frontend fix spec item 8): `sourceReports.selectedCount` is interpolated with
 * `{ count, totalCount, totalAmount }` (previously `{ total }`) — assertions matching against the
 * JSON-stringified t() call args below match on the `"totalAmount":` key, not `"total":`.
 *
 * FIXED (frontend fix spec item 12): the split badge now reads the server's `invoice.isSplit`
 * field directly instead of deriving it locally from `allocatedAmount < invoiceAmount` — fixtures
 * for the split-badge-gating tests set `isSplit` explicitly rather than relying on amount deltas.
 *
 * FIXED (UX fix, frontend fix spec item 12 attachment column): the "has attachment" indicator's
 * accessible text moved from an `aria-label` on the `.paperclip` div to a visually-hidden
 * (`.srOnly`) `<span>` sibling of the paperclip SVG — it's asserted via `getByText`, not
 * `getByLabelText` (a plain, non-form `<div>` has no label association for RTL's label query).
 */
import { screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, jest, beforeAll } from '@jest/globals';
import type { TFunction } from 'i18next';
import type { SourceReportResponse, SourceReportInvoice } from '@cornerstone/shared';
import { renderWithRouter } from '../../test/testUtils.js';
import type { ReportInvoiceList as ReportInvoiceListType } from './ReportInvoiceList.js';

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}::${JSON.stringify(opts)}` : key) as unknown as TFunction;

// ReportInvoiceList calls useFormatters() (which needs a LocaleProvider ancestor) — mock the
// module directly with a simple, locale-independent formatCurrency so tests don't need to wrap
// every render in a real LocaleProvider (which would also require configApi/preferencesApi
// network mocks).
jest.unstable_mockModule('../../lib/formatters.js', () => ({
  useFormatters: () => ({
    formatCurrency: (n: number) => `€${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`,
    formatDate: (d: string) => d,
    formatPercent: (n: number) => `${n}%`,
  }),
}));

let ReportInvoiceList: typeof ReportInvoiceListType;

beforeAll(async () => {
  ({ ReportInvoiceList } = await import('./ReportInvoiceList.js'));
});

function makeInvoice(overrides: Partial<SourceReportInvoice> = {}): SourceReportInvoice {
  return {
    invoiceId: 'inv-1',
    vendorId: 'vend-1',
    vendorName: 'ACME Builders',
    invoiceNumber: 'INV-001',
    date: '2026-01-10',
    status: 'pending',
    invoiceAmount: 1000,
    allocatedAmount: 1000,
    lineKind: 'invoice',
    isSplit: false,
    documents: [],
    budgetLines: [],
    deposits: [],
    ...overrides,
  };
}

function makeReport(
  invoices: SourceReportInvoice[],
  unallocatedInvoices: SourceReportResponse['unallocatedInvoices'] = [],
): SourceReportResponse {
  return {
    type: 'claim',
    source: {
      id: 'src-1',
      name: 'Home Loan',
      sourceType: 'bank_loan',
      reference: null,
      contactAddress: null,
    },
    invoices,
    totalAmount: invoices.reduce((sum, inv) => sum + inv.allocatedAmount, 0),
    unallocatedInvoices,
    generatedAt: '2026-01-15T00:00:00.000Z',
  };
}

describe('ReportInvoiceList', () => {
  it('renders EmptyState when there are no allocated and no unallocated invoices', () => {
    renderWithRouter(
      <ReportInvoiceList
        report={makeReport([])}
        excludedInvoiceIds={new Set()}
        excludedLineIds={new Set()}
        onToggle={jest.fn()}
        onToggleLine={jest.fn()}
        onToggleAll={jest.fn()}
        t={t}
      />,
    );
    expect(screen.getByText('sourceReports.emptyInvoices')).toBeInTheDocument();
  });

  it('renders one row per allocated invoice, with vendor name and invoice number', () => {
    const report = makeReport([
      makeInvoice({ invoiceId: 'inv-1', vendorName: 'ACME' }),
      makeInvoice({ invoiceId: 'inv-2', vendorName: 'Beta Corp', invoiceNumber: 'INV-002' }),
    ]);
    renderWithRouter(
      <ReportInvoiceList
        report={report}
        excludedInvoiceIds={new Set()}
        excludedLineIds={new Set()}
        onToggle={jest.fn()}
        onToggleLine={jest.fn()}
        onToggleAll={jest.fn()}
        t={t}
      />,
    );
    expect(screen.getByText('ACME')).toBeInTheDocument();
    expect(screen.getByText('Beta Corp')).toBeInTheDocument();
    expect(screen.getByText(/INV-002/)).toBeInTheDocument();
  });

  it('checks the row checkbox for a non-excluded invoice and unchecks it for an excluded one', () => {
    const report = makeReport([
      makeInvoice({ invoiceId: 'inv-1' }),
      makeInvoice({ invoiceId: 'inv-2' }),
    ]);
    renderWithRouter(
      <ReportInvoiceList
        report={report}
        excludedInvoiceIds={new Set(['inv-2'])}
        excludedLineIds={new Set()}
        onToggle={jest.fn()}
        onToggleLine={jest.fn()}
        onToggleAll={jest.fn()}
        t={t}
      />,
    );
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    // Header checkbox (index 0, tri-state) + 2 row checkboxes.
    expect(checkboxes[1]!.checked).toBe(true); // inv-1 included
    expect(checkboxes[2]!.checked).toBe(false); // inv-2 excluded
  });

  it('calls onToggle(invoiceId, true) when unchecking an included row', () => {
    const onToggle = jest.fn();
    const report = makeReport([makeInvoice({ invoiceId: 'inv-1' })]);
    renderWithRouter(
      <ReportInvoiceList
        report={report}
        excludedInvoiceIds={new Set()}
        excludedLineIds={new Set()}
        onToggle={onToggle}
        onToggleLine={jest.fn()}
        onToggleAll={jest.fn()}
        t={t}
      />,
    );
    const [, rowCheckbox] = screen.getAllByRole('checkbox');
    fireEvent.click(rowCheckbox!);
    expect(onToggle).toHaveBeenCalledWith('inv-1', true);
  });

  it('calls onToggle(invoiceId, false) when re-checking an excluded row', () => {
    const onToggle = jest.fn();
    const report = makeReport([makeInvoice({ invoiceId: 'inv-1' })]);
    renderWithRouter(
      <ReportInvoiceList
        report={report}
        excludedInvoiceIds={new Set(['inv-1'])}
        excludedLineIds={new Set()}
        onToggle={onToggle}
        onToggleLine={jest.fn()}
        onToggleAll={jest.fn()}
        t={t}
      />,
    );
    const [, rowCheckbox] = screen.getAllByRole('checkbox');
    fireEvent.click(rowCheckbox!);
    expect(onToggle).toHaveBeenCalledWith('inv-1', false);
  });

  describe('header tri-state checkbox', () => {
    it('is checked when every allocated invoice is included', () => {
      const report = makeReport([
        makeInvoice({ invoiceId: 'inv-1' }),
        makeInvoice({ invoiceId: 'inv-2' }),
      ]);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      const [header] = screen.getAllByRole('checkbox') as HTMLInputElement[];
      expect(header!.checked).toBe(true);
      expect(header!.indeterminate).toBe(false);
    });

    it('is indeterminate when some (not all) allocated invoices are excluded', () => {
      const report = makeReport([
        makeInvoice({ invoiceId: 'inv-1' }),
        makeInvoice({ invoiceId: 'inv-2' }),
      ]);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set(['inv-2'])}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      const [header] = screen.getAllByRole('checkbox') as HTMLInputElement[];
      expect(header!.indeterminate).toBe(true);
    });

    it('clicking select-all when fully selected excludes everything (onToggleAll(true))', () => {
      const onToggleAll = jest.fn();
      const report = makeReport([makeInvoice({ invoiceId: 'inv-1' })]);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={onToggleAll}
          t={t}
        />,
      );
      const [header] = screen.getAllByRole('checkbox');
      fireEvent.click(header!);
      expect(onToggleAll).toHaveBeenCalledWith(true);
    });

    it('clicking select-all when partially/fully excluded includes everything (onToggleAll(false))', () => {
      const onToggleAll = jest.fn();
      const report = makeReport([
        makeInvoice({ invoiceId: 'inv-1' }),
        makeInvoice({ invoiceId: 'inv-2' }),
      ]);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set(['inv-2'])}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={onToggleAll}
          t={t}
        />,
      );
      const [header] = screen.getAllByRole('checkbox');
      fireEvent.click(header!);
      expect(onToggleAll).toHaveBeenCalledWith(false);
    });

    it('the select-all checkbox has a translated accessible name', () => {
      const report = makeReport([makeInvoice({ invoiceId: 'inv-1' })]);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      expect(
        screen.getByRole('checkbox', { name: 'sourceReports.selectAllInvoices' }),
      ).toBeInTheDocument();
    });
  });

  describe('running total (refund netting)', () => {
    it('sums allocatedAmount for non-excluded invoice lines', () => {
      const report = makeReport([
        makeInvoice({ invoiceId: 'inv-1', allocatedAmount: 300 }),
        makeInvoice({ invoiceId: 'inv-2', allocatedAmount: 200 }),
      ]);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      expect(screen.getByText(/"totalAmount":"€500\.00"/)).toBeInTheDocument();
    });

    it('nets a refund-adjustment line into the running total via its already-negative allocatedAmount (unconditional sum, no lineKind branch)', () => {
      const report = makeReport([
        makeInvoice({ invoiceId: 'inv-1', allocatedAmount: 300 }),
        makeInvoice({
          invoiceId: 'inv-2',
          lineKind: 'refund-adjustment',
          allocatedAmount: -100,
          invoiceAmount: 100,
        }),
      ]);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      // 300 + (-100) = 200
      expect(screen.getByText(/"totalAmount":"€200\.00"/)).toBeInTheDocument();
    });

    it('excluding a refund-adjustment row INCREASES the running total (sign behavior)', () => {
      const report = makeReport([
        makeInvoice({ invoiceId: 'inv-1', allocatedAmount: 300 }),
        makeInvoice({
          invoiceId: 'inv-refund',
          lineKind: 'refund-adjustment',
          allocatedAmount: -100,
          invoiceAmount: 100,
        }),
      ]);

      const { rerender } = renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      // Both included: 300 + (-100) = 200.
      expect(screen.getByText(/"totalAmount":"€200\.00"/)).toBeInTheDocument();

      // Excluding the refund row removes its negative contribution: 300 + 0 = 300 (an INCREASE).
      rerender(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set(['inv-refund'])}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      expect(screen.getByText(/"totalAmount":"€300\.00"/)).toBeInTheDocument();
    });
  });

  describe('split badge gating (server-driven isSplit, not a locally-derived amount comparison)', () => {
    it('shows a split badge when isSplit is true', () => {
      const report = makeReport([
        makeInvoice({
          invoiceId: 'inv-1',
          isSplit: true,
          allocatedAmount: 400,
          invoiceAmount: 1000,
        }),
      ]);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      expect(screen.getByText(/sourceReports\.splitBadge/)).toBeInTheDocument();
    });

    it('does NOT show a split badge when isSplit is false, even if allocatedAmount < invoiceAmount', () => {
      // isSplit is now taken verbatim from the server, not re-derived from an amount comparison —
      // an amount delta alone must not conjure a badge.
      const report = makeReport([
        makeInvoice({
          invoiceId: 'inv-1',
          isSplit: false,
          allocatedAmount: 400,
          invoiceAmount: 1000,
        }),
      ]);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      expect(screen.queryByText(/sourceReports\.splitBadge/)).not.toBeInTheDocument();
    });

    it('does NOT show a split badge when fully allocated (isSplit false, allocatedAmount === invoiceAmount)', () => {
      const report = makeReport([
        makeInvoice({
          invoiceId: 'inv-1',
          isSplit: false,
          allocatedAmount: 1000,
          invoiceAmount: 1000,
        }),
      ]);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      expect(screen.queryByText(/sourceReports\.splitBadge/)).not.toBeInTheDocument();
    });

    it('shows a split badge for a refund-adjustment line when the server marks it isSplit', () => {
      // isSplit is now an independent server-provided field, not gated on lineKind — a
      // refund-adjustment row can in principle also be flagged split.
      const report = makeReport([
        makeInvoice({
          invoiceId: 'inv-refund',
          lineKind: 'refund-adjustment',
          isSplit: true,
          allocatedAmount: -50,
          invoiceAmount: 100,
        }),
      ]);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      expect(screen.getByText(/sourceReports\.splitBadge/)).toBeInTheDocument();
    });
  });

  describe('paperclip / no-document indicator', () => {
    it('shows a paperclip indicator (with a visually-hidden accessible label) when the invoice has at least one document', () => {
      const report = makeReport([
        makeInvoice({
          invoiceId: 'inv-1',
          documents: [
            { documentId: 1, archiveSerialNumber: null, title: null, attachmentType: null },
          ],
        }),
      ]);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      // The accessible label lives in a visually-hidden (.srOnly) <span> sibling of the paperclip
      // SVG, not an aria-label on the wrapping <div> — getByText finds it directly.
      expect(screen.getByText('sourceReports.hasAttachment')).toBeInTheDocument();
      expect(screen.queryByText('sourceReports.noDocument')).not.toBeInTheDocument();
    });

    it('shows "no document" text when the invoice has zero documents', () => {
      const report = makeReport([makeInvoice({ invoiceId: 'inv-1', documents: [] })]);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      expect(screen.getByText('sourceReports.noDocument')).toBeInTheDocument();
      expect(screen.queryByText('sourceReports.hasAttachment')).not.toBeInTheDocument();
    });

    it('renders the split badge ALONGSIDE the attachment indicator, not instead of it — both coexist on a split invoice with a document', () => {
      const report = makeReport([
        makeInvoice({
          invoiceId: 'inv-1',
          isSplit: true,
          allocatedAmount: 400,
          invoiceAmount: 1000,
          documents: [
            { documentId: 1, archiveSerialNumber: null, title: null, attachmentType: null },
          ],
        }),
      ]);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      expect(screen.getByText(/sourceReports\.splitBadge/)).toBeInTheDocument();
      expect(screen.getByText('sourceReports.hasAttachment')).toBeInTheDocument();
    });

    it('renders the split badge alongside "no document" when a split invoice has no attachments', () => {
      const report = makeReport([
        makeInvoice({
          invoiceId: 'inv-1',
          isSplit: true,
          allocatedAmount: 400,
          invoiceAmount: 1000,
          documents: [],
        }),
      ]);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      expect(screen.getByText(/sourceReports\.splitBadge/)).toBeInTheDocument();
      expect(screen.getByText('sourceReports.noDocument')).toBeInTheDocument();
    });
  });

  describe('unallocated group', () => {
    const unallocated: SourceReportResponse['unallocatedInvoices'] = [
      {
        invoiceId: 'unalloc-1',
        vendorId: 'vend-2',
        vendorName: 'Gamma Supplies',
        invoiceNumber: 'INV-900',
        date: '2026-01-05',
        status: 'pending',
        invoiceAmount: 500,
      },
    ];

    it('renders a collapsible unallocated group header with the count, collapsed by default', () => {
      const report = makeReport([], unallocated);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      const header = screen.getByRole('button', { name: /unallocatedGroupTitle/ });
      expect(header).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText('Gamma Supplies')).not.toBeInTheDocument();
    });

    it('expands to show unallocated rows on click, with no selection checkbox', () => {
      const report = makeReport([], unallocated);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /unallocatedGroupTitle/ }));
      expect(screen.getByText('Gamma Supplies')).toBeInTheDocument();

      // No checkbox associated with the unallocated row itself (non-selectable).
      const checkboxes = screen.getAllByRole('checkbox');
      // Only the header tri-state checkbox exists — no allocated rows in this fixture.
      expect(checkboxes).toHaveLength(1);
    });

    it('does not count unallocated invoices toward the allocated selection/running total', () => {
      const report = makeReport(
        [makeInvoice({ invoiceId: 'inv-1', allocatedAmount: 300 })],
        unallocated,
      );
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      expect(screen.getByText(/"count":1.*"totalAmount":"€300\.00"/)).toBeInTheDocument();
    });
  });

  describe('SelectionActionBar clear button', () => {
    it('renders a "clear" button with a translated label', () => {
      const report = makeReport([makeInvoice({ invoiceId: 'inv-1' })]);
      const { container } = renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      const buttons = within(container).getAllByRole('button');
      const clearBtn = buttons.find((b) => b.className.includes('btnSecondaryCompact'));
      expect(clearBtn).toBeDefined();
      expect(clearBtn?.textContent).toBe('sourceReports.resetSelection');
    });

    it('clicking the "clear" button calls onToggleAll(false)', () => {
      const onToggleAll = jest.fn();
      const report = makeReport([makeInvoice({ invoiceId: 'inv-1' })]);
      const { container } = renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={onToggleAll}
          t={t}
        />,
      );
      const buttons = within(container).getAllByRole('button');
      const clearBtn = buttons.find((b) => b.className.includes('btnSecondaryCompact'))!;
      fireEvent.click(clearBtn);
      expect(onToggleAll).toHaveBeenCalledWith(false);
    });
  });

  // ─── Story #1891: expand/collapse, sub-tables, tri-state, onToggleLine ─────

  describe('statusChip class (Story #1891 chip-width fix)', () => {
    it('applies the statusChip class to the invoice status Badge', () => {
      const report = makeReport([makeInvoice({ invoiceId: 'inv-1', status: 'paid' })]);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      const statusEl = screen.getByText('sources.lines.invoiceStatus.paid');
      expect(statusEl.className).toContain('statusChip');
    });
  });

  describe('expand/collapse (chevron, aria contract, sub-tables)', () => {
    const budgetLine = {
      id: 'line-1',
      description: 'Foundation work',
      allocatedPortion: 400,
      linkedItem: null,
    };
    const workItemLine = {
      id: 'line-2',
      description: 'Roofing',
      allocatedPortion: 200,
      linkedItem: {
        type: 'work_item' as const,
        id: 'wi-1',
        name: 'Roof Replacement',
        areaId: null,
        areaName: null,
      },
    };
    const householdItemLine = {
      id: 'line-3',
      description: 'Cabinet',
      allocatedPortion: 100,
      linkedItem: {
        type: 'household_item' as const,
        id: 'hi-1',
        name: 'Kitchen Cabinet',
        areaId: null,
        areaName: null,
      },
    };
    const deposit = {
      id: 'dep-1',
      amount: 50,
      status: 'pending' as const,
      entryType: 'deposit' as const,
      dueDate: '2026-02-01',
      paidDate: null,
      claimedDate: null,
      budgetSourceId: null,
    };

    function findExpandButton(container: HTMLElement, invoiceId: string): HTMLElement {
      const btn = container.querySelector(`[aria-controls="invoice-expand-${invoiceId}"]`);
      expect(btn).not.toBeNull();
      return btn as HTMLElement;
    }

    it('renders NO chevron/expand button for an invoice with zero budgetLines and zero deposits', () => {
      const report = makeReport([
        makeInvoice({ invoiceId: 'inv-1', budgetLines: [], deposits: [] }),
      ]);
      const { container } = renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      expect(container.querySelector('[aria-controls="invoice-expand-inv-1"]')).toBeNull();
    });

    it('renders a chevron/expand button when the invoice has at least one budgetLine', () => {
      const report = makeReport([makeInvoice({ invoiceId: 'inv-1', budgetLines: [budgetLine] })]);
      const { container } = renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      expect(findExpandButton(container, 'inv-1')).toBeInTheDocument();
    });

    it('renders a chevron/expand button when the invoice has at least one deposit (even with zero budgetLines)', () => {
      const report = makeReport([
        makeInvoice({ invoiceId: 'inv-1', budgetLines: [], deposits: [deposit] }),
      ]);
      const { container } = renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      expect(findExpandButton(container, 'inv-1')).toBeInTheDocument();
    });

    it('aria-expanded starts false, and the expansion panel is not rendered before clicking', () => {
      const report = makeReport([makeInvoice({ invoiceId: 'inv-1', budgetLines: [budgetLine] })]);
      const { container } = renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      const btn = findExpandButton(container, 'inv-1');
      expect(btn).toHaveAttribute('aria-expanded', 'false');
      expect(container.querySelector('#invoice-expand-inv-1')).toBeNull();
    });

    it('clicking the chevron sets aria-expanded=true and renders a panel with matching id, tabIndex -1, and focuses it', () => {
      const report = makeReport([makeInvoice({ invoiceId: 'inv-1', budgetLines: [budgetLine] })]);
      const { container } = renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      const btn = findExpandButton(container, 'inv-1');
      fireEvent.click(btn);

      expect(btn).toHaveAttribute('aria-expanded', 'true');
      const panel = container.querySelector('#invoice-expand-inv-1');
      expect(panel).not.toBeNull();
      expect(panel).toHaveAttribute('tabindex', '-1');
      expect(document.activeElement).toBe(panel);
    });

    it('clicking the chevron again collapses the panel (aria-expanded=false, panel removed)', () => {
      const report = makeReport([makeInvoice({ invoiceId: 'inv-1', budgetLines: [budgetLine] })]);
      const { container } = renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      const btn = findExpandButton(container, 'inv-1');
      fireEvent.click(btn);
      fireEvent.click(btn);

      expect(btn).toHaveAttribute('aria-expanded', 'false');
      expect(container.querySelector('#invoice-expand-inv-1')).toBeNull();
    });

    it('Enter and Space keys on the chevron toggle expansion (keyboard operability)', () => {
      const report = makeReport([makeInvoice({ invoiceId: 'inv-1', budgetLines: [budgetLine] })]);
      const { container } = renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      const btn = findExpandButton(container, 'inv-1');
      fireEvent.keyDown(btn, { key: 'Enter' });
      expect(btn).toHaveAttribute('aria-expanded', 'true');
      fireEvent.keyDown(btn, { key: ' ' });
      expect(btn).toHaveAttribute('aria-expanded', 'false');
    });

    it('the expand button has a translated accessible name that flips to the collapse variant after expanding (Story #1891 follow-up: aria-label fix)', () => {
      const report = makeReport([makeInvoice({ invoiceId: 'inv-1', budgetLines: [budgetLine] })]);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );

      // Reachable by role + accessible name (the t-mock returns the bare key when called
      // with no interpolation options, which is how expandInvoice/collapseInvoice are used).
      const expandBtn = screen.getByRole('button', {
        name: 'sourceReports.expand.expandInvoice',
      });
      expect(expandBtn).toBeInTheDocument();

      fireEvent.click(expandBtn);

      // The label must flip to the collapse variant — same element, new accessible name —
      // and the expand-variant name must no longer resolve any button.
      expect(
        screen.getByRole('button', { name: 'sourceReports.expand.collapseInvoice' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'sourceReports.expand.expandInvoice' }),
      ).not.toBeInTheDocument();
    });

    describe('items sub-table', () => {
      it('renders a row per budgetLine with description, allocated portion, and a linked-item link', () => {
        const report = makeReport([
          makeInvoice({ invoiceId: 'inv-1', budgetLines: [budgetLine, workItemLine] }),
        ]);
        const { container } = renderWithRouter(
          <ReportInvoiceList
            report={report}
            excludedInvoiceIds={new Set()}
            excludedLineIds={new Set()}
            onToggle={jest.fn()}
            onToggleLine={jest.fn()}
            onToggleAll={jest.fn()}
            t={t}
          />,
        );
        fireEvent.click(findExpandButton(container, 'inv-1'));

        expect(screen.getAllByText('Foundation work').length).toBeGreaterThan(0);
        expect(screen.getAllByText('€400.00').length).toBeGreaterThan(0);
        const links = screen.getAllByRole('link', { name: 'Roof Replacement' });
        expect(links[0]).toHaveAttribute('href', '/project/work-items/wi-1');
      });

      it('renders a household_item linkedItem with the correct href', () => {
        const report = makeReport([
          makeInvoice({ invoiceId: 'inv-1', budgetLines: [householdItemLine] }),
        ]);
        const { container } = renderWithRouter(
          <ReportInvoiceList
            report={report}
            excludedInvoiceIds={new Set()}
            excludedLineIds={new Set()}
            onToggle={jest.fn()}
            onToggleLine={jest.fn()}
            onToggleAll={jest.fn()}
            t={t}
          />,
        );
        fireEvent.click(findExpandButton(container, 'inv-1'));

        const links = screen.getAllByRole('link', { name: 'Kitchen Cabinet' });
        expect(links[0]).toHaveAttribute('href', '/household-items/hi-1');
      });

      it('renders an "unassigned" badge instead of a link when linkedItem is null', () => {
        const report = makeReport([makeInvoice({ invoiceId: 'inv-1', budgetLines: [budgetLine] })]);
        const { container } = renderWithRouter(
          <ReportInvoiceList
            report={report}
            excludedInvoiceIds={new Set()}
            excludedLineIds={new Set()}
            onToggle={jest.fn()}
            onToggleLine={jest.fn()}
            onToggleAll={jest.fn()}
            t={t}
          />,
        );
        fireEvent.click(findExpandButton(container, 'inv-1'));

        expect(screen.getAllByText('sourceReports.unassigned').length).toBeGreaterThan(0);
      });

      it('falls back to "unnamedLine" text when description is null', () => {
        const report = makeReport([
          makeInvoice({
            invoiceId: 'inv-1',
            budgetLines: [{ ...budgetLine, description: null }],
          }),
        ]);
        const { container } = renderWithRouter(
          <ReportInvoiceList
            report={report}
            excludedInvoiceIds={new Set()}
            excludedLineIds={new Set()}
            onToggle={jest.fn()}
            onToggleLine={jest.fn()}
            onToggleAll={jest.fn()}
            t={t}
          />,
        );
        fireEvent.click(findExpandButton(container, 'inv-1'));

        expect(screen.getAllByText('sourceReports.expand.unnamedLine').length).toBeGreaterThan(0);
      });

      it('renders an EmptyState for the items sub-table when budgetLines is empty (deposit-only invoice)', () => {
        const report = makeReport([
          makeInvoice({ invoiceId: 'inv-1', budgetLines: [], deposits: [deposit] }),
        ]);
        const { container } = renderWithRouter(
          <ReportInvoiceList
            report={report}
            excludedInvoiceIds={new Set()}
            excludedLineIds={new Set()}
            onToggle={jest.fn()}
            onToggleLine={jest.fn()}
            onToggleAll={jest.fn()}
            t={t}
          />,
        );
        fireEvent.click(findExpandButton(container, 'inv-1'));

        expect(screen.getByText('sourceReports.expand.itemsEmpty')).toBeInTheDocument();
      });

      it('calls onToggleLine(lineId, true) when unchecking an included line, and does NOT call onToggle', () => {
        const onToggleLine = jest.fn();
        const onToggle = jest.fn();
        const report = makeReport([makeInvoice({ invoiceId: 'inv-1', budgetLines: [budgetLine] })]);
        const { container } = renderWithRouter(
          <ReportInvoiceList
            report={report}
            excludedInvoiceIds={new Set()}
            excludedLineIds={new Set()}
            onToggle={onToggle}
            onToggleLine={onToggleLine}
            onToggleAll={jest.fn()}
            t={t}
          />,
        );
        fireEvent.click(findExpandButton(container, 'inv-1'));

        const lineCheckbox = screen.getAllByRole('checkbox', {
          name: /excludeItemAriaLabel/,
        })[0];
        fireEvent.click(lineCheckbox!);

        expect(onToggleLine).toHaveBeenCalledWith('line-1', true);
        expect(onToggle).not.toHaveBeenCalled();
      });

      it('calls onToggleLine(lineId, false) when re-checking an excluded line', () => {
        const onToggleLine = jest.fn();
        const report = makeReport([makeInvoice({ invoiceId: 'inv-1', budgetLines: [budgetLine] })]);
        const { container } = renderWithRouter(
          <ReportInvoiceList
            report={report}
            excludedInvoiceIds={new Set()}
            excludedLineIds={new Set(['line-1'])}
            onToggle={jest.fn()}
            onToggleLine={onToggleLine}
            onToggleAll={jest.fn()}
            t={t}
          />,
        );
        fireEvent.click(findExpandButton(container, 'inv-1'));

        const lineCheckbox = screen.getAllByRole('checkbox', {
          name: /excludeItemAriaLabel/,
        })[0] as HTMLInputElement;
        expect(lineCheckbox.checked).toBe(false);
        fireEvent.click(lineCheckbox);

        expect(onToggleLine).toHaveBeenCalledWith('line-1', false);
      });
    });

    describe('deposits sub-table', () => {
      it('renders a row per deposit with amount, status, dates, and entry type', () => {
        const report = makeReport([
          makeInvoice({
            invoiceId: 'inv-1',
            budgetLines: [],
            deposits: [{ ...deposit, status: 'paid', paidDate: '2026-01-20' }],
          }),
        ]);
        const { container } = renderWithRouter(
          <ReportInvoiceList
            report={report}
            excludedInvoiceIds={new Set()}
            excludedLineIds={new Set()}
            onToggle={jest.fn()}
            onToggleLine={jest.fn()}
            onToggleAll={jest.fn()}
            t={t}
          />,
        );
        fireEvent.click(findExpandButton(container, 'inv-1'));

        expect(screen.getAllByText('€50.00').length).toBeGreaterThan(0);
        expect(screen.getAllByText('sources.lines.invoiceStatus.paid').length).toBeGreaterThan(0);
        expect(screen.getAllByText('sourceReports.expand.entryTypeDeposit').length).toBeGreaterThan(
          0,
        );
      });

      it('displays a refund badge and negates the amount for a refund-type deposit', () => {
        const report = makeReport([
          makeInvoice({
            invoiceId: 'inv-1',
            budgetLines: [],
            deposits: [{ ...deposit, amount: 75, entryType: 'refund' }],
          }),
        ]);
        const { container } = renderWithRouter(
          <ReportInvoiceList
            report={report}
            excludedInvoiceIds={new Set()}
            excludedLineIds={new Set()}
            onToggle={jest.fn()}
            onToggleLine={jest.fn()}
            onToggleAll={jest.fn()}
            t={t}
          />,
        );
        fireEvent.click(findExpandButton(container, 'inv-1'));

        expect(screen.getAllByText('€-75.00').length).toBeGreaterThan(0);
        expect(screen.getAllByText('sourceReports.expand.entryTypeRefund').length).toBeGreaterThan(
          0,
        );
      });

      it("shows a source badge when the deposit is tagged to the report's own source", () => {
        const report = makeReport([
          makeInvoice({
            invoiceId: 'inv-1',
            budgetLines: [],
            deposits: [{ ...deposit, budgetSourceId: 'src-1' }],
          }),
        ]);
        const { container } = renderWithRouter(
          <ReportInvoiceList
            report={report}
            excludedInvoiceIds={new Set()}
            excludedLineIds={new Set()}
            onToggle={jest.fn()}
            onToggleLine={jest.fn()}
            onToggleAll={jest.fn()}
            t={t}
          />,
        );
        fireEvent.click(findExpandButton(container, 'inv-1'));

        // The report's own source name ("Home Loan" per makeReport fixture) is used as the badge label.
        expect(screen.getAllByText('Home Loan').length).toBeGreaterThan(0);
      });

      it('renders an em-dash instead of a badge when a deposit is untagged (budgetSourceId null)', () => {
        const report = makeReport([
          makeInvoice({
            invoiceId: 'inv-1',
            budgetLines: [],
            deposits: [{ ...deposit, budgetSourceId: null }],
          }),
        ]);
        const { container } = renderWithRouter(
          <ReportInvoiceList
            report={report}
            excludedInvoiceIds={new Set()}
            excludedLineIds={new Set()}
            onToggle={jest.fn()}
            onToggleLine={jest.fn()}
            onToggleAll={jest.fn()}
            t={t}
          />,
        );
        fireEvent.click(findExpandButton(container, 'inv-1'));

        expect(screen.getByText('—')).toBeInTheDocument();
      });

      it('renders an EmptyState for the deposits sub-table when deposits is empty', () => {
        const report = makeReport([
          makeInvoice({ invoiceId: 'inv-1', budgetLines: [budgetLine], deposits: [] }),
        ]);
        const { container } = renderWithRouter(
          <ReportInvoiceList
            report={report}
            excludedInvoiceIds={new Set()}
            excludedLineIds={new Set()}
            onToggle={jest.fn()}
            onToggleLine={jest.fn()}
            onToggleAll={jest.fn()}
            t={t}
          />,
        );
        fireEvent.click(findExpandButton(container, 'inv-1'));

        expect(screen.getByText('sourceReports.expand.depositsEmpty')).toBeInTheDocument();
      });
    });
  });

  describe('parent TriStateCheckbox (invoice-level, driven by line exclusions)', () => {
    const lineA = { id: 'line-a', description: 'A', allocatedPortion: 300, linkedItem: null };
    const lineB = { id: 'line-b', description: 'B', allocatedPortion: 200, linkedItem: null };

    it('state 1 (checked): invoice not excluded and no lines excluded', () => {
      const report = makeReport([makeInvoice({ invoiceId: 'inv-1', budgetLines: [lineA, lineB] })]);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      const rowCheckboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      // index 0 = header, index 1 = the single invoice row's parent checkbox
      expect(rowCheckboxes[1]!.checked).toBe(true);
      expect(rowCheckboxes[1]!.indeterminate).toBe(false);
    });

    it('state 2 (indeterminate): invoice not excluded, SOME (not all) lines excluded', () => {
      const report = makeReport([makeInvoice({ invoiceId: 'inv-1', budgetLines: [lineA, lineB] })]);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set(['line-a'])}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      const rowCheckboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      expect(rowCheckboxes[1]!.indeterminate).toBe(true);
      expect(rowCheckboxes[1]!.checked).toBe(false);
    });

    it('state 3 (unchecked, but invoice remains included): ALL lines excluded, invoice itself not excluded — checkbox reads unchecked, not indeterminate', () => {
      const report = makeReport([makeInvoice({ invoiceId: 'inv-1', budgetLines: [lineA, lineB] })]);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set(['line-a', 'line-b'])}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      const rowCheckboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      expect(rowCheckboxes[1]!.checked).toBe(false);
      expect(rowCheckboxes[1]!.indeterminate).toBe(false);
      // The invoice is still present in the (allocated, selectable) list — not moved to
      // excluded/unallocated — since excludedInvoiceIds does not contain it.
      expect(screen.getByText('ACME Builders')).toBeInTheDocument();
    });

    it('clicking the parent checkbox calls onToggle for the INVOICE, never onToggleLine — even with lines excluded', () => {
      const onToggle = jest.fn();
      const onToggleLine = jest.fn();
      const report = makeReport([makeInvoice({ invoiceId: 'inv-1', budgetLines: [lineA, lineB] })]);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set(['line-a'])}
          onToggle={onToggle}
          onToggleLine={onToggleLine}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      const rowCheckboxes = screen.getAllByRole('checkbox');
      // The parent checkbox reflects the indeterminate/unchecked visual state (some lines
      // excluded), so clicking it fires a native checked=true change event — which maps to
      // onToggle(id, false) (i.e. "un-exclude the invoice"). The key assertion here is that
      // ONLY onToggle fires (never onToggleLine), regardless of direction.
      fireEvent.click(rowCheckboxes[1]!);

      expect(onToggle).toHaveBeenCalledWith('inv-1', false);
      expect(onToggleLine).not.toHaveBeenCalled();
    });

    it('an invoice with zero budgetLines is always in the "checked" tri-state (excludedLineCount === 0 vacuously)', () => {
      const report = makeReport([makeInvoice({ invoiceId: 'inv-1', budgetLines: [] })]);
      renderWithRouter(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          excludedLineIds={new Set()}
          onToggle={jest.fn()}
          onToggleLine={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      const rowCheckboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      expect(rowCheckboxes[1]!.checked).toBe(true);
      expect(rowCheckboxes[1]!.indeterminate).toBe(false);
    });
  });
});
