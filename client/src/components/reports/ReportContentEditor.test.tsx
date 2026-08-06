/**
 * Unit tests for client/src/components/reports/ReportContentEditor.tsx
 *
 * Story #1900. Renders effective (overrides pre-applied) ReportContent: an optional cover-letter
 * card, a desktop table, a mobile card list, summary rows, and read-only footnotes. It performs NO
 * state management — onFieldChange/onFieldReset are called with the field's override key and the
 * component derives `isEdited` purely from `key in overrides`.
 *
 * QA re-verification round (story #1900 fix batch): two prior production defects are now fixed
 * and covered here as regression guards instead of intentionally-failing BUG tests:
 *
 *  1. Mobile card layout: ReportContentEditor.tsx now renders a `.mobileCardList` of `.mobileCard`
 *     rows (one per `content.rows` entry) alongside the desktop `<table>`, mirroring the
 *     desktop-table/mobile-card CSS-only responsive pattern used elsewhere (see
 *     ReportInvoiceList/WizardStepper) — BOTH trees are always present in the DOM (no JS viewport
 *     branch); only `@media (max-width: 767px)` toggles which one is visible. Because jsdom does
 *     not evaluate CSS media queries, every row's content (vendor, amounts, usage text, etc.) now
 *     appears TWICE in the rendered tree — once in the desktop `<table class="table">` and once in
 *     the mobile `.mobileCardList`. Tests that assert on row content therefore scope queries with
 *     `within(table)` or `within(mobileList)` to disambiguate, per the same pattern used in
 *     WizardStepper.test.tsx. CSS FINDING from a prior round (missing base `.mobileCardList {
 *     display: none }` rule) has since been fixed in ReportContentEditor.module.css — a base
 *     `display: none` rule now exists outside the media query, matching the WizardStepper/
 *     ReportInvoiceList pattern; not independently re-verifiable from jsdom (no real CSS cascade).
 *
 *  2. Status badge coloring: the table's Badge is invoked as `<Badge value={row.status}
 *     variants={statusBadgeVariants} />` where `statusBadgeVariants[row.status].className` supplies
 *     the raw-status-keyed CSS class and `.label` supplies the badge's rendered text.
 *
 * QA re-verification round 2 (labels field + editable-preview follow-up): `content.labels` (a new
 * REQUIRED `ReportContentLabels` field, built with `reportT` — the user-selected REPORT language,
 * distinct from the app's own chrome `t`) now supplies every table header, mobile-card read-only
 * caption, mobile-card EditableField `label=` prop, and source-info-block label. The chrome `t`
 * prop passed to this component (mocked below to ECHO its key, e.g.
 * `t('sourceReports.table.usage') === 'sourceReports.table.usage'`) is used ONLY for: headings
 * (Cover Letter/Report Table), field aria-labels/edited-suffix/reset-aria-label text. A previously
 * documented asymmetry — the two mobile-card editable rows (Usage/Attachments Note) rendering
 * their visible `<label>` from the chrome `t()` echo instead of `content.labels.*` — has since
 * been fixed: `ReportContentEditor.tsx` now passes `label={content.labels.usage}` /
 * `label={content.labels.attachmentsNote}` directly to `EditableField`, which renders a real
 * `<label htmlFor>` association (resolvable via `getByLabelText`), and the old standalone
 * chrome-t `<label>` element that preceded the Usage `EditableField` has been removed entirely.
 *
 * #1959 RE-SHAPE. Three changes to this component invalidate the older assertions this file used to
 * carry, and the tests below now assert the NEW behaviour instead:
 *
 *  a. The dedicated **Attachments Note column is gone** (desktop header/cell and mobile card row
 *     alike). `row.attachmentsNote` is no longer an EditableField at all — it is now READ-ONLY
 *     text, joined with `row.areaText` by ' · ' into a single grey `.usageMetaText` element that
 *     sits inside the Usage cell (a `<div>` on desktop, a `<span>` in the mobile card). So there is
 *     no `row.<id>.attachmentsNote` onFieldChange/onFieldReset wiring left in this component, and
 *     `content.labels.attachmentsNote` is no longer rendered anywhere. Tests asserting the ABSENCE
 *     of the old column are therefore paired with a positive assertion that the note text itself
 *     still renders (inline), so they can't pass by looking at the wrong tree.
 *
 *  b. The `†`/`‡` footnote markers are gone. `ReportContentRow.allocatedMarkers` was removed in
 *     favour of the booleans `isSplit` / `isDepositReduced`, which render as inline grey
 *     `.inlineNote` spans reading `(content.labels.splitNote)` / `(content.labels.depositReducedNote)`
 *     appended to the allocated-amount cell — same inline treatment the isDeposit Badge already had.
 *
 *  c. Per-column **visibility checkboxes** sit above the table in a `role="group"`, one per
 *     column, all checked initially; unchecking one removes that column's `<th>`/`<td>` from the
 *     desktop table AND its mobile-card row. Local state only — no persistence, no callback.
 * The fixture's `labels` values below are deliberately prefixed `REPORT_*_LABEL` — a differently-
 * shaped string from anything the chrome `t` mock would ever echo — so that any test asserting
 * header/caption/source-info/mobile-card-editable-label text is a genuine regression guard: if the
 * component ever regressed to calling `t()` for one of these fields instead of reading
 * `content.labels`, the assertion would see a `sourceReports.table.*` echo instead of the
 * fixture's `REPORT_*_LABEL` value and fail loudly, rather than passing by coincidence.
 *
 * Status badge label: `row.statusText` (pre-translated by buildReportContent via reportT, e.g.
 * fixture value `REPORT_PAID_TEXT` below) supplies the Badge's rendered label — NOT the chrome `t`
 * mock's echo of `sources.lines.invoiceStatus.<status>` — while `row.status` (the raw enum value)
 * only supplies the status-specific className via the STATUS_BADGE_CLASSNAME map.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, jest } from '@jest/globals';
import type { TFunction } from 'i18next';
import type {
  ReportContent,
  ReportContentRow,
  ReportContentLabels,
  ReportColumnKey,
} from '../../lib/reportContent/index.js';
import { reportColumnsForUseCase } from '../../lib/reportContent/index.js';
import { ReportContentEditor } from './ReportContentEditor.js';
import styles from './ReportContentEditor.module.css';

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}::${JSON.stringify(opts)}` : key) as unknown as TFunction;

// Deliberately differently-prefixed from anything the chrome `t` mock above would ever echo (which
// always yields a `sourceReports.*`/`sources.*` dotted key) — see header comment for why this
// shape matters for regression protection.
const LABELS: ReportContentLabels = {
  vendor: 'REPORT_VENDOR_LABEL',
  invoiceNumber: 'REPORT_INVOICE_NUMBER_LABEL',
  date: 'REPORT_DATE_LABEL',
  status: 'REPORT_STATUS_LABEL',
  invoiceAmount: 'REPORT_INVOICE_AMOUNT_LABEL',
  allocatedAmount: 'REPORT_ALLOCATED_AMOUNT_LABEL',
  usage: 'REPORT_USAGE_LABEL',
  attachmentsNote: 'REPORT_ATTACHMENTS_NOTE_LABEL',
  deposit: 'REPORT_DEPOSIT_LABEL',
  splitNote: 'REPORT_SPLIT_NOTE_LABEL',
  depositReducedNote: 'REPORT_DEPOSIT_REDUCED_NOTE_LABEL',
  source: 'REPORT_SOURCE_LABEL',
  sourceType: 'REPORT_SOURCE_TYPE_LABEL',
  reference: 'REPORT_REFERENCE_LABEL',
  generatedAt: 'REPORT_GENERATED_AT_LABEL',
  pageLabel: 'REPORT_PAGE_LABEL',
  coverLetterReferenceLabel: 'REPORT_COVER_LETTER_REFERENCE_LABEL',
  coverLetterSubjectLabel: 'REPORT_COVER_LETTER_SUBJECT_LABEL',
  skipReasonLabels: {
    footnoteFetchFailed: 'REPORT_FOOTNOTE_FETCH_FAILED_LABEL',
    footnoteInvalidPdf: 'REPORT_FOOTNOTE_INVALID_PDF_LABEL',
  },
};

function makeRow(overrides: Partial<ReportContentRow> = {}): ReportContentRow {
  return {
    invoiceId: 'inv-1',
    vendor: 'ACME',
    invoiceNumber: 'INV-001',
    dateText: '01/10/2026',
    status: null,
    statusText: null,
    invoiceAmountText: '€100.00',
    allocatedAmountValueText: '€100.00',
    isSplit: false,
    isDepositReduced: false,
    isDeposit: false,
    isRefund: false,
    refundNoteText: '',
    usageText: 'Baseline usage',
    attachmentsNote: null,
    areaText: null,
    ...overrides,
  };
}

function makeContent(overrides: Partial<ReportContent> = {}): ReportContent {
  return {
    isOverview: false,
    isClaim: false,
    tableTitle: 'Title',
    labels: LABELS,
    sourceInfo: {
      sourceName: 'Home Loan',
      sourceTypeText: 'Bank Loan',
      referenceText: null,
      generatedAtText: '01/15/2026',
    },
    coverLetter: null,
    rows: [makeRow()],
    summaryRows: [{ key: 'total', label: 'Total', amountText: '€100.00' }],
    footnotes: [],
    ...overrides,
  };
}

// The desktop `<table class="table">` and the mobile `.mobileCardList` both render the same row
// content unconditionally (CSS-only responsive — see header comment). Scope queries to one tree
// or the other to disambiguate; getDesktopTable() picks the invoice table specifically (there is
// also a separate `.summaryTable` `<table>` for summary rows).
function getDesktopTable(container: HTMLElement): HTMLElement {
  return container.querySelector('table.table') as HTMLElement;
}

function getMobileList(container: HTMLElement): HTMLElement {
  return container.querySelector(`.${styles.mobileCardList}`) as HTMLElement;
}

function renderEditor(overridesProp: Partial<Parameters<typeof ReportContentEditor>[0]> = {}) {
  const onFieldChange = jest.fn();
  const onFieldReset = jest.fn();
  const onToggleColumn = jest.fn();
  const utils = render(
    <ReportContentEditor
      content={makeContent()}
      overrides={{}}
      onFieldChange={onFieldChange}
      onFieldReset={onFieldReset}
      hiddenColumns={new Set()}
      onToggleColumn={onToggleColumn}
      attachDocuments={false}
      t={t}
      {...overridesProp}
    />,
  );
  return { ...utils, onFieldChange, onFieldReset, onToggleColumn };
}

// A fully-populated ReportContent (cover letter + one row with a non-null attachmentsNote) used by
// the field-wiring matrix and the reset-button accessible-name tests below.
function fullContent(): ReportContent {
  return makeContent({
    coverLetter: {
      sender: 'Sender baseline',
      recipient: 'Recipient baseline',
      dateLine: '01/15/2026',
      reference: 'Reference baseline',
      subject: 'Subject baseline',
      body: 'Body baseline',
      signature: 'Sender baseline',
      closing: 'Sincerely,',
    },
    rows: [makeRow({ invoiceId: 'inv-1', attachmentsNote: 'Note baseline' })],
  });
}

describe('ReportContentEditor — cover letter card', () => {
  it('does not render a cover-letter card when content.coverLetter is null', () => {
    renderEditor({ content: makeContent({ coverLetter: null }) });
    expect(screen.queryByText('sourceReports.editable.coverLetterHeading')).not.toBeInTheDocument();
  });

  it('renders sender/subject/body EditableFields and the read-only dateLine when coverLetter is present', () => {
    const content = makeContent({
      coverLetter: {
        sender: 'The Smiths\n123 Main St',
        recipient: null,
        dateLine: '01/15/2026',
        reference: null,
        subject: 'Subject text',
        body: 'Body text',
        signature: 'The Smiths',
        closing: 'Sincerely,',
      },
    });
    renderEditor({ content });

    expect(screen.getByText('sourceReports.editable.coverLetterHeading')).toBeInTheDocument();
    expect(screen.getByLabelText('sourceReports.editable.senderLabel')).toBeInTheDocument();
    expect(screen.getByLabelText('sourceReports.editable.subjectLabel')).toBeInTheDocument();
    expect(screen.getByLabelText('sourceReports.editable.bodyLabel')).toBeInTheDocument();
    // dateLine is read-only: rendered as plain text, not an editable input.
    expect(screen.getByText('01/15/2026')).toBeInTheDocument();
    expect(screen.queryByLabelText(/dateLabel/)).not.toBeInTheDocument();
  });

  // ─── PR #1951 MUST FIX 1: the Closing row had zero unit coverage ────────────────────────────
  //
  // Deleting the Closing row's JSX (ReportContentEditor.tsx L132-137) left every existing test
  // green — no test asserted the row's label, its value, or its position. `recipient`/`reference`
  // are both null here so `.letterFields` has a deterministic, fully-known child list (sender,
  // date, subject, body, closing, signature — no conditional rows to account for), letting the
  // "between body and signature" claim be checked by DOM position rather than assumed.
  it('renders the read-only Closing row (label + value) as a direct child of .letterFields, positioned between the body field and the signature field', () => {
    const content = makeContent({
      coverLetter: {
        sender: 'Sender text',
        recipient: null,
        dateLine: '01/15/2026',
        reference: null,
        subject: 'Subject text',
        body: 'Body text',
        signature: 'Signature text',
        closing: 'Sincerely yours,',
      },
    });
    const { container } = renderEditor({ content });

    // The label AND the value both render.
    expect(screen.getByText('sourceReports.editable.closingLabel')).toBeInTheDocument();
    expect(screen.getByText('Sincerely yours,')).toBeInTheDocument();

    // Position: a direct child of .letterFields, strictly between the body EditableField and the
    // signature EditableField. Located by content rather than hardcoded index math, so this fails
    // for the right reason (the row is gone, or moved) rather than merely re-asserting a position
    // number nobody chose deliberately.
    const letterFields = container.querySelector('.letterFields');
    expect(letterFields).not.toBeNull();
    const children = Array.from(letterFields!.children);
    const bodyIndex = children.findIndex((c) =>
      c.textContent?.includes('sourceReports.editable.bodyLabel'),
    );
    const closingIndex = children.findIndex((c) =>
      c.textContent?.includes('sourceReports.editable.closingLabel'),
    );
    const signatureIndex = children.findIndex((c) =>
      c.textContent?.includes('sourceReports.editable.signatureLabel'),
    );
    expect(bodyIndex).toBeGreaterThan(-1);
    expect(closingIndex).toBe(bodyIndex + 1);
    expect(signatureIndex).toBe(closingIndex + 1);
  });

  // ─── PR #1951 MUST FIX 2: #1925 AC5 — read-only captions render without a trailing colon ────
  //
  // #1925's §6 fold-in dropped AC3 and AC5 when it was carried into this issue. AC5's requirement
  // — the caption renders without a trailing colon — is the fix #1925 asked for, and until now
  // nothing pinned it: the PDF side is checked by exact equality elsewhere, but the editor side
  // had no assertion that would break if a trailing ':' were reintroduced (e.g. copying the
  // sourceInfoBlock's own `{label}: {value}` pattern a few lines below onto these rows). Both
  // read-only rows share the same `.readOnlyField`/`.readOnlyLabel` recipe (dateLine, closing), so
  // both are covered here. `getByText` does an exact (whitespace-normalized) match against a
  // single text node — if the JSX ever appended a literal ':' after the label, the rendered text
  // would become 'sourceReports.coverLetter.dateLabel:' and this exact query would stop matching.
  it("#1925 AC5: the date row's and closing row's read-only captions render without a trailing colon", () => {
    const content = makeContent({
      coverLetter: {
        sender: 'Sender text',
        recipient: null,
        dateLine: '01/15/2026',
        reference: null,
        subject: 'Subject text',
        body: 'Body text',
        signature: 'Signature text',
        closing: 'Sincerely yours,',
      },
    });
    renderEditor({ content });

    const dateLabel = screen.getByText('sourceReports.coverLetter.dateLabel');
    const closingLabel = screen.getByText('sourceReports.editable.closingLabel');
    expect(dateLabel.textContent).not.toMatch(/:$/);
    expect(closingLabel.textContent).not.toMatch(/:$/);
    // Belt-and-braces: the exact-match queries above already fail on a trailing colon (a
    // regression would render 'sourceReports.coverLetter.dateLabel:', a different string), but
    // spell out the negative directly too, since that's the literal thing AC5 forbids.
    expect(dateLabel.textContent).not.toContain(':');
    expect(closingLabel.textContent).not.toContain(':');
  });

  it('renders the recipient EditableField only when recipient is non-null', () => {
    const withRecipient = makeContent({
      coverLetter: {
        sender: '',
        recipient: '456 Bank Ave',
        dateLine: '01/15/2026',
        reference: null,
        subject: 'S',
        body: 'B',
        signature: '',
        closing: 'Sincerely,',
      },
    });
    const { rerender } = renderEditor({ content: withRecipient });
    expect(screen.getByLabelText('sourceReports.editable.recipientLabel')).toBeInTheDocument();

    const withoutRecipient = makeContent({
      coverLetter: {
        sender: '',
        recipient: null,
        dateLine: '01/15/2026',
        reference: null,
        subject: 'S',
        body: 'B',
        signature: '',
        closing: 'Sincerely,',
      },
    });
    rerender(
      <ReportContentEditor
        content={withoutRecipient}
        overrides={{}}
        onFieldChange={jest.fn()}
        onFieldReset={jest.fn()}
        hiddenColumns={new Set()}
        onToggleColumn={jest.fn()}
        attachDocuments={false}
        t={t}
      />,
    );
    expect(
      screen.queryByLabelText('sourceReports.editable.recipientLabel'),
    ).not.toBeInTheDocument();
  });

  it('renders the reference EditableField only when reference is non-null (distinct from sourceInfo.referenceText)', () => {
    const content = makeContent({
      sourceInfo: {
        sourceName: 'Home Loan',
        sourceTypeText: 'Bank Loan',
        referenceText: 'SOURCE-SEED-REF',
        generatedAtText: '01/15/2026',
      },
      coverLetter: {
        sender: '',
        recipient: null,
        dateLine: '01/15/2026',
        reference: 'LETTER-REF',
        subject: 'S',
        body: 'B',
        signature: '',
        closing: 'Sincerely,',
      },
    });
    renderEditor({ content });
    const refField = screen.getByLabelText('sourceReports.editable.referenceLabel');
    expect(refField).toHaveValue('LETTER-REF');
  });

  it('calls onFieldChange with the correct coverLetter.<field> key when a letter field changes', () => {
    const content = makeContent({
      coverLetter: {
        sender: 'Baseline sender',
        recipient: null,
        dateLine: '01/15/2026',
        reference: null,
        subject: 'Baseline subject',
        body: 'Baseline body',
        signature: 'Baseline sender',
        closing: 'Sincerely,',
      },
    });
    const { onFieldChange } = renderEditor({ content });
    const subjectField = screen.getByLabelText('sourceReports.editable.subjectLabel');
    fireEvent.change(subjectField, { target: { value: 'New subject' } });
    expect(onFieldChange).toHaveBeenCalledWith('coverLetter.subject', 'New subject');
  });

  it('calls onFieldReset with the correct key when a letter field reset button is clicked (edited state)', () => {
    const content = makeContent({
      coverLetter: {
        sender: 'Overridden sender',
        recipient: null,
        dateLine: '01/15/2026',
        reference: null,
        subject: 'S',
        body: 'B',
        signature: 'Overridden sender',
        closing: 'Sincerely,',
      },
    });
    const { onFieldReset } = renderEditor({
      content,
      overrides: { 'coverLetter.sender': 'Overridden sender' },
    });
    const resetButtons = screen.getAllByRole('button', {
      name: /resetFieldAriaLabel/,
    });
    fireEvent.click(resetButtons[0]!);
    expect(onFieldReset).toHaveBeenCalledWith('coverLetter.sender');
  });

  // ─── #1932 AC 2.1/2.3: signature is a first-class editable EditableField ────────────────────

  it('renders the signature EditableField unconditionally — present even when signature is an empty string, matching sender', () => {
    const content = makeContent({
      coverLetter: {
        sender: '',
        recipient: null,
        dateLine: '01/15/2026',
        reference: null,
        subject: 'S',
        body: 'B',
        signature: '',
        closing: 'Sincerely,',
      },
    });
    renderEditor({ content });
    expect(screen.getByLabelText('sourceReports.editable.signatureLabel')).toBeInTheDocument();
  });

  it('calls onFieldChange with the coverLetter.signature key when the signature field changes', () => {
    const content = makeContent({
      coverLetter: {
        sender: 'Baseline sender',
        recipient: null,
        dateLine: '01/15/2026',
        reference: null,
        subject: 'S',
        body: 'B',
        signature: 'Baseline signature',
        closing: 'Sincerely,',
      },
    });
    const { onFieldChange } = renderEditor({ content });
    const signatureField = screen.getByLabelText('sourceReports.editable.signatureLabel');
    fireEvent.change(signatureField, { target: { value: 'New Signature' } });
    expect(onFieldChange).toHaveBeenCalledWith('coverLetter.signature', 'New Signature');
  });

  it('marks the signature field as edited (edited-dot present) only when its own override key exists', () => {
    const content = makeContent({
      coverLetter: {
        sender: 'Baseline sender',
        recipient: null,
        dateLine: '01/15/2026',
        reference: null,
        subject: 'S',
        body: 'B',
        signature: 'Overridden Signature',
        closing: 'Sincerely,',
      },
    });
    const { container } = renderEditor({
      content,
      overrides: { 'coverLetter.signature': 'Overridden Signature' },
    });
    expect(container.querySelector('.editedDot')).toBeInTheDocument();
  });

  it('does not mark the signature field as edited when no override key exists for it (e.g. only sender was overridden)', () => {
    const content = makeContent({
      coverLetter: {
        sender: 'Overridden sender',
        recipient: null,
        dateLine: '01/15/2026',
        reference: null,
        subject: 'S',
        body: 'B',
        signature: 'Sender-derived signature',
        closing: 'Sincerely,',
      },
    });
    renderEditor({
      content,
      overrides: { 'coverLetter.sender': 'Overridden sender' },
    });
    // Only the sender field's reset button/edited-dot should exist — not a second one for
    // signature, since 'coverLetter.signature' is not itself a key in overrides.
    expect(screen.getAllByRole('button', { name: /resetFieldAriaLabel/ })).toHaveLength(1);
  });

  it('calls onFieldReset with coverLetter.signature when the signature reset button is clicked (edited state)', () => {
    const content = makeContent({
      coverLetter: {
        sender: 'Baseline sender',
        recipient: null,
        dateLine: '01/15/2026',
        reference: null,
        subject: 'S',
        body: 'B',
        signature: 'Overridden Signature',
        closing: 'Sincerely,',
      },
    });
    const { onFieldReset } = renderEditor({
      content,
      overrides: { 'coverLetter.signature': 'Overridden Signature' },
    });
    fireEvent.click(screen.getByRole('button', { name: /resetFieldAriaLabel/ }));
    expect(onFieldReset).toHaveBeenCalledWith('coverLetter.signature');
  });
});

describe('ReportContentEditor — source info block (read-only, prefixed with content.labels.*)', () => {
  it('renders sourceName/sourceType/generatedAt lines, each prefixed with its content.labels value', () => {
    const content = makeContent({
      sourceInfo: {
        sourceName: 'Home Loan',
        sourceTypeText: 'Bank Loan',
        referenceText: null,
        generatedAtText: '01/15/2026',
      },
    });
    renderEditor({ content });
    expect(screen.getByText(`${LABELS.source}: Home Loan`)).toBeInTheDocument();
    expect(screen.getByText(`${LABELS.sourceType}: Bank Loan`)).toBeInTheDocument();
    expect(screen.getByText(`${LABELS.generatedAt}: 01/15/2026`)).toBeInTheDocument();
  });

  it('omits the reference line entirely when sourceInfo.referenceText is null', () => {
    const content = makeContent({
      sourceInfo: {
        sourceName: 'Home Loan',
        sourceTypeText: 'Bank Loan',
        referenceText: null,
        generatedAtText: '01/15/2026',
      },
    });
    renderEditor({ content });
    expect(screen.queryByText(new RegExp(`^${LABELS.reference}:`))).not.toBeInTheDocument();
  });

  it('renders the reference line prefixed with content.labels.reference when referenceText is present', () => {
    const content = makeContent({
      sourceInfo: {
        sourceName: 'Home Loan',
        sourceTypeText: 'Bank Loan',
        referenceText: 'SRC-REF-9',
        generatedAtText: '01/15/2026',
      },
    });
    renderEditor({ content });
    expect(screen.getByText(`${LABELS.reference}: SRC-REF-9`)).toBeInTheDocument();
  });
});

describe('ReportContentEditor — full field-wiring matrix (onChange + onReset per field)', () => {
  // Each EditableField's onChange/onReset prop is itself an inline arrow function whose BODY is a
  // distinct statement from the JSX attribute assignment that creates it — coverage only counts
  // the body as hit once the callback actually fires. This block exercises every editable field
  // (both cover-letter and per-row) via both onChange and onReset, closing that gap explicitly
  // rather than relying on it being incidentally covered by the behavior-focused tests above.

  it.each([
    ['coverLetter.sender', 'sourceReports.editable.senderLabel'],
    ['coverLetter.recipient', 'sourceReports.editable.recipientLabel'],
    ['coverLetter.reference', 'sourceReports.editable.referenceLabel'],
    ['coverLetter.subject', 'sourceReports.editable.subjectLabel'],
    ['coverLetter.body', 'sourceReports.editable.bodyLabel'],
  ])('calls onFieldChange("%s", ...) when that letter field is edited', (key, labelKey) => {
    const { onFieldChange } = renderEditor({ content: fullContent() });
    const field = screen.getByLabelText(labelKey);
    fireEvent.change(field, { target: { value: 'edited value' } });
    expect(onFieldChange).toHaveBeenCalledWith(key, 'edited value');
  });

  it.each([
    ['coverLetter.sender', 'sourceReports.editable.senderLabel'],
    ['coverLetter.recipient', 'sourceReports.editable.recipientLabel'],
    ['coverLetter.reference', 'sourceReports.editable.referenceLabel'],
    ['coverLetter.subject', 'sourceReports.editable.subjectLabel'],
    ['coverLetter.body', 'sourceReports.editable.bodyLabel'],
  ])('calls onFieldReset("%s") when that letter field\'s reset button is clicked', (key) => {
    const { onFieldReset } = renderEditor({
      content: fullContent(),
      overrides: { [key]: 'edited value' },
    });
    const resetButtons = screen.getAllByRole('button', { name: /resetFieldAriaLabel/ });
    // Every rendered field is edited (all keys present in overrides), so click each in turn and
    // confirm the specific key under test is among the calls made.
    for (const btn of resetButtons) fireEvent.click(btn);
    expect(onFieldReset).toHaveBeenCalledWith(key);
  });

  it('#1959: attachmentsNote is READ-ONLY inline text — it renders, but no form control carries it and no onFieldChange fires for it', () => {
    const { onFieldChange, container } = renderEditor({ content: fullContent() });
    const table = getDesktopTable(container);
    // Positive: the note text IS on screen (so the negatives below are looking at the right tree).
    expect(within(table).getByText('Note baseline')).toBeInTheDocument();
    // Negative: it is not the value of any input/textarea — there is nothing to type into.
    expect(within(table).queryByDisplayValue('Note baseline')).not.toBeInTheDocument();
    // Editing every remaining editable field in the row never produces an attachmentsNote key.
    for (const input of within(table).getAllByRole('textbox')) {
      fireEvent.change(input, { target: { value: 'anything' } });
    }
    expect(onFieldChange).toHaveBeenCalled(); // the usage field did fire — the loop was not empty
    expect(onFieldChange).not.toHaveBeenCalledWith('row.inv-1.attachmentsNote', expect.anything());
  });

  it('calls onFieldReset for the row-level usageText field', () => {
    const content = fullContent();
    const { onFieldReset, container } = renderEditor({
      content,
      overrides: { 'row.inv-1.usageText': content.rows[0]!.usageText },
    });
    const table = getDesktopTable(container);
    const usageInput = within(table).getByDisplayValue(content.rows[0]!.usageText);
    const resetBtn = usageInput.parentElement!.parentElement!.querySelector(
      'button',
    ) as HTMLElement;
    fireEvent.click(resetBtn);
    expect(onFieldReset).toHaveBeenCalledWith('row.inv-1.usageText');
  });
});

describe('ReportContentEditor — reset button accessible names (no raw field-identifier leakage)', () => {
  it('composes the row-level usage reset button name from a translated field name, never the raw "usage" identifier — and #1959 leaves no attachmentsNote reset button at all', () => {
    const content = fullContent();
    const { container } = renderEditor({
      content,
      overrides: {
        'row.inv-1.usageText': content.rows[0]!.usageText,
        // Still supplied: even with an attachmentsNote override present in the map, the component
        // must not grow a reset affordance for a field it no longer lets you edit.
        'row.inv-1.attachmentsNote': content.rows[0]!.attachmentsNote as string,
      },
    });
    const table = getDesktopTable(container);

    expect(
      within(table).getByRole('button', {
        name: 'sourceReports.editable.resetFieldAriaLabel::{"field":"sourceReports.table.usage"}',
      }),
    ).toBeInTheDocument();

    // #1959: usage is now the ONLY editable row field, so exactly one reset button per row.
    expect(within(table).getAllByRole('button', { name: /resetFieldAriaLabel/ })).toHaveLength(1);
    expect(
      within(table).queryByRole('button', {
        name: 'sourceReports.editable.resetFieldAriaLabel::{"field":"sourceReports.editable.attachmentsNoteLabel"}',
      }),
    ).not.toBeInTheDocument();

    // Neither raw, untranslated identifier ever stands alone as a button's accessible name.
    expect(within(table).queryByRole('button', { name: 'usage' })).not.toBeInTheDocument();
    expect(
      within(table).queryByRole('button', { name: 'attachmentsNote' }),
    ).not.toBeInTheDocument();
  });

  it('composes each cover-letter reset button name from its own translated field label', () => {
    const content = fullContent();
    renderEditor({
      content,
      overrides: {
        'coverLetter.sender': content.coverLetter!.sender,
        'coverLetter.recipient': content.coverLetter!.recipient as string,
        'coverLetter.reference': content.coverLetter!.reference as string,
        'coverLetter.subject': content.coverLetter!.subject,
        'coverLetter.body': content.coverLetter!.body,
        'coverLetter.signature': content.coverLetter!.signature,
      },
    });

    for (const labelKey of [
      'senderLabel',
      'recipientLabel',
      'referenceLabel',
      'subjectLabel',
      'bodyLabel',
      'signatureLabel',
    ]) {
      expect(
        screen.getByRole('button', {
          name: `sourceReports.editable.resetFieldAriaLabel::{"field":"sourceReports.editable.${labelKey}"}`,
        }),
      ).toBeInTheDocument();
    }
  });
});

describe('ReportContentEditor — table rows', () => {
  it('renders the desktop table headers from content.labels.*, not a chrome t() echo', () => {
    const rows = [makeRow()];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    const table = getDesktopTable(container);
    expect(within(table).getByText(LABELS.vendor)).toBeInTheDocument();
    expect(within(table).getByText(LABELS.invoiceNumber)).toBeInTheDocument();
    expect(within(table).getByText(LABELS.date)).toBeInTheDocument();
    expect(within(table).getByText(LABELS.invoiceAmount)).toBeInTheDocument();
    expect(within(table).getByText(LABELS.allocatedAmount)).toBeInTheDocument();
    expect(within(table).getByText(LABELS.usage)).toBeInTheDocument();
    // None of the chrome-t echoes for these same concepts ever leak into the header row.
    expect(within(table).queryByText('sourceReports.table.vendor')).not.toBeInTheDocument();
    expect(within(table).queryByText('sourceReports.table.usage')).not.toBeInTheDocument();
  });

  it('renders exactly one <tr> per content.rows entry, matching vendor/invoiceNumber/date', () => {
    const rows = [
      makeRow({ invoiceId: 'inv-1', vendor: 'ACME', invoiceNumber: 'A-1' }),
      makeRow({ invoiceId: 'inv-2', vendor: 'Beta', invoiceNumber: 'B-2' }),
    ];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    const table = getDesktopTable(container);
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(within(table).getByText('ACME')).toBeInTheDocument();
    expect(within(table).getByText('A-1')).toBeInTheDocument();
    expect(within(table).getByText('Beta')).toBeInTheDocument();
    expect(within(table).getByText('B-2')).toBeInTheDocument();
  });

  it('renders invoiceAmountText/allocatedAmountValueText as plain text cells, never as inputs', () => {
    const rows = [makeRow({ invoiceAmountText: '€777.00', allocatedAmountValueText: '€555.00' })];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    const table = getDesktopTable(container);
    expect(within(table).getByText('€777.00')).toBeInTheDocument();
    expect(within(table).getByText('€555.00')).toBeInTheDocument();
    // No <input>/<textarea> exists that carries either amount as its value.
    expect(within(table).queryByDisplayValue('€777.00')).not.toBeInTheDocument();
    expect(within(table).queryByDisplayValue('€555.00')).not.toBeInTheDocument();
  });

  it('composes the allocated cell as valueText + refund note when isRefund', () => {
    const rows = [
      makeRow({
        allocatedAmountValueText: '€-200.00',
        isRefund: true,
        refundNoteText: '(refund)',
      }),
    ];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    const table = getDesktopTable(container);
    expect(within(table).getByText('€-200.00 (refund)')).toBeInTheDocument();
  });

  it('applies the refundAmount CSS class (not an inline style) to both amount cells when isRefund', () => {
    const rows = [
      makeRow({
        isRefund: true,
        invoiceAmountText: '€200.00',
        allocatedAmountValueText: '€-200.00',
      }),
    ];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    const table = getDesktopTable(container);
    const refundCells = table.querySelectorAll(`td.${styles.refundAmount}`);
    expect(refundCells).toHaveLength(2); // invoiceAmount cell + allocatedAmount cell
    for (const cell of Array.from(refundCells)) {
      expect(cell).not.toHaveAttribute('style');
    }
  });

  it('never applies the refundAmount class to a non-refund row', () => {
    const rows = [makeRow({ isRefund: false })];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    const table = getDesktopTable(container);
    expect(table.querySelectorAll(`td.${styles.refundAmount}`)).toHaveLength(0);
  });

  it('renders a Usage EditableField per row, wired to row.<invoiceId>.usageText', () => {
    const rows = [makeRow({ invoiceId: 'inv-9', usageText: 'Kitchen work' })];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    const table = getDesktopTable(container);
    const usageInput = within(table).getByDisplayValue('Kitchen work');
    expect(usageInput.tagName).toBe('INPUT');
  });

  it('marks the usage field as edited (edited-dot present) only when its override key exists', () => {
    const rows = [makeRow({ invoiceId: 'inv-9', usageText: 'Edited usage' })];
    const { container } = renderEditor({
      content: makeContent({ rows }),
      overrides: { 'row.inv-9.usageText': 'Edited usage' },
    });
    expect(container.querySelector('.editedDot')).toBeInTheDocument();
  });

  it('does not mark the usage field as edited when no override key exists for it', () => {
    const rows = [makeRow({ invoiceId: 'inv-9' })];
    const { container } = renderEditor({ content: makeContent({ rows }), overrides: {} });
    expect(container.querySelector('.editedDot')).not.toBeInTheDocument();
  });

  it('renders no Status column/badge when isOverview is false', () => {
    const rows = [makeRow({ statusText: null })];
    renderEditor({ content: makeContent({ isOverview: false, rows }) });
    expect(screen.queryByText(LABELS.status)).not.toBeInTheDocument();
  });

  it('renders a Status column (labeled from content.labels.status) and a Badge whose label comes from row.statusText, not a chrome t() echo', () => {
    // row.status is the raw value fed to Badge for className purposes; row.statusText (already
    // translated via reportT by buildReportContent) supplies the rendered label text.
    const rows = [makeRow({ status: 'paid', statusText: 'REPORT_PAID_TEXT' })];
    const { container } = renderEditor({ content: makeContent({ isOverview: true, rows }) });
    const table = getDesktopTable(container);
    expect(within(table).getByText(LABELS.status)).toBeInTheDocument();
    expect(within(table).getByText('REPORT_PAID_TEXT')).toBeInTheDocument();
    // The chrome-t echo for this same concept never appears — the Badge label is NOT re-derived
    // via the chrome t() prop.
    expect(within(table).queryByText('sources.lines.invoiceStatus.paid')).not.toBeInTheDocument();
  });

  it('gives the status Badge the status-specific className via the raw row.status key', () => {
    const rows = [makeRow({ status: 'paid', statusText: 'REPORT_PAID_TEXT' })];
    const { container } = renderEditor({ content: makeContent({ isOverview: true, rows }) });
    const table = getDesktopTable(container);
    const badge = within(table).getByText('REPORT_PAID_TEXT');
    expect(badge.className).toContain(styles.statusPaid);
  });

  it('#1959: renders attachmentsNote as grey inline .usageMetaText INSIDE the usage cell — no Attachments Note column header, and only for rows that have a note', () => {
    const rows = [
      // Distinct usageText per row so the cell lookup below is unambiguous.
      makeRow({
        invoiceId: 'inv-1',
        usageText: 'Noted usage',
        attachmentsNote: '1 attachment: Invoice',
      }),
      makeRow({ invoiceId: 'inv-2', usageText: 'Plain usage', attachmentsNote: null }),
    ];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    const table = getDesktopTable(container);

    // Positive: the note text renders, as a .usageMetaText element, in the SAME <td> as inv-1's
    // usage input — proving it moved inline rather than merely disappearing.
    const noteEl = within(table).getByText('1 attachment: Invoice');
    expect(noteEl.className).toContain(styles.usageMetaText);
    const usageCell = within(table).getByDisplayValue('Noted usage').closest('td')!;
    expect(usageCell).toContainElement(noteEl);
    // inv-2's own usage cell does NOT get the note.
    expect(within(table).getByDisplayValue('Plain usage').closest('td')!).not.toContainElement(
      noteEl,
    );

    // Negative (now safe — we just proved we're looking at the populated tree): the dedicated
    // column's header label is gone, and the note is not an editable value.
    expect(within(table).queryByText(LABELS.attachmentsNote)).not.toBeInTheDocument();
    expect(within(table).queryByDisplayValue('1 attachment: Invoice')).not.toBeInTheDocument();

    // inv-2 (no note) contributes no .usageMetaText element — exactly one exists in the table.
    expect(table.querySelectorAll(`.${styles.usageMetaText}`)).toHaveLength(1);
  });

  it('#1959: renders no .usageMetaText element at all when a row has neither attachmentsNote nor areaText', () => {
    const withMeta = [makeRow({ attachmentsNote: '1 attachment: Invoice' })];
    const { container: populated } = renderEditor({ content: makeContent({ rows: withMeta }) });
    // Control: the selector DOES match when meta is present, so the 0-length assertion below is
    // testing absence of content rather than a typo'd class name.
    expect(populated.querySelectorAll(`.${styles.usageMetaText}`).length).toBeGreaterThan(0);

    const { container } = renderEditor({
      content: makeContent({ rows: [makeRow({ attachmentsNote: null, areaText: null })] }),
    });
    expect(container.querySelectorAll(`.${styles.usageMetaText}`)).toHaveLength(0);
    expect(screen.queryByText(LABELS.attachmentsNote)).not.toBeInTheDocument();
  });

  it('calls onFieldChange with the correct row.<invoiceId>.usageText key on edit', () => {
    const rows = [makeRow({ invoiceId: 'inv-42', usageText: 'Baseline' })];
    const { onFieldChange, container } = renderEditor({ content: makeContent({ rows }) });
    const table = getDesktopTable(container);
    const usageInput = within(table).getByDisplayValue('Baseline');
    fireEvent.change(usageInput, { target: { value: 'Changed' } });
    expect(onFieldChange).toHaveBeenCalledWith('row.inv-42.usageText', 'Changed');
  });

  it.each([
    ['desktop table', getDesktopTable],
    ['mobile card', getMobileList],
  ])(
    '#1959: clicking every reset button in a row resets ONLY row.<invoiceId>.usageText — attachmentsNote has no reset control (%s)',
    (_label, getTree) => {
      const rows = [
        makeRow({ invoiceId: 'inv-42', usageText: 'Edited usage', attachmentsNote: 'Some note' }),
      ];
      const { onFieldReset, container } = renderEditor({
        content: makeContent({ rows }),
        // Both keys overridden, so a lingering attachmentsNote affordance would render its reset
        // button and be caught below.
        overrides: {
          'row.inv-42.usageText': 'Edited usage',
          'row.inv-42.attachmentsNote': 'Some note',
        },
      });
      const tree = within(getTree(container));
      // Positive: the note text is present in this tree (read-only), so the negative below is not
      // passing merely because we picked an empty subtree.
      expect(tree.getByText('Some note')).toBeInTheDocument();

      const resetButtons = tree.getAllByRole('button', { name: /resetFieldAriaLabel/ });
      expect(resetButtons).toHaveLength(1);
      for (const btn of resetButtons) fireEvent.click(btn);
      expect(onFieldReset).toHaveBeenCalledWith('row.inv-42.usageText');
      expect(onFieldReset).not.toHaveBeenCalledWith('row.inv-42.attachmentsNote');
    },
  );
});

describe('ReportContentEditor — summary rows and footnotes', () => {
  it('AC4: renders a single Total-only summaryRow as a plain (non-editable) row with label and amount', () => {
    const content = makeContent({
      // Distinct amount string from the default row's own €100.00 to avoid ambiguous matches
      // against the table body (which also renders the fixture row's amount cells).
      summaryRows: [{ key: 'total', label: 'Total', amountText: '€550.00' }],
    });
    renderEditor({ content });
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('€550.00')).toBeInTheDocument();
    // No subtotal-labeled row survives alongside it.
    expect(screen.queryByText(/Subtotal/)).not.toBeInTheDocument();
  });

  it('renders no summary table when summaryRows is empty', () => {
    const content = makeContent({ summaryRows: [] });
    const { container } = renderEditor({ content });
    expect(container.querySelector('table + table')).not.toBeInTheDocument();
  });

  it('renders each footnote with its unnumbered/shared marker and text, read-only', () => {
    const content = makeContent({
      footnotes: [
        {
          id: 'split',
          marker: 'partial',
          text: 'Amount shown reflects only the portion allocated to this source.',
        },
        {
          id: 'depositReduced',
          marker: 'less deposit',
          text: 'This position reflects deposits claimed separately.',
        },
      ],
    });
    renderEditor({ content });
    expect(screen.getByText('partial:')).toBeInTheDocument();
    expect(
      screen.getByText(/Amount shown reflects only the portion allocated to this source\./),
    ).toBeInTheDocument();
    // getByText with a string fails when marker has NBSP: the lib normalizes element text
    // (NBSP→space) but does NOT normalize the matcher, so ==='less deposit:' always mismatches.
    // Regex is tested against the already-normalized text, so \s matches the collapsed space.
    expect(screen.getByText(/^less\sdeposit:$/)).toBeInTheDocument();
    // Whitespace-parity guard (#1965): the <li>'s combined text must be "partial: Amount shown…" —
    // marker, a single space, then the note text. jest-dom's toHaveTextContent normalises whitespace
    // (including NBSP→space) in the element's textContent before comparing, so this catches a
    // missing space (or extra space) between the <span> and the text node without being fragile to
    // NBSP, while the independent getByText checks above cannot detect inter-node spacing defects.
    // Locate via the already-proven marker <span> and walk up to the enclosing <li>.
    const splitLi = screen.getByText('partial:').closest('li') as HTMLElement;
    expect(splitLi).toHaveTextContent(
      'partial: Amount shown reflects only the portion allocated to this source.',
    );
  });

  it('renders no footnotes block when footnotes is empty', () => {
    const content = makeContent({ footnotes: [] });
    renderEditor({ content });
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('ReportContentEditor — isClaim (AC3: claim reports omit the source info metadata block)', () => {
  it('AC3.1: omits the sourceInfoBlock entirely when content.isClaim is true', () => {
    const content = makeContent({ isClaim: true });
    renderEditor({ content });
    expect(screen.queryByText(`${LABELS.source}: Home Loan`)).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(`^${LABELS.sourceType}:`))).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(`^${LABELS.generatedAt}:`))).not.toBeInTheDocument();
  });

  it('renders the sourceInfoBlock when content.isClaim is false (budget-overview/proof-of-funds)', () => {
    const content = makeContent({ isClaim: false });
    renderEditor({ content });
    expect(screen.getByText(`${LABELS.source}: Home Loan`)).toBeInTheDocument();
  });
});

describe('ReportContentEditor — isDeposit (AC2.1: inline Deposit badge, no marker)', () => {
  it('renders a Deposit badge in the desktop allocated cell and no ‡ marker for an isDeposit row', () => {
    const rows = [
      makeRow({
        invoiceId: 'inv-1',
        isDeposit: true,
        allocatedAmountValueText: '€300.00',
      }),
    ];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    const table = getDesktopTable(container);
    expect(within(table).getByText('REPORT_DEPOSIT_LABEL')).toBeInTheDocument();
    expect(within(table).queryByText(/‡/)).not.toBeInTheDocument();
  });

  it('renders the same Deposit badge in the mobile card allocated row', () => {
    const rows = [makeRow({ invoiceId: 'inv-1', isDeposit: true })];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    const card = within(getMobileList(container));
    expect(card.getByText('REPORT_DEPOSIT_LABEL')).toBeInTheDocument();
  });

  it('renders no Deposit badge for a non-deposit row', () => {
    const rows = [makeRow({ invoiceId: 'inv-1', isDeposit: false })];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    expect(screen.queryByText('REPORT_DEPOSIT_LABEL')).not.toBeInTheDocument();
    void container;
  });
});

describe('ReportContentEditor — #1959 isSplit / isDepositReduced inline labels (replacing the † / ‡ footnote markers)', () => {
  // The allocated cell is a composite of value text + optional badge + optional inline notes, so
  // assert on the CELL's whole textContent — that is what a user reads — rather than on a single
  // text node, which would miss ordering/spacing regressions between the runs.
  function allocatedCellText(container: HTMLElement): string {
    const table = getDesktopTable(container);
    // The allocated cell is the only right-aligned <td> holding the €400.00 value; match on the
    // <td> itself so composite children (badge + inline note spans) are included in textContent.
    return within(table).getByText(/^€400\.00/, { selector: 'td' }).textContent!;
  }

  it('appends an inline (splitNote) label to the desktop allocated cell when isSplit, and no † marker', () => {
    const rows = [
      makeRow({ invoiceId: 'inv-1', isSplit: true, allocatedAmountValueText: '€400.00' }),
    ];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    expect(allocatedCellText(container)).toBe('€400.00 (REPORT_SPLIT_NOTE_LABEL)');
    // The label is styled as a grey inline note, not a plain text run.
    const table = getDesktopTable(container);
    const noteEl = within(table).getByText('(REPORT_SPLIT_NOTE_LABEL)');
    expect(noteEl.className).toContain(styles.inlineNote);
    expect(within(table).queryByText(/†/)).not.toBeInTheDocument();
  });

  it('appends an inline (depositReducedNote) label to the desktop allocated cell when isDepositReduced, and no ‡ marker', () => {
    const rows = [
      makeRow({
        invoiceId: 'inv-1',
        isDepositReduced: true,
        allocatedAmountValueText: '€400.00',
      }),
    ];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    expect(allocatedCellText(container)).toBe('€400.00 (REPORT_DEPOSIT_REDUCED_NOTE_LABEL)');
    const table = getDesktopTable(container);
    expect(within(table).getByText('(REPORT_DEPOSIT_REDUCED_NOTE_LABEL)').className).toContain(
      styles.inlineNote,
    );
    expect(within(table).queryByText(/‡/)).not.toBeInTheDocument();
  });

  it('renders BOTH inline labels, split before deposit-reduced, when both flags are set', () => {
    const rows = [
      makeRow({
        invoiceId: 'inv-1',
        isSplit: true,
        isDepositReduced: true,
        allocatedAmountValueText: '€400.00',
      }),
    ];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    expect(allocatedCellText(container)).toBe(
      '€400.00 (REPORT_SPLIT_NOTE_LABEL) (REPORT_DEPOSIT_REDUCED_NOTE_LABEL)',
    );
  });

  it('renders the same inline labels in the mobile card allocated row', () => {
    const rows = [
      makeRow({
        invoiceId: 'inv-1',
        isSplit: true,
        isDepositReduced: true,
        allocatedAmountValueText: '€400.00',
      }),
    ];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    const card = within(getMobileList(container));
    expect(card.getByText('(REPORT_SPLIT_NOTE_LABEL)').className).toContain(styles.inlineNote);
    expect(card.getByText('(REPORT_DEPOSIT_REDUCED_NOTE_LABEL)').className).toContain(
      styles.inlineNote,
    );
  });

  it('renders neither inline label when both flags are false', () => {
    const rows = [
      makeRow({
        invoiceId: 'inv-1',
        isSplit: false,
        isDepositReduced: false,
        allocatedAmountValueText: '€400.00',
      }),
    ];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    // Positive anchor: the allocated cell rendered its value, so the absences are meaningful.
    expect(allocatedCellText(container)).toBe('€400.00');
    expect(screen.queryByText('(REPORT_SPLIT_NOTE_LABEL)')).not.toBeInTheDocument();
    expect(screen.queryByText('(REPORT_DEPOSIT_REDUCED_NOTE_LABEL)')).not.toBeInTheDocument();
    expect(container.querySelectorAll(`.${styles.inlineNote}`)).toHaveLength(0);
  });
});

describe('ReportContentEditor — #1973 column visibility toggles (controlled: hiddenColumns/onToggleColumn props)', () => {
  function getToggleGroup(container: HTMLElement): HTMLElement {
    return within(container).getByRole('group', {
      name: 'sourceReports.editable.columnVisibilityLabel',
    });
  }

  it('renders one checked checkbox per column when hiddenColumns is empty, labeled from content.labels.*, with a Status toggle only for overview reports', () => {
    const { container } = renderEditor({ content: makeContent({ isOverview: false }) });
    const group = within(getToggleGroup(container));
    const boxes = group.getAllByRole('checkbox');
    expect(boxes).toHaveLength(6); // vendor, invoiceNumber, date, invoiceAmount, allocatedAmount, usage
    for (const box of boxes) expect(box).toBeChecked();
    // Labels come from content.labels.* (report language), never a chrome t() echo. Allocated
    // Amount is excluded from this loop — its label carries a trailing " *" required marker (see
    // the dedicated AC2.2 test below), so an exact-match getByLabelText would not find it here.
    for (const label of [
      LABELS.vendor,
      LABELS.invoiceNumber,
      LABELS.date,
      LABELS.invoiceAmount,
      LABELS.usage,
    ]) {
      expect(group.getByLabelText(label)).toBeChecked();
    }
    expect(group.getByLabelText(LABELS.allocatedAmount, { exact: false })).toBeChecked();
    expect(group.queryByLabelText(LABELS.status)).not.toBeInTheDocument();
  });

  it('adds a Status toggle when isOverview is true', () => {
    const { container } = renderEditor({ content: makeContent({ isOverview: true }) });
    const group = within(getToggleGroup(container));
    expect(group.getAllByRole('checkbox')).toHaveLength(7);
    expect(group.getByLabelText(LABELS.status)).toBeChecked();
  });

  // (AC 2.5, carried from #1966 AC2) The rendered checkbox ORDER — not just its length — must
  // equal reportColumnsForUseCase(isOverview) exactly, for both use cases, independent of
  // hiddenColumns' contents (hiding a column removes its th/td from the table, never its own
  // toggle). A count-only assertion previously passed against a hand-typed array literal that had
  // silently drifted from this same derivation (AC 2.1 violation, since fixed) — a future reorder,
  // or a swapped column that happened to keep the same length, would have passed it too. Order
  // matters here beyond cosmetics: the PDF's header row is built from this identical array.
  it.each([
    ['overview', true, 7],
    ['claim/proof-of-funds', false, 6],
  ] as const)(
    '(AC2.5, scenario 27) %s: rendered checkbox order exactly equals reportColumnsForUseCase(isOverview) (%i columns), even with some columns hidden',
    (_label, isOverview, expectedCount) => {
      expect(reportColumnsForUseCase(isOverview)).toHaveLength(expectedCount);
      const { container } = renderEditor({
        content: makeContent({ isOverview }),
        hiddenColumns: new Set<ReportColumnKey>(['vendor']),
      });
      const boxes = within(getToggleGroup(container)).getAllByRole('checkbox');
      expect(boxes).toHaveLength(expectedCount);

      // Guard the guard: if data-column-key were ever dropped from the markup, every entry below
      // would read null. reportColumnsForUseCase(isOverview) is never empty (6 or 7 real keys), so
      // that failure mode is NOT the "[] equals []" vacuous-pass shape — a null-filled array can
      // never toEqual a string-keyed one — but asserting non-null explicitly here means the test
      // fails with an immediate "attribute missing" signal rather than a confusing array diff.
      const renderedOrder = boxes.map((box) => box.getAttribute('data-column-key'));
      for (const key of renderedOrder) {
        expect(key).not.toBeNull();
      }
      expect(renderedOrder).toEqual(reportColumnsForUseCase(isOverview));
    },
  );

  it('(AC2.6, scenario 28) claim/proof-of-funds NEVER renders a Status checkbox, at any hiddenColumns value — including one that names status explicitly', () => {
    for (const hiddenColumns of [
      new Set<ReportColumnKey>(),
      new Set<ReportColumnKey>(['status']),
      new Set<ReportColumnKey>(['vendor', 'usage']),
    ]) {
      const { container, unmount } = renderEditor({
        content: makeContent({ isOverview: false }),
        hiddenColumns,
      });
      expect(
        within(getToggleGroup(container)).queryByLabelText(LABELS.status),
      ).not.toBeInTheDocument();
      unmount();
    }
  });

  it('(AC2.2, scenario 25) the Allocated Amount checkbox is disabled and has a non-empty accessible description', () => {
    const { container } = renderEditor();
    const box = within(getToggleGroup(container)).getByLabelText(LABELS.allocatedAmount, {
      exact: false,
    });
    expect(box).toBeDisabled();
    const describedBy = box.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const descriptionEl = container.querySelector(`#${describedBy}`);
    expect(descriptionEl).not.toBeNull();
    expect(descriptionEl!.textContent!.trim().length).toBeGreaterThan(0);
  });

  it('(AC2.3, scenario 26) every OTHER column checkbox is enabled, and hiding every one of them at once leaves the desktop table with exactly one (Allocated Amount) column', () => {
    const { container } = renderEditor({ content: makeContent({ isOverview: true }) });
    const group = within(getToggleGroup(container));
    for (const box of group.getAllByRole('checkbox')) {
      if (box.getAttribute('aria-describedby')) continue; // the locked allocatedAmount checkbox
      expect(box).not.toBeDisabled();
    }

    const everyHideable = new Set<ReportColumnKey>([
      'vendor',
      'invoiceNumber',
      'date',
      'status',
      'invoiceAmount',
      'usage',
    ]);
    const { container: hiddenContainer } = renderEditor({
      content: makeContent({ isOverview: true }),
      hiddenColumns: everyHideable,
    });
    const table = getDesktopTable(hiddenContainer);
    expect(table.querySelectorAll('thead th')).toHaveLength(1);
    expect(within(table).getByText(LABELS.allocatedAmount, { selector: 'th' })).toBeInTheDocument();
  });

  // Every column gets a DISTINCT value so a disappearing cell can be attributed to the toggled
  // column and not shadowed by an identical string elsewhere in the table (the fixture's default
  // invoice/allocated/summary amounts are all €100.00).
  function distinctValueContent(): ReportContent {
    return makeContent({
      rows: [
        makeRow({
          invoiceId: 'inv-1',
          vendor: 'ACME',
          invoiceNumber: 'INV-001',
          dateText: '01/10/2026',
          invoiceAmountText: '€111.00',
          allocatedAmountValueText: '€222.00',
          usageText: 'Kitchen work',
        }),
      ],
      summaryRows: [{ key: 'total', label: 'Total', amountText: '€333.00' }],
    });
  }

  // allocatedAmount is deliberately excluded here — it is the locked column and can never be
  // hidden by ANY hiddenColumns value (see columns.test.ts's "defense-in-depth" coverage and the
  // AC2.2 disabled-checkbox test above), so a "hiding it removes the column" case would assert a
  // state the production code makes unreachable.
  it.each([
    [LABELS.vendor, 'ACME', 'vendor'],
    [LABELS.invoiceNumber, 'INV-001', 'invoiceNumber'],
    [LABELS.date, '01/10/2026', 'date'],
    [LABELS.invoiceAmount, '€111.00', 'invoiceAmount'],
  ] as const)(
    'a hiddenColumns prop containing "%s" removes that column header AND its cell value from the desktop table and the mobile card',
    (label, cellValue, columnKey) => {
      const { container, rerender } = renderEditor({ content: distinctValueContent() });
      const table = getDesktopTable(container);
      const mobileList = getMobileList(container);
      const headerCountBefore = table.querySelectorAll('thead th').length;

      // Positive: header label and cell value are both present with nothing hidden.
      expect(within(table).getByText(label, { selector: 'th' })).toBeInTheDocument();
      expect(within(table).getByText(cellValue)).toBeInTheDocument();
      expect(within(mobileList).getByText(cellValue)).toBeInTheDocument();

      rerender(
        <ReportContentEditor
          content={distinctValueContent()}
          overrides={{}}
          onFieldChange={jest.fn()}
          onFieldReset={jest.fn()}
          hiddenColumns={new Set<ReportColumnKey>([columnKey])}
          onToggleColumn={jest.fn()}
          attachDocuments={false}
          t={t}
        />,
      );

      // ...and both are gone afterwards, in BOTH responsive trees.
      expect(within(table).queryByText(label, { selector: 'th' })).not.toBeInTheDocument();
      expect(within(table).queryByText(cellValue)).not.toBeInTheDocument();
      expect(within(mobileList).queryByText(cellValue)).not.toBeInTheDocument();
      expect(table.querySelectorAll('thead th')).toHaveLength(headerCountBefore - 1);

      // The toggle itself stays visible (so the column can be restored) and reflects hidden state.
      const box = within(getToggleGroup(container)).getByLabelText(label);
      expect(box).not.toBeChecked();
    },
  );

  it('unchecking the Usage toggle (hiddenColumns={usage}) removes the usage EditableField (and its inline meta text) entirely', () => {
    const rows = [
      makeRow({ invoiceId: 'inv-1', usageText: 'Kitchen work', areaText: 'Ground Floor' }),
    ];
    const { container } = renderEditor({
      content: makeContent({ rows }),
      hiddenColumns: new Set<ReportColumnKey>(['usage']),
    });
    expect(screen.queryAllByDisplayValue('Kitchen work')).toHaveLength(0);
    expect(container.querySelectorAll(`.${styles.usageMetaText}`)).toHaveLength(0);
  });

  it('unchecking the Status toggle (hiddenColumns={status}) removes the status Badge from an overview report', () => {
    const rows = [makeRow({ invoiceId: 'inv-1', status: 'paid', statusText: 'REPORT_PAID_TEXT' })];
    const { container } = renderEditor({
      content: makeContent({ isOverview: true, rows }),
      hiddenColumns: new Set<ReportColumnKey>(['status']),
    });
    expect(screen.queryAllByText('REPORT_PAID_TEXT')).toHaveLength(0);
    expect(
      within(getDesktopTable(container)).queryByText(LABELS.status, { selector: 'th' }),
    ).not.toBeInTheDocument();
  });

  it('hides only the named column, leaving the others rendered (each toggle is independent)', () => {
    const { container } = renderEditor({
      hiddenColumns: new Set<ReportColumnKey>(['vendor']),
    });
    const table = getDesktopTable(container);
    expect(within(table).queryByText('ACME')).not.toBeInTheDocument();
    // Every other column's value survives.
    expect(within(table).getByText('INV-001')).toBeInTheDocument();
    expect(within(table).getByText('01/10/2026')).toBeInTheDocument();
    expect(within(table).getByDisplayValue('Baseline usage')).toBeInTheDocument();
  });

  it('(scenario 29) clicking a checkbox calls onToggleColumn with the exact column key, and NEVER onFieldChange/onFieldReset — visibility reaches its own callback, never the override callbacks', () => {
    const { container, onFieldChange, onFieldReset, onToggleColumn } = renderEditor({
      content: makeContent({ isOverview: true }),
    });
    fireEvent.click(within(getToggleGroup(container)).getByLabelText(LABELS.vendor));
    expect(onToggleColumn).toHaveBeenCalledTimes(1);
    expect(onToggleColumn).toHaveBeenCalledWith('vendor');

    fireEvent.click(within(getToggleGroup(container)).getByLabelText(LABELS.usage));
    expect(onToggleColumn).toHaveBeenCalledTimes(2);
    expect(onToggleColumn).toHaveBeenLastCalledWith('usage');

    expect(onFieldChange).not.toHaveBeenCalled();
    expect(onFieldReset).not.toHaveBeenCalled();
  });

  it('(AC6.2, scenario 30) the warning banner renders with role="status" and the usageHiddenAttachmentsWarning key ONLY when Usage is hidden AND attachDocuments is on — absent in the other three combinations', () => {
    const matrix: [boolean, boolean, boolean][] = [
      // [usageHidden, attachDocuments, expectBanner]
      [false, false, false],
      [false, true, false],
      [true, false, false],
      [true, true, true],
    ];
    for (const [usageHidden, attachDocuments, expectBanner] of matrix) {
      const { container, unmount } = renderEditor({
        hiddenColumns: usageHidden
          ? new Set<ReportColumnKey>(['usage'])
          : new Set<ReportColumnKey>(),
        attachDocuments,
      });
      const banner = within(container).queryByRole('status');
      if (expectBanner) {
        expect(banner).not.toBeNull();
        expect(banner!.textContent).toBe('sourceReports.editable.usageHiddenAttachmentsWarning');
      } else {
        expect(banner).toBeNull();
      }
      unmount();
    }
  });

  it('(AC1.3/AC1.4, scenario 31) columnVisibilityHint is no longer rendered anywhere', () => {
    renderEditor();
    expect(screen.queryByText(/columnVisibilityHint/)).not.toBeInTheDocument();
  });
});

describe('ReportContentEditor — areaText / attachmentsNote inline meta (#1959: one grey element inside the usage cell)', () => {
  it('renders areaText as a distinct .usageMetaText <div> inside the desktop usage cell, not inside the editable value', () => {
    const rows = [
      makeRow({ invoiceId: 'inv-1', usageText: 'Kitchen work', areaText: 'Ground Floor' }),
    ];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    const table = getDesktopTable(container);
    const usageInput = within(table).getByDisplayValue('Kitchen work');
    // The area text is not baked into the editable input's value.
    expect(usageInput).toHaveValue('Kitchen work');
    const areaEl = within(table).getByText('Ground Floor');
    expect(areaEl.className).toContain(styles.usageMetaText);
    expect(areaEl.tagName).toBe('DIV');
    // ...and it lives in the same cell as the usage field (inline, not a separate column).
    expect(usageInput.closest('td')).toContainElement(areaEl);
  });

  it('renders areaText as a .usageMetaText <span> in the mobile card usage row', () => {
    const rows = [
      makeRow({ invoiceId: 'inv-1', usageText: 'Kitchen work', areaText: 'Ground Floor' }),
    ];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    const card = within(getMobileList(container));
    const areaEl = card.getByText('Ground Floor');
    expect(areaEl.className).toContain(styles.usageMetaText);
    expect(areaEl.tagName).toBe('SPAN');
  });

  it.each([
    ['desktop table', getDesktopTable],
    ['mobile card', getMobileList],
  ])(
    '#1959: joins areaText and attachmentsNote with " · " into ONE meta element, area first (%s)',
    (_label, getTree) => {
      const rows = [
        makeRow({
          invoiceId: 'inv-1',
          usageText: 'Kitchen work',
          areaText: 'Ground Floor',
          attachmentsNote: '1 attachment: Invoice',
        }),
      ];
      const { container } = renderEditor({ content: makeContent({ rows }) });
      const tree = getTree(container);
      // Exact single-node text match pins the join order AND the separator: two sibling elements,
      // a different separator, or a swapped order would all fail this.
      const metaEl = within(tree).getByText('Ground Floor · 1 attachment: Invoice');
      expect(metaEl.className).toContain(styles.usageMetaText);
      expect(tree.querySelectorAll(`.${styles.usageMetaText}`)).toHaveLength(1);
    },
  );

  it('renders areaText alone with no dangling separator when attachmentsNote is null', () => {
    const rows = [
      makeRow({
        invoiceId: 'inv-1',
        usageText: 'Kitchen work',
        areaText: 'Ground Floor',
        attachmentsNote: null,
      }),
    ];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    const metaEls = container.querySelectorAll(`.${styles.usageMetaText}`);
    expect(metaEls).toHaveLength(2); // one desktop <div>, one mobile <span>
    for (const el of metaEls) {
      expect(el.textContent).toBe('Ground Floor');
    }
  });

  it('renders no meta element (desktop or mobile) when areaText and attachmentsNote are both null', () => {
    // Control: prove the selector matches when meta IS present, so the 0-length assertion below
    // cannot pass on a stale/renamed class name.
    const { container: populated } = renderEditor({
      content: makeContent({ rows: [makeRow({ areaText: 'Ground Floor' })] }),
    });
    expect(populated.querySelectorAll(`.${styles.usageMetaText}`).length).toBeGreaterThan(0);

    const rows = [makeRow({ invoiceId: 'inv-1', areaText: null, attachmentsNote: null })];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    expect(container.querySelectorAll(`.${styles.usageMetaText}`)).toHaveLength(0);
  });
});

describe(
  'ReportContentEditor — mobile card list (CSS-only responsive, ' +
    'always rendered alongside the desktop table — see header comment)',
  () => {
    it('renders one .mobileCard per content.rows entry, read-only fields as .mobileCardCaption spans labeled from content.labels.*', () => {
      const rows = [
        makeRow({
          invoiceId: 'inv-1',
          vendor: 'ACME',
          invoiceNumber: 'A-1',
          dateText: '01/10/2026',
          invoiceAmountText: '€777.00',
          allocatedAmountValueText: '€555.00',
          usageText: 'Kitchen work',
        }),
      ];
      const { container } = renderEditor({ content: makeContent({ rows }) });
      const mobileList = getMobileList(container);
      expect(mobileList).not.toBeNull();
      expect(mobileList.querySelectorAll(`.${styles.mobileCard}`)).toHaveLength(1);

      const card = within(mobileList);
      // Read-only fields: caption spans, labeled from content.labels.* (never a chrome t() echo).
      expect(card.getByText(LABELS.vendor)).toBeInTheDocument();
      expect(card.getByText(LABELS.vendor).tagName).toBe('SPAN');
      expect(card.getByText(LABELS.vendor).className).toContain(styles.mobileCardCaption);
      expect(card.getByText('ACME')).toBeInTheDocument();
      expect(card.getByText(LABELS.invoiceNumber)).toBeInTheDocument();
      expect(card.getByText('A-1')).toBeInTheDocument();
      expect(card.getByText(LABELS.date)).toBeInTheDocument();
      expect(card.getByText('01/10/2026')).toBeInTheDocument();
      expect(card.getByText(LABELS.invoiceAmount)).toBeInTheDocument();
      expect(card.getByText('€777.00')).toBeInTheDocument();
      expect(card.getByText(LABELS.allocatedAmount)).toBeInTheDocument();
      expect(card.getByText('€555.00')).toBeInTheDocument();

      // Editable field (Usage): no separate caption span — resolves via getByLabelText, a real
      // <label htmlFor> association (EditableField's labelled mode). Its visible label text comes
      // from content.labels.usage (report language), matching the read-only captions above — the
      // chrome t() echo must never leak in as the visible label (see header comment).
      const usageField = card.getByLabelText(LABELS.usage);
      expect(usageField).toHaveValue('Kitchen work');
      expect(usageField.tagName).toBe('INPUT');
      expect(card.queryByText('sourceReports.table.usage')).not.toBeInTheDocument();
    });

    it('renders the mobile card Status label (from content.labels.status) and Badge (labeled from row.statusText), and #1959 renders attachmentsNote as read-only inline meta text with no labeled field of its own', () => {
      const rows = [
        makeRow({
          invoiceId: 'inv-1',
          status: 'paid',
          statusText: 'REPORT_PAID_TEXT',
          attachmentsNote: '1 attachment: Invoice',
        }),
      ];
      const { container } = renderEditor({ content: makeContent({ isOverview: true, rows }) });
      const card = within(getMobileList(container));
      expect(card.getByText(LABELS.status)).toBeInTheDocument();
      expect(card.getByText('REPORT_PAID_TEXT')).toBeInTheDocument();

      // Positive: the note text renders inline, as grey meta text.
      const noteEl = card.getByText('1 attachment: Invoice');
      expect(noteEl.className).toContain(styles.usageMetaText);
      expect(noteEl.tagName).toBe('SPAN');
      // Negative: no <label>-associated form control and no caption for it any more.
      expect(card.queryByLabelText(LABELS.attachmentsNote)).not.toBeInTheDocument();
      expect(card.queryByText(LABELS.attachmentsNote)).not.toBeInTheDocument();
      // The old standalone chrome-t label (removed from production code) must never reappear.
      expect(
        card.queryByText('sourceReports.editable.attachmentsNoteLabel'),
      ).not.toBeInTheDocument();
    });

    it('omits the mobile card Status row when isOverview is false, mirroring the desktop table', () => {
      const rows = [makeRow({ invoiceId: 'inv-1', status: null, statusText: null })];
      const { container } = renderEditor({ content: makeContent({ isOverview: false, rows }) });
      const card = within(getMobileList(container));
      expect(card.queryByText(LABELS.status)).not.toBeInTheDocument();
    });

    it('#1959: renders no inline meta text in the mobile card when the row has no note (and the usage field is still there)', () => {
      const rows = [makeRow({ invoiceId: 'inv-1', attachmentsNote: null, areaText: null })];
      const { container } = renderEditor({ content: makeContent({ rows }) });
      const mobileList = getMobileList(container);
      const card = within(mobileList);
      // Positive anchor: the card rendered its usage field, so the absences below are meaningful.
      expect(card.getByLabelText(LABELS.usage)).toHaveValue('Baseline usage');
      expect(mobileList.querySelectorAll(`.${styles.usageMetaText}`)).toHaveLength(0);
      expect(card.queryByText(LABELS.attachmentsNote)).not.toBeInTheDocument();
      expect(card.queryByLabelText(LABELS.attachmentsNote)).not.toBeInTheDocument();
    });

    it('composes the mobile card allocated amount as valueText + refund note when isRefund, matching the desktop cell', () => {
      const rows = [
        makeRow({
          allocatedAmountValueText: '€-200.00',
          isRefund: true,
          refundNoteText: '(refund)',
        }),
      ];
      const { container } = renderEditor({ content: makeContent({ rows }) });
      const card = within(getMobileList(container));
      expect(card.getByText('€-200.00 (refund)')).toBeInTheDocument();
    });

    it('wires the mobile card usage EditableField to the same onFieldChange key as the desktop table, and #1959 exposes no attachmentsNote control to wire', () => {
      const rows = [
        makeRow({
          invoiceId: 'inv-7',
          usageText: 'Baseline usage',
          attachmentsNote: 'Baseline note',
        }),
      ];
      const { onFieldChange, container } = renderEditor({ content: makeContent({ rows }) });
      const card = within(getMobileList(container));

      const usageInput = card.getByDisplayValue('Baseline usage');
      fireEvent.change(usageInput, { target: { value: 'Changed usage' } });
      expect(onFieldChange).toHaveBeenCalledWith('row.inv-7.usageText', 'Changed usage');

      // Positive: the note text is rendered in this card (read-only)...
      expect(card.getByText('Baseline note')).toBeInTheDocument();
      // ...but usage is the card's ONLY editable control, so nothing can emit an attachmentsNote key.
      expect(card.getAllByRole('textbox')).toEqual([usageInput]);
      expect(onFieldChange).not.toHaveBeenCalledWith(
        'row.inv-7.attachmentsNote',
        expect.anything(),
      );
    });

    it('wires the mobile card usage reset button to the same onFieldReset key as the desktop table', () => {
      const rows = [makeRow({ invoiceId: 'inv-7', usageText: 'Baseline usage' })];
      const { onFieldReset, container } = renderEditor({
        content: makeContent({ rows }),
        overrides: { 'row.inv-7.usageText': 'Baseline usage' },
      });
      const card = within(getMobileList(container));
      const usageInput = card.getByDisplayValue('Baseline usage');
      const resetBtn = usageInput.parentElement!.parentElement!.querySelector(
        'button',
      ) as HTMLElement;
      fireEvent.click(resetBtn);
      expect(onFieldReset).toHaveBeenCalledWith('row.inv-7.usageText');
    });
  },
);

// ─── Story #1910: lang HTML attribute prop (Option A: surgical section tagging) ──────────────────

describe('ReportContentEditor — lang prop (Story #1910, Option A: surgical section tagging)', () => {
  it('container has NO lang attribute even when the lang prop is passed', () => {
    // Option A: lang is applied surgically to report-language sections (.tableWrapper, mobile
    // cards), NOT to the outer container — the container hosts both UI-chrome and report content
    // and must not receive a blanket language tag.
    const { container } = renderEditor({ lang: 'de' });
    const outerContainer = container.querySelector('[class*="container"]');
    expect(outerContainer).not.toBeNull();
    expect(outerContainer!.getAttribute('lang')).toBeNull();
  });

  it('h3 headings are NOT tagged with lang (they are UI chrome, not report content)', () => {
    // fullContent() includes a coverLetter, so both the cover-letter <h3> and the table <h3>
    // render. Neither carries lang — they are chrome headings, not report-language content.
    const { container } = renderEditor({ content: fullContent(), lang: 'de' });
    const headings = Array.from(container.querySelectorAll('h3'));
    // Positive anchor: at least 2 headings render, so the loop is not vacuous.
    expect(headings.length).toBeGreaterThanOrEqual(2);
    for (const h3 of headings) {
      expect(h3.getAttribute('lang')).toBeNull();
    }
  });

  it('applies lang="de" to the report table <thead> and .tableWrapper (report-language content sections) when lang="de" is passed', () => {
    const { container } = renderEditor({ lang: 'de' });
    const thead = container.querySelector('thead');
    expect(thead).not.toBeNull();
    expect(thead!.getAttribute('lang')).toBe('de');
    // tableWrapper restored to carry lang={lang} for mobile coverage
    const tableWrapper = container.querySelector('[class*="tableWrapper"]');
    expect(tableWrapper).not.toBeNull();
    expect(tableWrapper!.getAttribute('lang')).toBe('de');
  });

  it('EditableField <label> elements inside the cover-letter card have NO lang attribute (UI chrome labels are untagged)', () => {
    // Labels like "Sender", "Subject", "Body" are UI chrome — they must not be tagged with the
    // report language. Only the editable field VALUE sections carry the lang attribute.
    const { container } = renderEditor({ content: fullContent(), lang: 'de' });
    const coverLetterCard = container.querySelector('[class*="coverLetterCard"]');
    expect(coverLetterCard).not.toBeNull();
    const labels = Array.from(coverLetterCard!.querySelectorAll('label'));
    // Positive anchor: fullContent() includes a coverLetter with multiple editable fields.
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label.getAttribute('lang')).toBeNull();
    }
  });

  it('the <thead> has no lang attribute when the lang prop is omitted', () => {
    const { container } = renderEditor();
    const thead = container.querySelector('thead');
    expect(thead).not.toBeNull();
    expect(thead!.getAttribute('lang')).toBeNull();
  });

  it('[integration] a usage EditableField <input> carries lang="de" when lang="de" is passed — wires the EditableField.lang prop', () => {
    const { container } = renderEditor({ lang: 'de' });
    // Scope to the desktop table body to avoid picking up column-toggle checkboxes, which appear
    // before the usage inputs in DOM order and carry no lang attribute.
    // The default fixture (makeContent → makeRow) has usageText: 'Baseline usage'.
    const table = getDesktopTable(container);
    const input = within(table).getByDisplayValue('Baseline usage');
    expect(input.tagName).toBe('INPUT');
    expect(input.getAttribute('lang')).toBe('de');
  });

  it('applies lang="de" to .mobileCardList (the mobile viewport table mirror)', () => {
    // .mobileCardList is the CSS-only responsive counterpart of .tableWrapper: always present in
    // the DOM, hidden by @media on desktop. It must carry lang={lang} so mobile screen readers
    // get the correct report-language pronunciation hint, matching the desktop tableWrapper tag.
    const { container } = renderEditor({ lang: 'de' });
    const mobileList = container.querySelector('[class*="mobileCardList"]');
    expect(mobileList).not.toBeNull();
    expect(mobileList!.getAttribute('lang')).toBe('de');
  });

  it('tableWrapper has no lang attribute when the lang prop is omitted', () => {
    // Counterpart to the thead-no-lang test above: when no lang is passed, neither the thead
    // nor the tableWrapper wrapper carries a lang attribute.
    const { container } = renderEditor();
    const tableWrapper = container.querySelector('[class*="tableWrapper"]');
    expect(tableWrapper).not.toBeNull();
    expect(tableWrapper!.getAttribute('lang')).toBeNull();
  });

  it('column-toggle <label> elements carry lang="de" (report-language content, not UI chrome)', () => {
    // The column-toggle labels render content.labels.* (report language): vendor, invoiceNumber,
    // date, invoiceAmount, allocatedAmount, usage. After the round-3 fix, each <label> receives
    // lang={lang}. The parent .columnToggles div cannot carry it (its aria-label is UI chrome).
    const { container } = renderEditor({ lang: 'de' });
    const toggleLabels = Array.from(
      container.querySelectorAll('[class*="columnToggles"] [class*="columnToggle"]'),
    ) as HTMLElement[];
    // Positive anchor: at least 5 toggle labels always render (vendor, invoiceNumber, date,
    // invoiceAmount, allocatedAmount, usage — 6 when not isOverview, 7 when isOverview).
    expect(toggleLabels.length).toBeGreaterThanOrEqual(5);
    for (const label of toggleLabels) {
      expect(label.getAttribute('lang')).toBe('de');
    }
  });

  it('[integration] the reset button on an edited field carries uiLang="en" — wires the EditableField.uiLang prop', () => {
    // When lang !== uiLang, uiLang must flow from ReportContentEditor through to EditableField's
    // reset button and sr-only edited hint. Deleting all uiLang={uiLang} call-site props from
    // ReportContentEditor.tsx would be type-legal (optional prop) and leave existing suites green.
    // This test closes that coverage gap: render with an edited cover-letter sender field and assert
    // the reset button (which only renders when isEdited=true) carries lang="en" (the uiLang).
    const { container } = renderEditor({
      content: fullContent(),
      lang: 'de',
      uiLang: 'en',
      overrides: { 'coverLetter.sender': 'Edited sender value' },
    });
    // The sender field is edited (key in overrides), so its reset button renders.
    // The button carries lang={uiLang} per EditableField.tsx — it is always UI chrome.
    const resetButtons = Array.from(
      container.querySelectorAll('button[lang="en"]'),
    ) as HTMLElement[];
    // Positive anchor: at least one reset button renders (the sender field is edited).
    expect(resetButtons.length).toBeGreaterThanOrEqual(1);
    for (const btn of resetButtons) {
      expect(btn.getAttribute('lang')).toBe('en');
    }
    // Negative: no button should carry the report language (buttons are always UI chrome).
    const reportLangButtons = container.querySelectorAll('button[lang="de"]');
    expect(reportLangButtons.length).toBe(0);
  });
});

// ─── Issue #1941: per-field maxLength wiring ─────────────────────────────────────────────────────

describe('ReportContentEditor — #1941 per-field maxLength wiring (cover-letter fields)', () => {
  it.each([
    ['sourceReports.editable.senderLabel', '300'],
    ['sourceReports.editable.recipientLabel', '300'],
    ['sourceReports.editable.referenceLabel', '100'],
    ['sourceReports.editable.subjectLabel', '200'],
    ['sourceReports.editable.bodyLabel', '4000'],
    ['sourceReports.editable.signatureLabel', '200'],
  ])(
    'sets the native maxLength attribute to %s on the field labeled "%s"',
    (labelKey, expectedMax) => {
      renderEditor({ content: fullContent() });
      const field = screen.getByLabelText(labelKey);
      expect(field).toHaveAttribute('maxlength', expectedMax);
    },
  );
});

describe('ReportContentEditor — #1941 per-field maxLength wiring (usage field, both responsive render sites)', () => {
  it.each([
    ['desktop table', getDesktopTable],
    ['mobile card', getMobileList],
  ] as const)(
    'sets the native maxLength attribute to 500 on the usage EditableField (%s)',
    (_label, getTree) => {
      const { container } = renderEditor({ content: fullContent() });
      const tree = getTree(container);
      // fullContent()'s single row uses makeRow()'s default usageText, 'Baseline usage'.
      const usageField = within(tree).getByDisplayValue('Baseline usage');
      expect(usageField).toHaveAttribute('maxlength', '500');
    },
  );
});

describe('ReportContentEditor — #1941 conditional cover-letter fields render nothing (not a disabled/empty field) when their content is null', () => {
  it('renders no recipient field at all when content.coverLetter.recipient is null (control: with recipient present, the same query finds an ENABLED field)', () => {
    const content = makeContent({
      coverLetter: {
        sender: 'S',
        recipient: null,
        dateLine: '01/15/2026',
        reference: 'R',
        subject: 'Subj',
        body: 'B',
        signature: 'Sig',
        closing: 'Sincerely,',
      },
    });
    renderEditor({ content });
    expect(
      screen.queryByLabelText('sourceReports.editable.recipientLabel'),
    ).not.toBeInTheDocument();

    const withRecipient = makeContent({
      coverLetter: { ...content.coverLetter!, recipient: 'Recipient text' },
    });
    const { unmount } = renderEditor({ content: withRecipient });
    const recipientField = screen.getByLabelText('sourceReports.editable.recipientLabel');
    expect(recipientField).toBeInTheDocument();
    expect(recipientField).not.toBeDisabled();
    unmount();
  });

  it('renders no reference field at all when content.coverLetter.reference is null (control: with reference present, the same query finds an ENABLED field)', () => {
    const content = makeContent({
      coverLetter: {
        sender: 'S',
        recipient: 'R',
        dateLine: '01/15/2026',
        reference: null,
        subject: 'Subj',
        body: 'B',
        signature: 'Sig',
        closing: 'Sincerely,',
      },
    });
    renderEditor({ content });
    expect(
      screen.queryByLabelText('sourceReports.editable.referenceLabel'),
    ).not.toBeInTheDocument();

    const withReference = makeContent({
      coverLetter: { ...content.coverLetter!, reference: 'Reference text' },
    });
    const { unmount } = renderEditor({ content: withReference });
    const referenceField = screen.getByLabelText('sourceReports.editable.referenceLabel');
    expect(referenceField).toBeInTheDocument();
    expect(referenceField).not.toBeDisabled();
    unmount();
  });
});
