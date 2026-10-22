/**
 * The editor's private OverrideField (formerly the shared EditableField, retired in #2233).
 * Every scenario of the deleted EditableField.test.tsx lives here, driven through the editor:
 * edited dot, sr-only edited suffix, reset button name/title/lang, counter at 90 %, over-limit
 * hint, reached announcement, input vs textarea, label vs aria-label modes.
 *
 * The usage text renders twice: a dense desktop table cell (no `label`, aria-label mode) and a
 * mobile card row (visible label mode), so both modes are reachable with one fixture. The cover
 * letter sender is the textarea; the reference is a plain input.
 */
import { render, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, jest } from '@jest/globals';
import type { TFunction } from 'i18next';
import type { ReportContent, ReportContentLabels } from '../../lib/reportContent/index.js';
import { overrideKey } from '../../lib/reportContent/index.js';
import { ReportContentEditor } from './ReportContentEditor.js';
import styles from './ReportContentEditor.module.css';

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}::${JSON.stringify(opts)}` : key) as unknown as TFunction;

const LABELS = {
  vendor: 'V',
  invoiceNumber: 'N',
  date: 'D',
  status: 'S',
  invoiceAmount: 'IA',
  allocatedAmount: 'AA',
  usage: 'USAGE_LABEL',
  attachmentsNote: 'AN',
  deposit: 'DEP',
  splitNote: 'SN',
  depositReducedNote: 'DR',
  source: 'SRC',
  sourceType: 'ST',
  reference: 'REF',
  generatedAt: 'GA',
  pageLabel: 'PL',
  coverLetterReferenceLabel: 'CLR',
  coverLetterSubjectLabel: 'CLS',
  skipReasonLabels: { footnoteFetchFailed: 'a', footnoteInvalidPdf: 'b' },
} as unknown as ReportContentLabels;

function makeContent(usageText: string, sender = 'Sender baseline'): ReportContent {
  return {
    isOverview: false,
    isClaim: false,
    tableTitle: 'Title',
    labels: LABELS,
    sourceInfo: {
      sourceName: 'Fixture source',
      sourceTypeText: 'Loan',
      referenceText: null,
      generatedAtText: '01/15/2026',
    },
    coverLetter: {
      sender,
      recipient: null,
      dateLine: '01/15/2026',
      reference: 'Reference baseline',
      subject: 'Subject baseline',
      body: 'Body baseline',
      signature: 'Signature baseline',
      opening: 'Hello,',
      closing: 'Regards,',
    },
    rows: [
      {
        invoiceId: 'inv-1',
        vendor: 'ACME',
        invoiceNumber: 'INV-001',
        dateText: '01/10/2026',
        status: null,
        statusText: null,
        invoiceAmountText: '100',
        allocatedAmountValueText: '100',
        isPartial: false,
        isDepositReduced: false,
        isDeposit: false,
        isRefund: false,
        refundNoteText: '',
        usageText,
        attachmentsNote: null,
        areaText: null,
      },
    ],
    summaryRows: [{ key: 'total', label: 'Total', amountText: '100' }],
    footnotes: [],
  } as unknown as ReportContent;
}

const USAGE_KEY = overrideKey.row('inv-1').usageText;
const SENDER_KEY = overrideKey.coverLetter.sender;
const REF_KEY = overrideKey.coverLetter.reference;

function renderEditor(
  options: {
    usageText?: string;
    sender?: string;
    overrides?: Record<string, string>;
    lang?: string;
    uiLang?: string;
  } = {},
) {
  const onFieldChange = jest.fn();
  const onFieldReset = jest.fn();
  const utils = render(
    <ReportContentEditor
      content={makeContent(options.usageText ?? 'Usage baseline', options.sender)}
      overrides={options.overrides ?? {}}
      onFieldChange={onFieldChange}
      onFieldReset={onFieldReset}
      hiddenColumns={new Set()}
      onToggleColumn={jest.fn()}
      attachDocuments={false}
      t={t}
      lang={options.lang}
      uiLang={options.uiLang}
    />,
  );
  const desktop = utils.container.querySelector('table.table') as HTMLElement;
  const mobile = utils.container.querySelector(`.${styles.mobileCardList}`) as HTMLElement;
  const dense = () => within(desktop).getByDisplayValue(options.usageText ?? 'Usage baseline');
  const labelled = () => within(mobile).getByLabelText('USAGE_LABEL') as HTMLInputElement;
  return { ...utils, onFieldChange, onFieldReset, desktop, mobile, dense, labelled };
}

describe('OverrideField through ReportContentEditor', () => {
  describe('element and label modes', () => {
    it('renders the usage text as a text input in both modes and the sender as a textarea', () => {
      const { dense, labelled, getByLabelText } = renderEditor();

      expect(dense().tagName).toBe('INPUT');
      expect(dense()).toHaveAttribute('type', 'text');
      expect(labelled().tagName).toBe('INPUT');
      const sender = getByLabelText('sourceReports.editable.senderLabel');
      expect(sender.tagName).toBe('TEXTAREA');
      expect(sender).toHaveAttribute('rows', '4');
    });

    it('dense mode: no label element, the aria-label is used directly', () => {
      const { dense, desktop } = renderEditor();

      expect(dense()).toHaveAttribute(
        'aria-label',
        'sourceReports.editable.usageTextAriaLabel::{"vendor":"ACME","invoiceNumber":"INV-001"}',
      );
      expect(desktop.querySelector('label')).toBeNull();
    });

    it('labelled mode: a real <label for> and no aria-label', () => {
      const { labelled, mobile } = renderEditor();

      expect(labelled()).not.toHaveAttribute('aria-label');
      const label = mobile.querySelector('label') as HTMLLabelElement;
      expect(label).toHaveTextContent('USAGE_LABEL');
      expect(label.htmlFor).toBe(labelled().id);
    });

    it('tags the fields with the report language', () => {
      const { dense } = renderEditor({ lang: 'de' });

      expect(dense()).toHaveAttribute('lang', 'de');
    });

    it('reports changes through onFieldChange with the override key', () => {
      const { dense, labelled, getByLabelText, onFieldChange } = renderEditor();

      fireEvent.change(dense(), { target: { value: 'New usage' } });
      expect(onFieldChange).toHaveBeenLastCalledWith(USAGE_KEY, 'New usage');
      fireEvent.change(labelled(), { target: { value: 'Mobile usage' } });
      expect(onFieldChange).toHaveBeenLastCalledWith(USAGE_KEY, 'Mobile usage');
      fireEvent.change(getByLabelText('sourceReports.editable.senderLabel'), {
        target: { value: 'New sender' },
      });
      expect(onFieldChange).toHaveBeenLastCalledWith(SENDER_KEY, 'New sender');
    });
  });

  describe('edited state', () => {
    it('is plain when not edited: no dot, no reset button, no suffix', () => {
      const { dense, desktop, queryByRole } = renderEditor();

      expect(desktop.querySelector(`.${styles.editedDot}`)).toBeNull();
      expect(queryByRole('button', { name: /resetFieldAriaLabel/ })).toBeNull();
      expect(dense().getAttribute('aria-label')).not.toContain('editedSuffix');
    });

    it('dense mode: shows an aria-hidden dot and appends the edited suffix to the aria-label', () => {
      const { desktop } = renderEditor({
        usageText: 'Edited usage',
        overrides: { [USAGE_KEY]: 'Edited usage' },
      });

      const input = within(desktop).getByDisplayValue('Edited usage');
      expect(input.getAttribute('aria-label')).toMatch(
        /INV-001"\}sourceReports\.editable\.editedSuffix$/,
      );
      const dot = desktop.querySelector(`.${styles.editedDot}`);
      expect(dot).toHaveAttribute('aria-hidden', 'true');
      expect(input).not.toHaveAttribute('aria-describedby', expect.stringContaining('edited-hint'));
    });

    it('labelled mode: announces the edit through a visually hidden described-by suffix span', () => {
      const { mobile } = renderEditor({
        usageText: 'Edited usage',
        overrides: { [USAGE_KEY]: 'Edited usage' },
      });

      const input = within(mobile).getByLabelText('USAGE_LABEL');
      const hintId = (input.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .find((id) => id.endsWith('-edited-hint'));
      expect(hintId).toBeDefined();
      const hint = mobile.ownerDocument.getElementById(hintId as string) as HTMLElement;
      expect(hint).toHaveTextContent('sourceReports.editable.editedSuffix');
      expect(hint.className).toContain('srOnly');
    });

    it('labelled mode without an edit has no edited-hint in aria-describedby', () => {
      const { labelled } = renderEditor();

      expect(labelled().getAttribute('aria-describedby') ?? '').not.toContain('edited-hint');
    });

    it('the reset button has an accessible name, title and ui language, and calls onFieldReset', () => {
      const { desktop, onFieldReset } = renderEditor({
        usageText: 'Edited usage',
        overrides: { [USAGE_KEY]: 'Edited usage' },
        uiLang: 'en',
      });
      const name =
        'sourceReports.editable.resetFieldAriaLabel::{"field":"sourceReports.table.usage"}';

      const button = within(desktop).getByRole('button', { name });
      expect(button).toHaveAttribute('title', name);
      expect(button).toHaveAttribute('lang', 'en');
      expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      fireEvent.click(button);
      expect(onFieldReset).toHaveBeenCalledWith(USAGE_KEY);
    });

    it('resets a cover-letter input (reference) by its key', () => {
      const { getByRole, onFieldReset } = renderEditor({ overrides: { [REF_KEY]: 'x' } });

      fireEvent.click(
        getByRole('button', {
          name: 'sourceReports.editable.resetFieldAriaLabel::{"field":"sourceReports.editable.referenceLabel"}',
        }),
      );
      expect(onFieldReset).toHaveBeenCalledWith(REF_KEY);
    });
  });

  describe('length limit', () => {
    const MAX = 500;
    const text = (n: number) => 'a'.repeat(n);
    const counter = (root: HTMLElement) => root.querySelector(`.${styles.counter}`);

    it('sets the native maxLength and describes the field with the limit hint', () => {
      const { dense, desktop } = renderEditor();

      expect(dense()).toHaveAttribute('maxlength', String(MAX));
      const ids = (dense().getAttribute('aria-describedby') ?? '').split(' ');
      const hint = desktop.ownerDocument.getElementById(
        ids.find((id) => id.endsWith('-limit-hint')) as string,
      ) as HTMLElement;
      expect(hint).toHaveTextContent('sourceReports.editable.maxLengthHint::{"max":500}');
      expect(hint.className).toContain('srOnly');
    });

    it('shows no counter below 90 % and the counter from 90 % on', () => {
      const below = renderEditor({ usageText: text(449) });
      expect(counter(below.desktop)).toBeNull();
      below.unmount();

      const at = renderEditor({ usageText: text(450) });
      expect(counter(at.desktop)).toHaveTextContent('450/500');
      expect(counter(at.desktop)).toHaveAttribute('aria-hidden', 'true');
    });

    it('keeps the reset button next to the counter in the meta row when edited', () => {
      const { desktop } = renderEditor({
        usageText: text(460),
        overrides: { [USAGE_KEY]: text(460) },
      });

      const meta = desktop.querySelector(`.${styles.metaRow}`) as HTMLElement;
      expect(meta).toHaveTextContent('460/500');
      expect(within(meta).getByRole('button')).toBeInTheDocument();
    });

    it('without a counter the reset button is a direct child of the container (no meta row)', () => {
      const { desktop } = renderEditor({ overrides: { [USAGE_KEY]: 'Usage baseline' } });

      expect(desktop.querySelector(`.${styles.metaRow}`)).toBeNull();
    });

    it('announces "reached" in the polite live region only at exactly the limit', () => {
      const at = renderEditor({ usageText: text(MAX) });
      const live = (root: HTMLElement) => root.querySelector('[aria-live="polite"]') as HTMLElement;
      expect(live(at.desktop)).toHaveTextContent(
        'sourceReports.editable.maxLengthReachedAnnouncement',
      );
      expect(live(at.desktop)).toHaveAttribute('aria-atomic', 'true');
      at.unmount();

      const under = renderEditor({ usageText: text(MAX - 1) });
      expect(live(under.desktop)).toBeEmptyDOMElement();
      under.unmount();

      const over = renderEditor({ usageText: text(MAX + 1) });
      expect(live(over.desktop)).toBeEmptyDOMElement();
    });

    it('over the limit: the counter turns to the over-limit style and the hint switches to the over hint', () => {
      const { desktop } = renderEditor({ usageText: text(MAX + 5) });

      expect(desktop.querySelector(`.${styles.counterOverLimit}`)).toHaveTextContent('505/500');
      expect(counter(desktop)).toBeNull();
      expect(desktop.querySelector('[id$="-limit-hint"]')).toHaveTextContent(
        'sourceReports.editable.overMaxLengthHint',
      );
    });

    it('applies the limits per field: sender 300, reference 100, usage 500', () => {
      const { getByLabelText } = renderEditor();

      expect(getByLabelText('sourceReports.editable.senderLabel')).toHaveAttribute(
        'maxlength',
        '300',
      );
      expect(getByLabelText('sourceReports.editable.referenceLabel')).toHaveAttribute(
        'maxlength',
        '100',
      );
    });

    it('the textarea shows the counter too', () => {
      const { getByLabelText, container } = renderEditor({ sender: 'b'.repeat(280) });

      expect(getByLabelText('sourceReports.editable.senderLabel')).toBeInTheDocument();
      expect(container.querySelector(`.${styles.counter}`)).toHaveTextContent('280/300');
    });
  });
});
