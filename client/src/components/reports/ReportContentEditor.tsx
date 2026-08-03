/**
 * ReportContentEditor — renders editable report content (cover letter + table + footnotes).
 * Handles field changes and resets via callbacks; no state management.
 */

import { useId, useState } from 'react';
import type { TFunction } from 'i18next';
import type { InvoiceStatus } from '@cornerstone/shared';
import type { ReportContent, ReportContentOverrides } from '../../lib/reportContent/index.js';
import { overrideKey } from '../../lib/reportContent/index.js';
import { Badge } from '../Badge/Badge.js';
import { EditableField } from '../EditableField/EditableField.js';
import styles from './ReportContentEditor.module.css';

export interface ReportContentEditorProps {
  content: ReportContent; // effective (overrides pre-applied)
  overrides: ReportContentOverrides;
  onFieldChange: (key: string, value: string) => void;
  onFieldReset: (key: string) => void;
  t: TFunction;
}

// Status badge className mapping
const STATUS_BADGE_CLASSNAME: Record<InvoiceStatus, string> = {
  pending: styles.statusPending!,
  paid: styles.statusPaid!,
  claimed: styles.statusClaimed!,
  quotation: styles.statusQuotation!,
};

type ColumnKey =
  'vendor' | 'invoiceNumber' | 'date' | 'status' | 'invoiceAmount' | 'allocatedAmount' | 'usage';

export function ReportContentEditor({
  content,
  overrides,
  onFieldChange,
  onFieldReset,
  t,
}: ReportContentEditorProps) {
  // Helper: check if a field has been overridden
  const isFieldEdited = (key: string): boolean => key in overrides;

  // Column visibility state. PREVIEW-ONLY: `hiddenColumns` is local to this component and is not
  // exposed as a prop or callback — the generated PDF always contains every column. The hint
  // rendered beside the toggles says so, because the control otherwise reads as "choose the
  // report's columns" (every other control in this editor does change the PDF). Wiring these
  // through to the PDF is a filed follow-up.
  const columnHintId = useId();
  const [hiddenColumns, setHiddenColumns] = useState<Set<ColumnKey>>(new Set());
  const toggleColumn = (col: ColumnKey) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  };
  const show = (col: ColumnKey) => !hiddenColumns.has(col);

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
              />
            )}

            <div className={styles.readOnlyField}>
              <span className={styles.readOnlyLabel}>
                {t('sourceReports.coverLetter.dateLabel')}
              </span>
              <span className={styles.readOnlyValue}>{content.coverLetter.dateLine}</span>
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
            />

            <div className={styles.readOnlyField}>
              <span className={styles.readOnlyLabel}>
                {t('sourceReports.editable.closingLabel')}
              </span>
              <span className={styles.readOnlyValue}>{content.coverLetter.closing}</span>
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
            />
          </div>
        </div>
      )}

      {/* Source Info Block */}
      {!content.isClaim && (
        <div className={styles.sourceInfoBlock}>
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
          <p id={columnHintId} className={styles.columnToggleHint}>
            {t('sourceReports.editable.columnVisibilityHint')}
          </p>
          <div
            className={styles.columnToggles}
            role="group"
            aria-label={t('sourceReports.editable.columnVisibilityLabel')}
            aria-describedby={columnHintId}
          >
            {(
              [
                ['vendor', content.labels.vendor],
                ['invoiceNumber', content.labels.invoiceNumber],
                ['date', content.labels.date],
                ...(content.isOverview
                  ? [['status', content.labels.status] as [ColumnKey, string]]
                  : []),
                ['invoiceAmount', content.labels.invoiceAmount],
                ['allocatedAmount', content.labels.allocatedAmount],
                ['usage', content.labels.usage],
              ] as [ColumnKey, string][]
            ).map(([col, label]) => (
              <label key={col} className={styles.columnToggle}>
                <input type="checkbox" checked={show(col)} onChange={() => toggleColumn(col)} />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
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
      <div className={styles.mobileCardList}>
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
        <table className={styles.summaryTable}>
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
        <div className={styles.footnotes}>
          <ul>
            {content.footnotes.map((note) => (
              <li key={note.id}>
                <span className={styles.footnoteMarker}>{note.marker}:</span>
                {note.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
