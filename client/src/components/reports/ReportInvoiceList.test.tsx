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
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, jest, beforeAll } from '@jest/globals';
import type { TFunction } from 'i18next';
import type { SourceReportResponse, SourceReportInvoice } from '@cornerstone/shared';
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
    render(
      <ReportInvoiceList
        report={makeReport([])}
        excludedInvoiceIds={new Set()}
        onToggle={jest.fn()}
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
    render(
      <ReportInvoiceList
        report={report}
        excludedInvoiceIds={new Set()}
        onToggle={jest.fn()}
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
    render(
      <ReportInvoiceList
        report={report}
        excludedInvoiceIds={new Set(['inv-2'])}
        onToggle={jest.fn()}
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
    render(
      <ReportInvoiceList
        report={report}
        excludedInvoiceIds={new Set()}
        onToggle={onToggle}
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
    render(
      <ReportInvoiceList
        report={report}
        excludedInvoiceIds={new Set(['inv-1'])}
        onToggle={onToggle}
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
      render(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          onToggle={jest.fn()}
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
      render(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set(['inv-2'])}
          onToggle={jest.fn()}
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
      render(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          onToggle={jest.fn()}
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
      render(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set(['inv-2'])}
          onToggle={jest.fn()}
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
      render(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          onToggle={jest.fn()}
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
      render(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          onToggle={jest.fn()}
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
      render(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          onToggle={jest.fn()}
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

      const { rerender } = render(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          onToggle={jest.fn()}
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
          onToggle={jest.fn()}
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
      render(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          onToggle={jest.fn()}
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
      render(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          onToggle={jest.fn()}
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
      render(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          onToggle={jest.fn()}
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
      render(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          onToggle={jest.fn()}
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
      render(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          onToggle={jest.fn()}
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
      render(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          onToggle={jest.fn()}
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
      render(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          onToggle={jest.fn()}
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
      render(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          onToggle={jest.fn()}
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
      render(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          onToggle={jest.fn()}
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
      render(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          onToggle={jest.fn()}
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
      render(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          onToggle={jest.fn()}
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
      const { container } = render(
        <ReportInvoiceList
          report={report}
          excludedInvoiceIds={new Set()}
          onToggle={jest.fn()}
          onToggleAll={jest.fn()}
          t={t}
        />,
      );
      const buttons = within(container).getAllByRole('button');
      const clearBtn = buttons.find((b) => b.className.includes('btnSecondaryCompact'));
      expect(clearBtn).toBeDefined();
      expect(clearBtn?.textContent).toBe('sourceReports.resetSelection');
    });
  });
});
