/**
 * ReportContentEditor — renders editable report content (cover letter + table + footnotes).
 * Handles field changes and resets via callbacks; no state management.
 */

import { useId, useMemo } from 'react';
import type { TFunction } from 'i18next';
import type { InvoiceStatus } from '@cornerstone/shared';
import type {
  ReportColumnKey,
  ReportContent,
  ReportContentOverrides,
} from '../../lib/reportContent/index.js';
import {
  isColumnLocked,
  overrideKey,
  reportColumnsForUseCase,
  visibleReportColumns,
} from '../../lib/reportContent/index.js';
import { Badge } from '../Badge/Badge.js';
import { EditableField } from '../EditableField/EditableField.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './ReportContentEditor.module.css';

export interface ReportContentEditorProps {
  content: ReportContent; // effective (overrides pre-applied)
  overrides: ReportContentOverrides;
  onFieldChange: (key: string, value: string) => void;
  onFieldReset: (key: string) => void;
  /** Columns the user has hidden from the preview and generated PDF (#1973 AC 1.1: this
   * component holds no column state of its own — it is fully controlled by the parent). */
  hiddenColumns: ReadonlySet<ReportColumnKey>;
  onToggleColumn: (col: ReportColumnKey) => void;
  /** Whether the wizard's "attach source documents" setting is enabled — drives the
   * Usage-hidden-with-attachments warning banner (AC 3/#1973 UX spec §2). */
  attachDocuments: boolean;
  t: TFunction;
  /** HTML lang attribute for report-language content. Omit when report language matches UI language. */
  lang?: string;
  /** HTML lang attribute for UI-chrome content (reset button, sr-only hints). Omit when report language matches UI language. */
  uiLang?: string;
}

// Status badge className mapping
const STATUS_BADGE_CLASSNAME: Record<InvoiceStatus, string> = {
  pending: styles.statusPending!,
  paid: styles.statusPaid!,
  claimed: styles.statusClaimed!,
  quotation: styles.statusQuotation!,
};

type ColumnKey = ReportColumnKey;

// #1941 AC2 — override field length limits. Each is anchored on a measured constant or an
// existing server-side cap; the rationale is recorded per-field, not shared, per AC2.

// sender: ~5 address lines — one line of headroom beyond the widest affordance (rows={4}).
// Deliberately equal to recipient (see below): the row-count affordance is a display choice,
// not a semantic difference, and both render in the letter's fixed address zone.
const SENDER_MAX_LENGTH = 300;

// recipient: deliberately equal to sender (300) — a recipient block legitimately carries a
// department, a c/o line, or a country line, so an asymmetric cap would be arbitrary and only
// discoverable once one of the two trips it.
const RECIPIENT_MAX_LENGTH = 300;

// reference: matches invoices.invoiceNumber (server/src/routes/invoices.ts:25) — same category
// of value, an external identifier.
const REFERENCE_MAX_LENGTH = 100;

// subject: matches vendors.name / areas.name (server/src/routes/vendors.ts:35,
// server/src/routes/areas.ts:12) — the codebase's established "short human-authored label" cap.
const SUBJECT_MAX_LENGTH = 200;

// signature: same anchor as subject (200), deliberately not in the 300 sender/recipient band —
// it is a name plus an optional role, not an address block, and coverLetterPdf.ts:76-81 reserves
// a fixed 54pt signing gap above it on the assumption of a compact block.
const SIGNATURE_MAX_LENGTH = 200;

// body: buildCoverLetterContent() (coverLetterPdf.ts:59-74) emits plain flowing paragraphs with
// no table, no dontBreakRows, no fixed-height container, so pdfmake paginates natively and an
// over-long body makes more pages, never clips. Bounded instead by the realistic runaway:
// LLM_MAX_TOKENS defaults to 16384 output tokens (~60k chars), so 4000 (~1.5 A4 pages at this
// style) stops that runaway while a legitimate two-page letter never fights the limit.
const BODY_MAX_LENGTH = 4000;

