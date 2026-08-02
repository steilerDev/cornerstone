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
} from '../../lib/reportContent/index.js';
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
  source: 'REPORT_SOURCE_LABEL',
  sourceType: 'REPORT_SOURCE_TYPE_LABEL',
  reference: 'REPORT_REFERENCE_LABEL',
  generatedAt: 'REPORT_GENERATED_AT_LABEL',
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
    allocatedMarkers: '',
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
  const utils = render(
    <ReportContentEditor
      content={makeContent()}
      overrides={{}}
      onFieldChange={onFieldChange}
      onFieldReset={onFieldReset}
      t={t}
      {...overridesProp}
    />,
  );
  return { ...utils, onFieldChange, onFieldReset };
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

  it('calls onFieldChange for the row-level attachmentsNote field', () => {
    const { onFieldChange, container } = renderEditor({ content: fullContent() });
    const table = getDesktopTable(container);
    const field = within(table).getByDisplayValue('Note baseline');
    fireEvent.change(field, { target: { value: 'edited note' } });
    expect(onFieldChange).toHaveBeenCalledWith('row.inv-1.attachmentsNote', 'edited note');
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
  it('composes the row-level usage/attachmentsNote reset button names from a translated field name, never the raw "usage"/"attachmentsNote" identifier', () => {
    const content = fullContent();
    const { container } = renderEditor({
      content,
      overrides: {
        'row.inv-1.usageText': content.rows[0]!.usageText,
        'row.inv-1.attachmentsNote': content.rows[0]!.attachmentsNote as string,
      },
    });
    const table = getDesktopTable(container);

    expect(
      within(table).getByRole('button', {
        name: 'sourceReports.editable.resetFieldAriaLabel::{"field":"sourceReports.table.usage"}',
      }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('button', {
        name: 'sourceReports.editable.resetFieldAriaLabel::{"field":"sourceReports.editable.attachmentsNoteLabel"}',
      }),
    ).toBeInTheDocument();

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

  it('composes the allocated cell as valueText + markers + refund note when isRefund', () => {
    const rows = [
      makeRow({
        allocatedAmountValueText: '€-200.00',
        allocatedMarkers: '†1',
        isRefund: true,
        refundNoteText: '(refund)',
      }),
    ];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    const table = getDesktopTable(container);
    expect(within(table).getByText('€-200.00†1 (refund)')).toBeInTheDocument();
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

  it('renders an Attachments Note column (labeled from content.labels.attachmentsNote) and EditableField only for rows with a non-null note', () => {
    const rows = [
      makeRow({ invoiceId: 'inv-1', attachmentsNote: '1 attachment: Invoice' }),
      makeRow({ invoiceId: 'inv-2', attachmentsNote: null }),
    ];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    const table = getDesktopTable(container);
    expect(within(table).getByText(LABELS.attachmentsNote)).toBeInTheDocument();
    expect(within(table).getByDisplayValue('1 attachment: Invoice')).toBeInTheDocument();
  });

  it('omits the Attachments Note column entirely when no row has a non-null note', () => {
    const rows = [makeRow({ attachmentsNote: null })];
    renderEditor({ content: makeContent({ rows }) });
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

  it('calls onFieldReset with the correct row.<invoiceId>.attachmentsNote key on reset (desktop table)', () => {
    const rows = [makeRow({ invoiceId: 'inv-42', attachmentsNote: 'Edited note' })];
    const { onFieldReset, container } = renderEditor({
      content: makeContent({ rows }),
      overrides: { 'row.inv-42.attachmentsNote': 'Edited note' },
    });
    const table = getDesktopTable(container);
    const resetButtons = within(table).getAllByRole('button', { name: /resetFieldAriaLabel/ });
    fireEvent.click(resetButtons[resetButtons.length - 1]!);
    expect(onFieldReset).toHaveBeenCalledWith('row.inv-42.attachmentsNote');
  });

  it('calls onFieldReset with the correct row.<invoiceId>.attachmentsNote key on reset (mobile card)', () => {
    const rows = [makeRow({ invoiceId: 'inv-42', attachmentsNote: 'Edited note' })];
    const { onFieldReset, container } = renderEditor({
      content: makeContent({ rows }),
      overrides: { 'row.inv-42.attachmentsNote': 'Edited note' },
    });
    const mobileList = getMobileList(container);
    const resetButtons = within(mobileList).getAllByRole('button', {
      name: /resetFieldAriaLabel/,
    });
    fireEvent.click(resetButtons[resetButtons.length - 1]!);
    expect(onFieldReset).toHaveBeenCalledWith('row.inv-42.attachmentsNote');
  });
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
        { id: 'split', marker: '†', text: 'Amount shown reflects only the portion allocated.' },
        {
          id: 'deposit-reduced',
          marker: '‡',
          text: 'This position reflects deposits claimed separately.',
        },
      ],
    });
    renderEditor({ content });
    expect(screen.getByText('†:')).toBeInTheDocument();
    expect(
      screen.getByText(/Amount shown reflects only the portion allocated\./),
    ).toBeInTheDocument();
    expect(screen.getByText('‡:')).toBeInTheDocument();
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
        allocatedMarkers: '',
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

describe('ReportContentEditor — areaText (AC5.2/5.3: distinct element below the usage field)', () => {
  it('renders areaText as a distinct element below the desktop Usage EditableField, not inside its value', () => {
    const rows = [
      makeRow({ invoiceId: 'inv-1', usageText: 'Kitchen work', areaText: 'Ground Floor' }),
    ];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    const table = getDesktopTable(container);
    const usageInput = within(table).getByDisplayValue('Kitchen work');
    // The area text is not baked into the editable input's value.
    expect(usageInput).not.toHaveValue('Kitchen work / Ground Floor');
    const areaEl = within(table).getByText('Ground Floor');
    expect(areaEl.className).toContain(styles.usageAreaText);
    expect(areaEl.tagName).toBe('DIV');
  });

  it('renders areaText as a <span> in the mobile card usage row', () => {
    const rows = [
      makeRow({ invoiceId: 'inv-1', usageText: 'Kitchen work', areaText: 'Ground Floor' }),
    ];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    const card = within(getMobileList(container));
    const areaEl = card.getByText('Ground Floor');
    expect(areaEl.className).toContain(styles.usageAreaText);
    expect(areaEl.tagName).toBe('SPAN');
  });

  it('renders no area element (desktop or mobile) when areaText is null', () => {
    const rows = [makeRow({ invoiceId: 'inv-1', areaText: null })];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    expect(container.querySelectorAll(`.${styles.usageAreaText}`)).toHaveLength(0);
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

    it('renders the mobile card Status label (from content.labels.status) and Badge (labeled from row.statusText) and Attachments Note field (labeled from content.labels.attachmentsNote via a real htmlFor association) consistently with the desktop table', () => {
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
      const noteField = card.getByLabelText(LABELS.attachmentsNote);
      expect(noteField).toHaveValue('1 attachment: Invoice');
      expect(noteField.tagName).toBe('INPUT');
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

    it('omits the mobile card Attachments Note row when the row has no note', () => {
      const rows = [makeRow({ invoiceId: 'inv-1', attachmentsNote: null })];
      const { container } = renderEditor({ content: makeContent({ rows }) });
      const card = within(getMobileList(container));
      expect(card.queryByText(LABELS.attachmentsNote)).not.toBeInTheDocument();
      expect(card.queryByLabelText(LABELS.attachmentsNote)).not.toBeInTheDocument();
    });

    it('composes the mobile card allocated amount as valueText + markers + refund note when isRefund, matching the desktop cell', () => {
      const rows = [
        makeRow({
          allocatedAmountValueText: '€-200.00',
          allocatedMarkers: '†1',
          isRefund: true,
          refundNoteText: '(refund)',
        }),
      ];
      const { container } = renderEditor({ content: makeContent({ rows }) });
      const card = within(getMobileList(container));
      expect(card.getByText('€-200.00†1 (refund)')).toBeInTheDocument();
    });

    it('wires the mobile card usage/attachmentsNote EditableFields to the same onFieldChange keys as the desktop table', () => {
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

      const noteInput = card.getByDisplayValue('Baseline note');
      fireEvent.change(noteInput, { target: { value: 'Changed note' } });
      expect(onFieldChange).toHaveBeenCalledWith('row.inv-7.attachmentsNote', 'Changed note');
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
