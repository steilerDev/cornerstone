/**
 * ReportContentEditor — renders editable report content (cover letter + table + footnotes).
 * Handles field changes and resets via callbacks; no state management.
 */

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

export function ReportContentEditor({
  content,
  overrides,
  onFieldChange,
  onFieldReset,
  t,
}: ReportContentEditorProps) {
  // Helper: check if a field has been overridden
  const isFieldEdited = (key: string): boolean => key in overrides;

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

            <div className={styles.dateLineField}>
              <span className={styles.dateLineLabel}>
                {t('sourceReports.coverLetter.dateLabel')}:
              </span>
              <span className={styles.dateLineValue}>{content.coverLetter.dateLine}</span>
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
              rows={6}
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
      <h3 className={styles.tableHeading}>{t('sourceReports.editable.tableHeading')}</h3>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{content.labels.vendor}</th>
              <th>{content.labels.invoiceNumber}</th>
              <th>{content.labels.date}</th>
              {content.isOverview && <th>{content.labels.status}</th>}
              <th className={styles.rightAlign}>{content.labels.invoiceAmount}</th>
              <th className={styles.rightAlign}>{content.labels.allocatedAmount}</th>
              <th>{content.labels.usage}</th>
              {content.rows.some((r) => r.attachmentsNote !== null) && (
                <th>{content.labels.attachmentsNote}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {content.rows.map((row) => (
              <tr key={row.invoiceId}>
                <td>{row.vendor}</td>
                <td>{row.invoiceNumber}</td>
                <td>{row.dateText}</td>
                {content.isOverview && row.status && row.statusText != null && (
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
                <td className={`${styles.rightAlign} ${row.isRefund ? styles.refundAmount : ''}`}>
                  {row.invoiceAmountText}
                </td>
                <td className={`${styles.rightAlign} ${row.isRefund ? styles.refundAmount : ''}`}>
                  {row.allocatedAmountValueText}
                  {row.allocatedMarkers}
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
                </td>
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
                  {row.areaText && <div className={styles.usageAreaText}>{row.areaText}</div>}
                </td>
                {row.attachmentsNote !== null && (
                  <td>
                    <EditableField
                      as="input"
                      ariaLabel={t('sourceReports.editable.attachmentsNoteAriaLabel', {
                        vendor: row.vendor,
                        invoiceNumber: row.invoiceNumber,
                      })}
                      editedSuffix={t('sourceReports.editable.editedSuffix')}
                      resetAriaLabel={t('sourceReports.editable.resetFieldAriaLabel', {
                        field: t('sourceReports.editable.attachmentsNoteLabel'),
                      })}
                      value={row.attachmentsNote}
                      onChange={(value) =>
                        onFieldChange(overrideKey.row(row.invoiceId).attachmentsNote, value)
                      }
                      isEdited={isFieldEdited(overrideKey.row(row.invoiceId).attachmentsNote)}
                      onReset={() => onFieldReset(overrideKey.row(row.invoiceId).attachmentsNote)}
                    />
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
            <div className={styles.mobileCardRow}>
              <span className={styles.mobileCardCaption}>{content.labels.vendor}</span>
              <span className={styles.mobileCardValue}>{row.vendor}</span>
            </div>
            <div className={styles.mobileCardRow}>
              <span className={styles.mobileCardCaption}>{content.labels.invoiceNumber}</span>
              <span className={styles.mobileCardValue}>{row.invoiceNumber}</span>
            </div>
            <div className={styles.mobileCardRow}>
              <span className={styles.mobileCardCaption}>{content.labels.date}</span>
              <span className={styles.mobileCardValue}>{row.dateText}</span>
            </div>
            {content.isOverview && row.status && row.statusText != null && (
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
            <div className={styles.mobileCardRow}>
              <span className={styles.mobileCardCaption}>{content.labels.invoiceAmount}</span>
              <span
                className={`${styles.mobileCardValue} ${row.isRefund ? styles.refundAmount : ''}`}
              >
                {row.invoiceAmountText}
              </span>
            </div>
            <div className={styles.mobileCardRow}>
              <span className={styles.mobileCardCaption}>{content.labels.allocatedAmount}</span>
              <span className={styles.mobileCardAllocated}>
                <span
                  className={`${styles.mobileCardValue} ${row.isRefund ? styles.refundAmount : ''}`}
                >
                  {row.allocatedAmountValueText}
                  {row.allocatedMarkers}
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
              </span>
            </div>
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
                onChange={(value) => onFieldChange(overrideKey.row(row.invoiceId).usageText, value)}
                isEdited={isFieldEdited(overrideKey.row(row.invoiceId).usageText)}
                onReset={() => onFieldReset(overrideKey.row(row.invoiceId).usageText)}
              />
              {row.areaText && <span className={styles.usageAreaText}>{row.areaText}</span>}
            </div>
            {row.attachmentsNote !== null && (
              <div className={styles.mobileCardRow}>
                <EditableField
                  as="input"
                  label={content.labels.attachmentsNote}
                  ariaLabel={t('sourceReports.editable.attachmentsNoteAriaLabel', {
                    vendor: row.vendor,
                    invoiceNumber: row.invoiceNumber,
                  })}
                  editedSuffix={t('sourceReports.editable.editedSuffix')}
                  resetAriaLabel={t('sourceReports.editable.resetFieldAriaLabel', {
                    field: t('sourceReports.editable.attachmentsNoteLabel'),
                  })}
                  value={row.attachmentsNote}
                  onChange={(value) =>
                    onFieldChange(overrideKey.row(row.invoiceId).attachmentsNote, value)
                  }
                  isEdited={isFieldEdited(overrideKey.row(row.invoiceId).attachmentsNote)}
                  onReset={() => onFieldReset(overrideKey.row(row.invoiceId).attachmentsNote)}
                />
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