// usageText: floor is invoiceBudgetLines.description (server/src/routes/invoiceBudgetLines.ts:49,
// cap 500) — getUsageText() (buildReportContent.ts:53) joins linked-item names/descriptions each
// already capped at 500 server-side, so a single budget line already admits a legal 500-char
// value. Ceiling is MAX_SAFE_USAGE_CHUNK_CHARS (overviewPdf.ts:245, 650) — the shared per-chunk
// budget for the whole Usage cell — leaving 150 chars for the derived areaText/attachmentsNote
// suffix rendered alongside it.
const USAGE_TEXT_MAX_LENGTH = 500;

export function ReportContentEditor({
  content,
  overrides,
  onFieldChange,
  onFieldReset,
  hiddenColumns,
  onToggleColumn,
  attachDocuments,
  t,
  lang,
  uiLang,
}: ReportContentEditorProps) {
  // Helper: check if a field has been overridden
  const isFieldEdited = (key: string): boolean => key in overrides;

  // Visible columns (AC 2.1's single derivation, shared with the PDF geometry engine) —
  // hiddenColumns/onToggleColumn are fully controlled by the parent (ReportWizardPage), which is
  // what makes this control actually change the generated PDF instead of being preview-only.
  const visible = useMemo(
    () => new Set(visibleReportColumns(content.isOverview, hiddenColumns)),
    [content.isOverview, hiddenColumns],
  );
  const show = (col: ColumnKey) => visible.has(col);
  const requiredHintId = useId();

  // Label lookup for the column-toggle list — mirrors overviewPdf.ts's HEADER_LABEL pattern, so
  // the toggle list's column ENUMERATION comes from reportColumnsForUseCase (AC 2.1's single
  // derivation, shared with the PDF geometry engine) rather than a second, independently
  // maintained array literal.
  const COLUMN_LABEL: Record<ColumnKey, string> = {
    vendor: content.labels.vendor,
    invoiceNumber: content.labels.invoiceNumber,
    date: content.labels.date,
    status: content.labels.status,
    invoiceAmount: content.labels.invoiceAmount,
    allocatedAmount: content.labels.allocatedAmount,
    usage: content.labels.usage,
  };

  return (
    <div className={styles.container}>
      {/* Cover Letter */}
      {content.coverLetter && (
        <div className={styles.coverLetterCard}>
          <h3>{t('sourceReports.editable.coverLetterHeading')}</h3>

          <div className={styles.letterFields}>
            <EditableField
              as="textarea"
              label={t('sourceReports.editable.senderLabel')}
              ariaLabel={t('sourceReports.editable.senderLabel')}
              editedSuffix={t('sourceReports.editable.editedSuffix')}
              resetAriaLabel={t('sourceReports.editable.resetFieldAriaLabel', {
                field: t('sourceReports.editable.senderLabel'),
              })}
              value={content.coverLetter.sender}
              onChange={(value) => onFieldChange(overrideKey.coverLetter.sender, value)}
              isEdited={isFieldEdited(overrideKey.coverLetter.sender)}
              onReset={() => onFieldReset(overrideKey.coverLetter.sender)}
              rows={4}
              lang={lang}
              uiLang={uiLang}
              maxLength={SENDER_MAX_LENGTH}
              maxLengthHint={t('sourceReports.editable.maxLengthHint', {
                max: SENDER_MAX_LENGTH,
              })}
              overMaxLengthHint={t('sourceReports.editable.overMaxLengthHint')}
              maxLengthReachedAnnouncement={t(
                'sourceReports.editable.maxLengthReachedAnnouncement',
              )}
            />

            {content.coverLetter.recipient && (
              <EditableField
                as="textarea"
                label={t('sourceReports.editable.recipientLabel')}
                ariaLabel={t('sourceReports.editable.recipientLabel')}
                editedSuffix={t('sourceReports.editable.editedSuffix')}
                resetAriaLabel={t('sourceReports.editable.resetFieldAriaLabel', {
                  field: t('sourceReports.editable.recipientLabel'),
                })}
                value={content.coverLetter.recipient}
                onChange={(value) => onFieldChange(overrideKey.coverLetter.recipient, value)}
                isEdited={isFieldEdited(overrideKey.coverLetter.recipient)}
                onReset={() => onFieldReset(overrideKey.coverLetter.recipient)}
                rows={3}
                lang={lang}
                uiLang={uiLang}
                maxLength={RECIPIENT_MAX_LENGTH}
                maxLengthHint={t('sourceReports.editable.maxLengthHint', {
                  max: RECIPIENT_MAX_LENGTH,
                })}
                overMaxLengthHint={t('sourceReports.editable.overMaxLengthHint')}
                maxLengthReachedAnnouncement={t(
                  'sourceReports.editable.maxLengthReachedAnnouncement',
                )}
              />
            )}

            <div className={styles.readOnlyField}>
              <span className={styles.readOnlyLabel}>
                {t('sourceReports.coverLetter.dateLabel')}
              </span>
              <span className={styles.readOnlyValue} lang={lang}>
                {content.coverLetter.dateLine}
              </span>
            </div>

            {content.coverLetter.reference && (
              <EditableField
                as="input"
                label={t('sourceReports.editable.referenceLabel')}
                ariaLabel={t('sourceReports.editable.referenceLabel')}
                editedSuffix={t('sourceReports.editable.editedSuffix')}
                resetAriaLabel={t('sourceReports.editable.resetFieldAriaLabel', {
                  field: t('sourceReports.editable.referenceLabel'),
                })}
                value={content.coverLetter.reference}
                onChange={(value) => onFieldChange(overrideKey.coverLetter.reference, value)}
                isEdited={isFieldEdited(overrideKey.coverLetter.reference)}
                onReset={() => onFieldReset(overrideKey.coverLetter.reference)}
                lang={lang}
                uiLang={uiLang}
                maxLength={REFERENCE_MAX_LENGTH}
                maxLengthHint={t('sourceReports.editable.maxLengthHint', {
                  max: REFERENCE_MAX_LENGTH,
                })}
                overMaxLengthHint={t('sourceReports.editable.overMaxLengthHint')}
                maxLengthReachedAnnouncement={t(
                  'sourceReports.editable.maxLengthReachedAnnouncement',
                )}
              />
            )}

            <EditableField
              as="input"
              label={t('sourceReports.editable.subjectLabel')}
              ariaLabel={t('sourceReports.editable.subjectLabel')}
              editedSuffix={t('sourceReports.editable.editedSuffix')}
              resetAriaLabel={t('sourceReports.editable.resetFieldAriaLabel', {
                field: t('sourceReports.editable.subjectLabel'),
              })}
              value={content.coverLetter.subject}
              onChange={(value) => onFieldChange(overrideKey.coverLetter.subject, value)}
              isEdited={isFieldEdited(overrideKey.coverLetter.subject)}
              onReset={() => onFieldReset(overrideKey.coverLetter.subject)}
              lang={lang}
              uiLang={uiLang}
              maxLength={SUBJECT_MAX_LENGTH}
              maxLengthHint={t('sourceReports.editable.maxLengthHint', {
                max: SUBJECT_MAX_LENGTH,
              })}
              overMaxLengthHint={t('sourceReports.editable.overMaxLengthHint')}
              maxLengthReachedAnnouncement={t(
                'sourceReports.editable.maxLengthReachedAnnouncement',
              )}
            />

            <EditableField
              as="textarea"
              label={t('sourceReports.editable.bodyLabel')}
              ariaLabel={t('sourceReports.editable.bodyLabel')}
              editedSuffix={t('sourceReports.editable.editedSuffix')}
              resetAriaLabel={t('sourceReports.editable.resetFieldAriaLabel', {
                field: t('sourceReports.editable.bodyLabel'),
              })}
              value={content.coverLetter.body}
              onChange={(value) => onFieldChange(overrideKey.coverLetter.body, value)}
              isEdited={isFieldEdited(overrideKey.coverLetter.body)}
              onReset={() => onFieldReset(overrideKey.coverLetter.body)}
              rows={10}
              lang={lang}
              uiLang={uiLang}
              maxLength={BODY_MAX_LENGTH}
              maxLengthHint={t('sourceReports.editable.maxLengthHint', {
                max: BODY_MAX_LENGTH,
              })}
              overMaxLengthHint={t('sourceReports.editable.overMaxLengthHint')}
              maxLengthReachedAnnouncement={t(
                'sourceReports.editable.maxLengthReachedAnnouncement',
              )}
            />

            <div className={styles.readOnlyField}>
              <span className={styles.readOnlyLabel}>
                {t('sourceReports.editable.closingLabel')}
              </span>
              <span className={styles.readOnlyValue} lang={lang}>
                {content.coverLetter.closing}
              </span>
            </div>

            <EditableField
              as="input"
              label={t('sourceReports.editable.signatureLabel')}
              ariaLabel={t('sourceReports.editable.signatureLabel')}
              editedSuffix={t('sourceReports.editable.editedSuffix')}
              resetAriaLabel={t('sourceReports.editable.resetFieldAriaLabel', {
                field: t('sourceReports.editable.signatureLabel'),
              })}
              value={content.coverLetter.signature}
              onChange={(value) => onFieldChange(overrideKey.coverLetter.signature, value)}
              isEdited={isFieldEdited(overrideKey.coverLetter.signature)}
              onReset={() => onFieldReset(overrideKey.coverLetter.signature)}
              lang={lang}
              uiLang={uiLang}
              maxLength={SIGNATURE_MAX_LENGTH}
              maxLengthHint={t('sourceReports.editable.maxLengthHint', {
                max: SIGNATURE_MAX_LENGTH,
              })}
              overMaxLengthHint={t('sourceReports.editable.overMaxLengthHint')}
              maxLengthReachedAnnouncement={t(
                'sourceReports.editable.maxLengthReachedAnnouncement',
              )}
            />
          </div>
        </div>
      )}

      {/* Source Info Block */}
      {!content.isClaim && (
        <div className={styles.sourceInfoBlock} lang={lang}>
          <p>
            {content.labels.source}: {content.sourceInfo.sourceName}
          </p>
          <p>
            {content.labels.sourceType}: {content.sourceInfo.sourceTypeText}
          </p>
          {content.sourceInfo.referenceText && (
            <p>
              {content.labels.reference}: {content.sourceInfo.referenceText}
            </p>
          )}
          <p>
            {content.labels.generatedAt}: {content.sourceInfo.generatedAtText}
          </p>
        </div>
      )}

      {/* Report Table */}
      <div className={styles.tableHeadingRow}>
        <h3 className={styles.tableHeading}>{t('sourceReports.editable.tableHeading')}</h3>
        <div className={styles.columnToggleGroup}>
          <div
            className={styles.columnToggles}
            role="group"
            aria-label={t('sourceReports.editable.columnVisibilityLabel')}
          >
            {reportColumnsForUseCase(content.isOverview).map((col) => (
              <label key={col} className={styles.columnToggle} lang={lang}>
                <input
                  type="checkbox"
                  checked={show(col)}
                  disabled={isColumnLocked(col)}
                  aria-describedby={isColumnLocked(col) ? requiredHintId : undefined}
                  onChange={() => onToggleColumn(col)}
                  data-column-key={col}
                />
                {COLUMN_LABEL[col]}
                {isColumnLocked(col) && (
                  <span aria-hidden="true" className={styles.requiredMarker}>
                    {' '}
                    *
                  </span>
                )}
              </label>
            ))}
          </div>
          <p id={requiredHintId} className={styles.columnToggleRequiredHint}>
            * {t('sourceReports.editable.allocatedAmountRequiredHint')}
          </p>
        </div>
      </div>
      {!show('usage') && attachDocuments && (
        <div className={sharedStyles.bannerWarning} role="status">
          {t('sourceReports.editable.usageHiddenAttachmentsWarning')}
        </div>
      )}
      <div className={styles.tableWrapper} lang={lang}>
        <table className={styles.table}>
          <thead lang={lang}>
            <tr>
              {show('vendor') && <th>{content.labels.vendor}</th>}
              {show('invoiceNumber') && <th>{content.labels.invoiceNumber}</th>}
              {show('date') && <th>{content.labels.date}</th>}
              {content.isOverview && show('status') && <th>{content.labels.status}</th>}
              {show('invoiceAmount') && (
                <th className={styles.rightAlign}>{content.labels.invoiceAmount}</th>
              )}
              {show('allocatedAmount') && (
                <th className={styles.rightAlign}>{content.labels.allocatedAmount}</th>
              )}
              {show('usage') && <th>{content.labels.usage}</th>}
            </tr>
          </thead>
          <tbody>
            {content.rows.map((row) => (
              <tr key={row.invoiceId}>
                {show('vendor') && <td>{row.vendor}</td>}
                {show('invoiceNumber') && <td>{row.invoiceNumber}</td>}
                {show('date') && <td>{row.dateText}</td>}
                {content.isOverview && show('status') && row.status && row.statusText != null && (
                  <td>
                    <Badge
                      value={row.status}
                      variants={{
                        [row.status]: {
                          label: row.statusText,
                          className: STATUS_BADGE_CLASSNAME[row.status as InvoiceStatus],
                        },
                      }}
                    />
                  </td>
                )}
                {content.isOverview &&
                  show('status') &&
                  (!row.status || row.statusText == null) && <td />}
                {show('invoiceAmount') && (
                  <td className={`${styles.rightAlign} ${row.isRefund ? styles.refundAmount : ''}`}>
                    {row.invoiceAmountText}
                  </td>
                )}
                {show('allocatedAmount') && (
                  <td className={`${styles.rightAlign} ${row.isRefund ? styles.refundAmount : ''}`}>
                    {row.allocatedAmountValueText}
                    {row.isRefund && ` ${row.refundNoteText}`}
                    {row.isDeposit && (
                      <Badge
                        className={styles.depositLabel}
                        variants={{
                          deposit: {
                            label: content.labels.deposit,
                            className: styles.depositBadge,
                          },
                        }}
                        value="deposit"
                      />
                    )}
                    {row.isSplit && (
                      <span className={styles.inlineNote}> ({content.labels.splitNote})</span>
                    )}
                    {row.isDepositReduced && (
                      <span className={styles.inlineNote}>
                        {' '}
                        ({content.labels.depositReducedNote})
                      </span>
                    )}
                  </td>
                )}
                {show('usage') && (
                  <td>
                    <EditableField
                      as="input"
                      ariaLabel={t('sourceReports.editable.usageTextAriaLabel', {
                        vendor: row.vendor,
                        invoiceNumber: row.invoiceNumber,
                      })}
                      editedSuffix={t('sourceReports.editable.editedSuffix')}
                      resetAriaLabel={t('sourceReports.editable.resetFieldAriaLabel', {
                        field: t('sourceReports.table.usage'),
                      })}
                      value={row.usageText}
                      onChange={(value) =>
                        onFieldChange(overrideKey.row(row.invoiceId).usageText, value)
                      }
                      isEdited={isFieldEdited(overrideKey.row(row.invoiceId).usageText)}
                      onReset={() => onFieldReset(overrideKey.row(row.invoiceId).usageText)}
                      lang={lang}
                      uiLang={uiLang}
                      maxLength={USAGE_TEXT_MAX_LENGTH}
                      maxLengthHint={t('sourceReports.editable.maxLengthHint', {
                        max: USAGE_TEXT_MAX_LENGTH,
                      })}
                      overMaxLengthHint={t('sourceReports.editable.overMaxLengthHint')}
                      maxLengthReachedAnnouncement={t(
                        'sourceReports.editable.maxLengthReachedAnnouncement',
                      )}
                    />
                    {(row.areaText || row.attachmentsNote) && (
                      <div className={styles.usageMetaText}>
                        {[row.areaText, row.attachmentsNote].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List */}
      <div className={styles.mobileCardList} lang={lang}>
        {content.rows.map((row) => (
          <div key={row.invoiceId} className={styles.mobileCard}>
            {show('vendor') && (
              <div className={styles.mobileCardRow}>
                <span className={styles.mobileCardCaption}>{content.labels.vendor}</span>
                <span className={styles.mobileCardValue}>{row.vendor}</span>
              </div>
            )}
            {show('invoiceNumber') && (
              <div className={styles.mobileCardRow}>
                <span className={styles.mobileCardCaption}>{content.labels.invoiceNumber}</span>
                <span className={styles.mobileCardValue}>{row.invoiceNumber}</span>
              </div>
            )}
            {show('date') && (
              <div className={styles.mobileCardRow}>
                <span className={styles.mobileCardCaption}>{content.labels.date}</span>
                <span className={styles.mobileCardValue}>{row.dateText}</span>
              </div>
            )}
            {content.isOverview && show('status') && row.status && row.statusText != null && (
              <div className={styles.mobileCardRow}>
                <span className={styles.mobileCardCaption}>{content.labels.status}</span>
                <Badge
                  value={row.status}
                  variants={{
                    [row.status]: {
                      label: row.statusText,
                      className: STATUS_BADGE_CLASSNAME[row.status as InvoiceStatus],
                    },
                  }}
                />
              </div>
            )}
            {show('invoiceAmount') && (
              <div className={styles.mobileCardRow}>
                <span className={styles.mobileCardCaption}>{content.labels.invoiceAmount}</span>
                <span
                  className={`${styles.mobileCardValue} ${row.isRefund ? styles.refundAmount : ''}`}
                >
                  {row.invoiceAmountText}
                </span>
              </div>
            )}
            {show('allocatedAmount') && (
              <div className={styles.mobileCardRow}>
                <span className={styles.mobileCardCaption}>{content.labels.allocatedAmount}</span>
                <span className={styles.mobileCardAllocated}>
                  <span
                    className={`${styles.mobileCardValue} ${row.isRefund ? styles.refundAmount : ''}`}
                  >
                    {row.allocatedAmountValueText}
                    {row.isRefund && ` ${row.refundNoteText}`}
                  </span>
                  {row.isDeposit && (
                    <Badge
                      variants={{
                        deposit: {
                          label: content.labels.deposit,
                          className: styles.depositBadge,
                        },
                      }}
                      value="deposit"
                    />
                  )}
                  {row.isSplit && (
                    <span className={styles.inlineNote}>({content.labels.splitNote})</span>
                  )}
                  {row.isDepositReduced && (
                    <span className={styles.inlineNote}>({content.labels.depositReducedNote})</span>
                  )}
                </span>
              </div>
            )}
            {show('usage') && (
              <div className={styles.mobileCardRow}>
                <EditableField
                  as="input"
                  label={content.labels.usage}
                  ariaLabel={t('sourceReports.editable.usageTextAriaLabel', {
                    vendor: row.vendor,
                    invoiceNumber: row.invoiceNumber,
                  })}
                  editedSuffix={t('sourceReports.editable.editedSuffix')}
                  resetAriaLabel={t('sourceReports.editable.resetFieldAriaLabel', {
                    field: t('sourceReports.table.usage'),
                  })}
                  value={row.usageText}
                  onChange={(value) =>
                    onFieldChange(overrideKey.row(row.invoiceId).usageText, value)
                  }
                  isEdited={isFieldEdited(overrideKey.row(row.invoiceId).usageText)}
                  onReset={() => onFieldReset(overrideKey.row(row.invoiceId).usageText)}
                  lang={lang}
                  uiLang={uiLang}
                  maxLength={USAGE_TEXT_MAX_LENGTH}
                  maxLengthHint={t('sourceReports.editable.maxLengthHint', {
                    max: USAGE_TEXT_MAX_LENGTH,
                  })}
                  overMaxLengthHint={t('sourceReports.editable.overMaxLengthHint')}
                  maxLengthReachedAnnouncement={t(
                    'sourceReports.editable.maxLengthReachedAnnouncement',
                  )}
                />
                {(row.areaText || row.attachmentsNote) && (
                  <span className={styles.usageMetaText}>
                    {[row.areaText, row.attachmentsNote].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary Rows */}
      {content.summaryRows.length > 0 && (
        <table className={styles.summaryTable} lang={lang}>
          <tbody>
            {content.summaryRows.map((row) => (
              <tr key={row.key}>
                <td className={styles.summaryLabel}>{row.label}</td>
                <td className={`${styles.rightAlign} ${styles.summaryAmount}`}>{row.amountText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Footnotes */}
      {content.footnotes.length > 0 && (
        <div className={styles.footnotes} lang={lang}>
          <ul>
            {content.footnotes.map((note) => (
              <li key={note.id}>
                <span className={styles.footnoteMarker}>{note.marker}:</span> {note.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
