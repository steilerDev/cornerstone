/**
 * #2020 / #2021 — allocated-amount annotation parity between the PDF and the editable preview.
 *
 * The 2x2 matrix {PDF, preview (desktop table + mobile card)} x {en, de} is covered in full, "no
 * cell omitted": for each locale the same maximal four-flag row (deposit + partial + less-deposit +
 * refund) is built with the REAL i18next bundles (no key-echoing t) and rendered through the PDF
 * pipeline (real pdfmake, read back from post-render state) and through ReportContentEditor
 * (desktop <td> and mobile .mobileCardAllocated). All three surfaces must show the value first and
 * then the annotations in the SAME order, with the expected literals HARDCODED per locale (never
 * derived from the bundle, so a bundle edit is a visible test failure). The two legend footnotes
 * are asserted on both surfaces as well.
 *
 * The PDF cells are also covered by realRender.test.ts (#1959, #1911 AC5.3); this file adds the
 * cross-surface comparison and the preview cells that file cannot reach.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, jest, beforeAll } from '@jest/globals';
import i18next from 'i18next';
import type { TFunction } from 'i18next';
import type { Content } from 'pdfmake/build/pdfmake';
import type { SourceReportResponse, SourceReportInvoice } from '@cornerstone/shared';
import type { Formatters } from '../../lib/formatters.js';
import { formatCurrency, formatDate } from '../../lib/formatters.js';
import { buildReportContent, visibleReportColumns } from '../../lib/reportContent/index.js';
import type { ReportContent } from '../../lib/reportContent/index.js';
import { loadPdfLibs } from '../../lib/reportPdf/loader.js';
import { PDF_STYLES, PDF_DEFAULT_STYLE } from '../../lib/reportPdf/merge.js';
import { buildOverviewContent } from '../../lib/reportPdf/overviewPdf.js';
import { buildCoverLetterContent } from '../../lib/reportPdf/coverLetterPdf.js';
import {
  PAGE_MARGIN_X,
  PAGE_TOP_MARGIN,
  PAGE_MARGIN_BOTTOM,
} from '../../lib/reportPdf/pageGeometry.js';
import enBudget from '../../i18n/en/budget.json';
import deBudget from '../../i18n/de/budget.json';
import { ReportContentEditor } from './ReportContentEditor.js';
import styles from './ReportContentEditor.module.css';

let tEn: TFunction;
let tDe: TFunction;

// jsdom's Blob lacks arrayBuffer(); merge/pdfmake paths need it (same polyfill as realRender.test.ts).
beforeAll(() => {
  if (typeof Blob.prototype.arrayBuffer !== 'function') {
    Blob.prototype.arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }
});

// Real i18next instance loaded with the ACTUAL en/de `budget` bundles.
beforeAll(async () => {
  const instance = i18next.createInstance();
  await instance.init({
    resources: { en: { budget: enBudget }, de: { budget: deBudget } },
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'budget',
    ns: ['budget'],
    interpolation: { escapeValue: false },
  });
  tEn = instance.getFixedT('en', 'budget');
  tDe = instance.getFixedT('de', 'budget');
});

function formattersFor(locale: 'en-US' | 'de-DE'): Formatters {
  return {
    formatCurrency: (n: number) => formatCurrency(n, locale, 'EUR'),
    formatDate: (d, fallback, monthStyle) => formatDate(d, locale, fallback, monthStyle),
  };
}

function makeInvoice(overrides: Partial<SourceReportInvoice> = {}): SourceReportInvoice {
  return {
    invoiceId: 'inv-x',
    vendorId: 'vend-x',
    vendorName: 'Vendor',
    invoiceNumber: 'INV-X',
    date: '2026-02-10',
    status: 'pending',
    invoiceAmount: 100,
    allocatedAmount: 100,
    lineKind: 'invoice',
    isSplit: false,
    splitKind: null,
    documents: [],
    budgetLinesForSource: [],
    depositsVisibleToSource: [],
    ...overrides,
  };
}

// Maximal four-flag fixture: splitKind 'both' + own-tagged deposit + refund-adjustment line.
function makeMaximalReport(): SourceReportResponse {
  const inv = makeInvoice({
    invoiceId: 'inv-2020-maximal',
    vendorName: 'Maximal Vendor',
    invoiceNumber: 'MAX-0001',
    isSplit: true,
    splitKind: 'both',
    lineKind: 'refund-adjustment',
    invoiceAmount: 500,
    allocatedAmount: -150,
    budgetLinesForSource: [
      { id: 'bl-maximal', description: 'Materials', allocatedPortion: -150, linkedItem: null },
    ],
    depositsVisibleToSource: [
      {
        id: 'dep-maximal',
        amount: 100,
        status: 'paid',
        entryType: 'deposit',
        dueDate: '2026-01-01',
        paidDate: null,
        claimedDate: null,
        budgetSourceId: 'src-maximal',
      },
    ],
  });
  return {
    type: 'claim',
    source: {
      id: 'src-maximal',
      name: 'Maximal Source',
      sourceType: 'bank_loan',
      reference: null,
      contactAddress: null,
    },
    invoices: [inv],
    totalAmount: -150,
    unallocatedInvoices: [],
    generatedAt: '2026-03-01T00:00:00.000Z',
  };
}

function buildContent(t: TFunction, locale: 'en-US' | 'de-DE'): ReportContent {
  return buildReportContent(
    makeMaximalReport(),
    new Set(['inv-2020-maximal']),
    'claim',
    t,
    formattersFor(locale),
    { includeCoverLetter: false, household: null },
  );
}

// Trimmed real render: the tree is passed BY REFERENCE, pdfmake annotates it in place.
async function renderPdfContent(pdfContent: Content[]): Promise<void> {
  const { pdfMake } = await loadPdfLibs();
  const pdfDoc = pdfMake.createPdf({
    content: pdfContent,
    pageSize: 'A4',
    pageMargins: [PAGE_MARGIN_X, PAGE_TOP_MARGIN, PAGE_MARGIN_X, PAGE_MARGIN_BOTTOM],
    defaultStyle: PDF_DEFAULT_STYLE,
    styles: PDF_STYLES,
  });
  await pdfDoc.getBlob();
}

function collectAllStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    out.push(node);
  } else if (Array.isArray(node)) {
    for (const item of node) collectAllStrings(item, out);
  } else if (node !== null && typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) {
      collectAllStrings(value, out);
    }
  }
  return out;
}

// Renders the PDF and returns the allocated cell's trimmed, non-empty text runs: [value, ...annotations].
async function pdfAllocatedSequence(content: ReportContent): Promise<{
  sequence: string[];
  allStrings: string[];
}> {
  const pdfContent = buildOverviewContent(content, new Map());
  await renderPdfContent(pdfContent);
  const tableItem = pdfContent.find((c) => typeof c === 'object' && c !== null && 'table' in c) as
    { table: { body: unknown[][] } } | undefined;
  if (!tableItem) throw new Error('No table item in rendered pdfContent');
  const idx = visibleReportColumns(false, new Set()).indexOf('allocatedAmount');
  const dataRow = tableItem.table.body[1];
  if (!dataRow) throw new Error('No data row in table body');
  const cell = dataRow[idx] as { text?: unknown; positions?: unknown } | undefined;
  if (!cell) throw new Error('No allocated cell');
  if (!Array.isArray(cell.positions)) {
    throw new Error('allocatedCell.positions is not an array — was the tree rendered first?');
  }
  if (!Array.isArray(cell.text)) throw new Error('allocated cell text is not a run array');
  const sequence = (cell.text as { text: string }[])
    .map((r) => r.text.trim())
    .filter((s) => s.length > 0);
  return { sequence, allStrings: collectAllStrings(pdfContent) };
}

function renderPreview(content: ReportContent, t: TFunction) {
  return render(
    <ReportContentEditor
      content={content}
      overrides={{}}
      hiddenColumns={new Set()}
      onToggleColumn={jest.fn()}
      onFieldChange={jest.fn()}
      onFieldReset={jest.fn()}
      attachDocuments={false}
      t={t}
    />,
  );
}

function childTexts(el: Element): string[] {
  return Array.from(el.childNodes)
    .map((n) => n.textContent?.trim() ?? '')
    .filter(Boolean);
}

function desktopAllocatedSequence(container: HTMLElement): string[] {
  const table = container.querySelector('table.table');
  if (!table) throw new Error('No desktop table');
  const rows = table.querySelectorAll('tbody tr');
  if (rows.length !== 1) throw new Error(`Expected a single tbody row, got ${rows.length}`);
  const idx = visibleReportColumns(false, new Set()).indexOf('allocatedAmount');
  const td = rows[0]!.querySelectorAll('td')[idx];
  if (!td) throw new Error('No allocated td');
  return childTexts(td);
}

function mobileAllocatedSequence(container: HTMLElement): string[] {
  const el = container.querySelector(`.${styles.mobileCardAllocated}`);
  if (!el) throw new Error('No mobile allocated element');
  return childTexts(el);
}

interface Expected {
  depositPdf: string;
  depositBadge: string;
  partial: string;
  lessDeposit: string;
  refund: string;
  splitLegend: string;
  lessDepositLegend: string;
}

const EXPECTED_EN: Expected = {
  depositPdf: '(Deposit)',
  depositBadge: 'Deposit',
  partial: '(partial)',
  lessDeposit: '(less\u00A0deposit)',
  refund: '(refund)',
  splitLegend: 'partial: Amount shown reflects only the portion allocated to this source.',
  lessDepositLegend: 'less\u00A0deposit: This position reflects deposits claimed separately.',
};

const EXPECTED_DE: Expected = {
  depositPdf: '(Abschlagszahlung)',
  depositBadge: 'Abschlagszahlung',
  partial: '(Teilbetrag)',
  lessDeposit: '(abzgl.\u00A0Abschlag)',
  refund: '(Rückerstattung)',
  splitLegend:
    'Teilbetrag: Der angezeigte Betrag umfasst nur den dieser Quelle zugeordneten Anteil.',
  lessDepositLegend:
    'abzgl.\u00A0Abschlag: Diese Position berücksichtigt separat eingereichte Abschlagszahlungen.',
};

type Kind = 'deposit' | 'partial' | 'lessDeposit' | 'refund';

function kindsOf(annotations: string[], e: Expected): Kind[] {
  const lookup: Record<string, Kind> = {
    [e.depositPdf]: 'deposit',
    [e.depositBadge]: 'deposit',
    [e.partial]: 'partial',
    [e.lessDeposit]: 'lessDeposit',
    [e.refund]: 'refund',
  };
  return annotations.map((a) => {
    const kind = lookup[a];
    if (!kind) throw new Error(`Unmapped annotation literal: ${JSON.stringify(a)}`);
    return kind;
  });
}

describe.each([
  ['en', 'en-US' as const, () => tEn, EXPECTED_EN] as const,
  ['de', 'de-DE' as const, () => tDe, EXPECTED_DE] as const,
])('#2020/#2021 allocated-amount parity — %s', (_label, localeStr, getT, e) => {
  it('1: the fixture yields a maximal four-flag row with both legend footnotes', () => {
    const content = buildContent(getT(), localeStr);
    const row = content.rows[0]!;
    expect(row.isDeposit).toBe(true);
    expect(row.isPartial).toBe(true);
    expect(row.isDepositReduced).toBe(true);
    expect(row.isRefund).toBe(true);
    expect(content.footnotes.map((f) => f.id)).toEqual(['split', 'depositReduced']);
  });

  it('2: PDF allocated cell shows value, then (Deposit), partial, less deposit, refund', async () => {
    const content = buildContent(getT(), localeStr);
    const { sequence } = await pdfAllocatedSequence(content);
    expect(sequence[0]).toBe(content.rows[0]!.allocatedAmountValueText);
    expect(sequence.slice(1)).toEqual([e.depositPdf, e.partial, e.lessDeposit, e.refund]);
  });

  it('3: preview desktop cell shows value, then deposit badge, partial, less deposit, refund', () => {
    const content = buildContent(getT(), localeStr);
    const { container } = renderPreview(content, getT());
    const seq = desktopAllocatedSequence(container);
    expect(seq[0]).toBe(content.rows[0]!.allocatedAmountValueText);
    expect(seq.slice(1)).toEqual([e.depositBadge, e.partial, e.lessDeposit, e.refund]);
  });

  it('4: preview mobile card shows value, then deposit badge, partial, less deposit, refund', () => {
    const content = buildContent(getT(), localeStr);
    const { container } = renderPreview(content, getT());
    const seq = mobileAllocatedSequence(container);
    expect(seq[0]).toBe(content.rows[0]!.allocatedAmountValueText);
    expect(seq.slice(1)).toEqual([e.depositBadge, e.partial, e.lessDeposit, e.refund]);
  });

  it('5: PDF, desktop and mobile show the same annotation kinds in the same order', async () => {
    const content = buildContent(getT(), localeStr);
    const { sequence: pdf } = await pdfAllocatedSequence(content);
    const { container } = renderPreview(content, getT());
    const pdfKinds = kindsOf(pdf.slice(1), e);
    const desktopKinds = kindsOf(desktopAllocatedSequence(container).slice(1), e);
    const mobileKinds = kindsOf(mobileAllocatedSequence(container).slice(1), e);
    const expected: Kind[] = ['deposit', 'partial', 'lessDeposit', 'refund'];
    expect(pdfKinds).toEqual(expected);
    expect(desktopKinds).toEqual(expected);
    expect(mobileKinds).toEqual(expected);
    expect(desktopKinds).toEqual(pdfKinds);
    expect(mobileKinds).toEqual(pdfKinds);
  });

  it('6: the rendered PDF carries each legend sentence exactly once', async () => {
    const content = buildContent(getT(), localeStr);
    const { allStrings } = await pdfAllocatedSequence(content);
    expect(allStrings.filter((s) => s.includes(e.splitLegend))).toHaveLength(1);
    expect(allStrings.filter((s) => s.includes(e.lessDepositLegend))).toHaveLength(1);
  });

  it('7: the preview footnotes list the split and less-deposit legends in order', () => {
    const content = buildContent(getT(), localeStr);
    const { container } = renderPreview(content, getT());
    const lis = Array.from(container.querySelectorAll(`.${styles.footnotes} li`)).map(
      (li) => li.textContent,
    );
    expect(lis).toEqual([e.splitLegend, e.lessDepositLegend]);
  });
});

// ─── #2159: cover-letter opening — editor preview and PDF show the same real-bundle strings ────
describe.each([
  [
    'de',
    'de-DE' as const,
    () => tDe,
    {
      label: 'Anrede',
      opening: 'Sehr geehrte Damen und Herren,',
      subjectLabel: 'Betreff',
      subject: 'Abruf Kreditmittel',
    },
  ] as const,
  [
    'en',
    'en-US' as const,
    () => tEn,
    {
      label: 'Opening',
      opening: 'Dear Sir or Madam,',
      subjectLabel: 'Subject',
      subject: 'Claim Documentation',
    },
  ] as const,
])('#2159 cover-letter opening parity — %s', (lang, localeStr, getT, e) => {
  function coverLetterContent(): ReportContent {
    return buildReportContent(
      makeMaximalReport(),
      new Set(['inv-2020-maximal']),
      'claim',
      getT(),
      formattersFor(localeStr),
      {
        includeCoverLetter: true,
        household: { householdName: 'The Smiths', householdAddress: '1 Main St' },
      },
    );
  }

  it('editor shows the localized Opening label and value (lang-tagged) and the real subject; the PDF carries the same opening and subject', () => {
    const content = coverLetterContent();
    render(
      <ReportContentEditor
        content={content}
        overrides={{}}
        hiddenColumns={new Set()}
        onToggleColumn={jest.fn()}
        onFieldChange={jest.fn()}
        onFieldReset={jest.fn()}
        attachDocuments={false}
        t={getT()}
        lang={lang}
      />,
    );

    expect(screen.getByText(e.label)).toBeInTheDocument();
    const value = screen.getByText(e.opening);
    expect(value.getAttribute('lang')).toBe(lang);
    expect((screen.getByLabelText(e.subjectLabel) as HTMLInputElement).value).toBe(e.subject);

    const strings = collectAllStrings(buildCoverLetterContent(content));
    expect(strings).toContain(e.opening);
    expect(strings).toContain(`${e.subjectLabel}: ${e.subject}`);
  });
});
