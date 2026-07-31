/**
 * ReportContentEditor — renders editable report content (cover letter + table + footnotes).
 * Handles field changes and resets via callbacks; no state management.
 */

import type { TFunction } from 'i18next';
import type { ReportContent, ReportContentOverrides } from '../../lib/reportContent/index.js';
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

export function ReportContentEditor({
  content,
  overrides,
  onFieldChange,
  onFieldReset,
  t,
}: ReportContentEditorProps) {
  // Helper: check if a field has been overridden
  const isFieldEdited = (key: string): boolean => key in overrides;

  // Status badge variants
  const statusBadgeVariants = {
    pending: {
      label: t('sources.lines.invoiceStatus.pending'),
      className: styles.statusPending,
    },
    paid: {
      label: t('sources.lines.invoiceStatus.paid'),
      className: styles.statusPaid,
    },
    claimed: {
      label: t('sources.lines.invoiceStatus.claimed'),
      className: styles.statusClaimed,
    },
    quotation: {
      label: t('sources.lines.invoiceStatus.quotation'),
      className: styles.statusQuotation,
    },
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
              onChange={(value) => onFieldChange('coverLetter.sender', value)}
              isEdited={isFieldEdited('coverLetter.sender')}
              onReset={() => onFieldReset('coverLetter.sender')}
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
                onChange={(value) => onFieldChange('coverLetter.recipient', value)}
                isEdited={isFieldEdited('coverLetter.recipient')}
                onReset={() => onFieldReset('coverLetter.recipient')}
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
                onChange={(value) => onFieldChange('coverLetter.reference', value)}
                isEdited={isFieldEdited('coverLetter.reference')}
                onReset={() => onFieldReset('coverLetter.reference')}
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
              onChange={(value) => onFieldChange('coverLetter.subject', value)}
              isEdited={isFieldEdited('coverLetter.subject')}
              onReset={() => onFieldReset('coverLetter.subject')}
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
              onChange={(value) => onFieldChange('coverLetter.body', value)}
              isEdited={isFieldEdited('coverLetter.body')}
              onReset={() => onFieldReset('coverLetter.body')}
              rows={6}
            />
          </div>
        </div>
      )}

      {/* Report Table */}
      <h3 className={styles.tableHeading}>{t('sourceReports.editable.tableHeading')}</h3>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('sourceReports.table.vendor')}</th>
              <th>{t('sourceReports.table.invoiceNumber')}</th>
              <th>{t('sourceReports.table.date')}</th>
              {content.isOverview && <th>{t('sourceReports.table.status')}</th>}
              <th className={styles.rightAlign}>{t('sourceReports.table.invoiceAmount')}</th>
              <th className={styles.rightAlign}>{t('sourceReports.table.allocatedAmount')}</th>
              <th>{t('sourceReports.table.usage')}</th>
              {content.rows.some((r) => r.attachmentsNote !== null) && (
                <th>{t('sourceReports.editable.attachmentsNoteLabel')}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {content.rows.map((row) => (
              <tr key={row.invoiceId}>
                <td>{row.vendor}</td>
                <td>{row.invoiceNumber}</td>
                <td>{row.dateText}</td>
                {content.isOverview && row.status && row.statusText && (
                  <td>
                    <Badge value={row.status} variants={statusBadgeVariants} />
                  </td>
                )}
                <td
                  className={styles.rightAlign}
                  style={{
                    color: row.isRefund ? 'var(--color-refund-text)' : 'inherit',
                  }}
                >
                  {row.invoiceAmountText}
                </td>
                <td
                  className={styles.rightAlign}
                  style={{
                    color: row.isRefund ? 'var(--color-refund-text)' : 'inherit',
                  }}
                >
                  {row.allocatedAmountValueText}
                  {row.allocatedMarkers}
                  {row.isRefund && ` ${row.refundNoteText}`}
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
                      field: 'usage',
                    })}
                    value={row.usageText}
                    onChange={(value) => onFieldChange(`row.${row.invoiceId}.usageText`, value)}
                    isEdited={isFieldEdited(`row.${row.invoiceId}.usageText`)}
                    onReset={() => onFieldReset(`row.${row.invoiceId}.usageText`)}
                  />
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
                        field: 'attachmentsNote',
                      })}
                      value={row.attachmentsNote}
                      onChange={(value) =>
                        onFieldChange(`row.${row.invoiceId}.attachmentsNote`, value)
                      }
                      isEdited={isFieldEdited(`row.${row.invoiceId}.attachmentsNote`)}
                      onReset={() => onFieldReset(`row.${row.invoiceId}.attachmentsNote`)}
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
              <label>{t('sourceReports.table.vendor')}</label>
              <span>{row.vendor}</span>
            </div>
            <div className={styles.mobileCardRow}>
              <label>{t('sourceReports.table.invoiceNumber')}</label>
              <span>{row.invoiceNumber}</span>
            </div>
            <div className={styles.mobileCardRow}>
              <label>{t('sourceReports.table.date')}</label>
              <span>{row.dateText}</span>
            </div>
            {content.isOverview && row.status && (
              <div className={styles.mobileCardRow}>
                <label>{t('sourceReports.table.status')}</label>
                <Badge value={row.status} variants={statusBadgeVariants} />
              </div>
            )}
            <div className={styles.mobileCardRow}>
              <label>{t('sourceReports.table.invoiceAmount')}</label>
              <span
                style={{
                  color: row.isRefund ? 'var(--color-refund-text)' : 'inherit',
                }}
              >
                {row.invoiceAmountText}
              </span>
            </div>
            <div className={styles.mobileCardRow}>
              <label>{t('sourceReports.table.allocatedAmount')}</label>
              <span
                style={{
                  color: row.isRefund ? 'var(--color-refund-text)' : 'inherit',
                }}
              >
                {row.allocatedAmountValueText}
                {row.allocatedMarkers}
                {row.isRefund && ` ${row.refundNoteText}`}
              </span>
            </div>
            <div className={styles.mobileCardRow}>
              <label>{t('sourceReports.table.usage')}</label>
              <EditableField
                as="input"
                ariaLabel={t('sourceReports.editable.usageTextAriaLabel', {
                  vendor: row.vendor,
                  invoiceNumber: row.invoiceNumber,
                })}
                editedSuffix={t('sourceReports.editable.editedSuffix')}
                resetAriaLabel={t('sourceReports.editable.resetFieldAriaLabel', {
                  field: 'usage',
                })}
                value={row.usageText}
                onChange={(value) => onFieldChange(`row.${row.invoiceId}.usageText`, value)}
                isEdited={isFieldEdited(`row.${row.invoiceId}.usageText`)}
                onReset={() => onFieldReset(`row.${row.invoiceId}.usageText`)}
              />
            </div>
            {row.attachmentsNote !== null && (
              <div className={styles.mobileCardRow}>
                <label>{t('sourceReports.editable.attachmentsNoteLabel')}</label>
                <EditableField
                  as="input"
                  ariaLabel={t('sourceReports.editable.attachmentsNoteAriaLabel', {
                    vendor: row.vendor,
                    invoiceNumber: row.invoiceNumber,
                  })}
                  editedSuffix={t('sourceReports.editable.editedSuffix')}
                  resetAriaLabel={t('sourceReports.editable.resetFieldAriaLabel', {
                    field: 'attachmentsNote',
                  })}
                  value={row.attachmentsNote}
                  onChange={(value) => onFieldChange(`row.${row.invoiceId}.attachmentsNote`, value)}
                  isEdited={isFieldEdited(`row.${row.invoiceId}.attachmentsNote`)}
                  onReset={() => onFieldReset(`row.${row.invoiceId}.attachmentsNote`)}
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
