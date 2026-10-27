import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FormError } from '../../components/FormError/FormError.js';
import { InvoicePaperlessPickerModal } from '../../components/invoices/InvoicePaperlessPickerModal.js';
import { SectionCard } from '../../components/SectionCard/SectionCard.js';
import { Spinner } from '../../components/Spinner/Spinner.js';
import { useFormatters } from '../../lib/formatters.js';
import styles from './InvoiceConvertPage.module.css';
import type { ConvertCandidates, UseConvertDocument } from './useConvertDocument.js';

export interface ConvertDocumentCardProps {
  readonly doc: UseConvertDocument;
  readonly offerAmount: number;
  /** Receives what the document reader found. */
  readonly onRead: (candidates: ConvertCandidates) => void;
  readonly disabled: boolean;
}

/**
 * The optional source document of the final invoice: pick one from Paperless and, when the AI
 * reader is on, read its amounts into suggestions. Rendered by the host only when Paperless works.
 */
export function ConvertDocumentCard({
  doc,
  offerAmount,
  onRead,
  disabled,
}: ConvertDocumentCardProps) {
  const { t } = useTranslation('budget');
  const { formatCurrency } = useFormatters();
  const selectRef = useRef<HTMLButtonElement>(null);
  const readRef = useRef<HTMLButtonElement>(null);
  const pendingFocusRef = useRef<'select' | 'read' | null>(null);
  const { document: selected, pickerOpen, aiState } = doc;
  const reading = aiState === 'analyzing';

  // A control that unmounts itself (the picker, Remove, Try again) hands focus to a button that
  // stays: Select / Change document, or Read amounts once the error block is gone.
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (pending === null || pickerOpen || aiState === 'error') return;
    pendingFocusRef.current = null;
    (pending === 'select' ? selectRef : readRef).current!.focus();
  }, [pickerOpen, selected, aiState]);

  const read = async () => {
    const candidates = await doc.analyze(selected!.id, offerAmount);
    if (candidates) onRead(candidates);
  };

  const closePicker = () => {
    pendingFocusRef.current = 'select';
    doc.closePicker();
  };

  return (
    <SectionCard
      id="convert-document"
      title={t('convertPage.document.title')}
      testId="convert-document"
    >
      <div className={styles.stack}>
        <div className={styles.documentBanner}>
          {selected ? (
            <span
              className={styles.fileName}
              title={selected.title}
              data-testid="convert-selected-document"
            >
              {selected.title}
            </span>
          ) : (
            <span>{t('convertPage.document.prompt')}</span>
          )}
          <div className={styles.documentActions}>
            <button
              type="button"
              ref={selectRef}
              className={styles.compactButton}
              onClick={doc.openPicker}
              disabled={disabled}
              data-testid="convert-select-document"
            >
              {selected ? t('convertPage.document.change') : t('convertPage.document.select')}
            </button>
            {selected && (
              <button
                type="button"
                className={styles.textButton}
                onClick={() => {
                  pendingFocusRef.current = 'select';
                  doc.remove();
                }}
                disabled={disabled}
                data-testid="convert-remove-document"
              >
                {t('convertPage.document.remove')}
              </button>
            )}
            {selected && doc.llmEnabled && (
              <button
                type="button"
                ref={readRef}
                className={styles.compactButton}
                onClick={() => void read()}
                disabled={disabled}
                aria-disabled={reading ? 'true' : undefined}
                data-testid="convert-ai-prefill"
              >
                {reading ? (
                  <span className={styles.busy}>
                    <Spinner size="sm" color="muted" />
                    {t('convertPage.document.reading')}
                  </span>
                ) : (
                  t('convertPage.document.read')
                )}
              </button>
            )}
          </div>
        </div>

        <p role="status" className={styles.readStatus} data-testid="convert-read-status">
          {aiState === 'success' ? t('convertPage.document.readDone') : ''}
        </p>
        {aiState === 'error' && (
          <div data-testid="convert-ai-error">
            <FormError message={doc.aiError} />
            <button
              type="button"
              className={styles.compactButton}
              onClick={() => {
                pendingFocusRef.current = 'read';
                void read();
              }}
              data-testid="convert-ai-retry"
            >
              {t('convertPage.document.tryAgain')}
            </button>
          </div>
        )}
        {aiState === 'success' && doc.mismatch && (
          <div className={styles.notice} data-testid="convert-ai-mismatch">
            {t('convertPage.document.mismatch', {
              extracted: formatCurrency(doc.mismatch.extracted),
              offered: formatCurrency(offerAmount),
            })}
          </div>
        )}
        {aiState === 'success' && doc.noLines && (
          <p className={styles.muted}>{t('convertPage.document.noLines')}</p>
        )}
        {selected && <p className={styles.hint}>{t('convertPage.document.linkedNote')}</p>}
      </div>

      {pickerOpen && (
        <InvoicePaperlessPickerModal
          onDocumentSelected={(picked) => {
            pendingFocusRef.current = 'select';
            doc.select({ id: picked.id, title: picked.title });
          }}
          onManualEntry={closePicker}
          onClose={closePicker}
          paperlessUrl={doc.paperlessUrl}
        />
      )}
    </SectionCard>
  );
}
