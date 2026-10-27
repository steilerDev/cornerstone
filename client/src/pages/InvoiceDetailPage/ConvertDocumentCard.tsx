import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { EntityPicker } from '../../components/EntityPicker/EntityPicker.js';
import { FormError } from '../../components/FormError/FormError.js';
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
 * The optional source document of the final invoice: pick one from Paperless (the picker's clear
 * button removes it) and, when the AI reader is on, read its amounts into suggestions. Rendered by the host only when Paperless works.
 */
export function ConvertDocumentCard({
  doc,
  offerAmount,
  onRead,
  disabled,
}: ConvertDocumentCardProps) {
  const { t } = useTranslation('budget');
  const { formatCurrency } = useFormatters();
  const readRef = useRef<HTMLButtonElement>(null);
  const pendingFocusRef = useRef(false);
  const { document: selected, aiState } = doc;
  const reading = aiState === 'analyzing';

  // Try again unmounts itself: focus goes to Read amounts once the error block is gone.
  useEffect(() => {
    if (!pendingFocusRef.current || aiState === 'error') return;
    pendingFocusRef.current = false;
    readRef.current!.focus();
  }, [aiState]);

  const read = async () => {
    const candidates = await doc.analyze(selected!.id, offerAmount);
    if (candidates) onRead(candidates);
  };

  return (
    <SectionCard
      id="convert-document"
      title={t('convertPage.document.title')}
      testId="convert-document"
    >
      <div className={styles.stack}>
        <label htmlFor="convert-document-picker" className={styles.label}>
          {t('convertPage.document.label')}
        </label>
        <p className={styles.hint}>{t('convertPage.document.prompt')}</p>
        <EntityPicker
          kind="document"
          id="convert-document-picker"
          value={selected ? String(selected.id) : ''}
          selectedLabel={selected?.title}
          disabled={disabled}
          onChange={(value, option) =>
            value === '' ? doc.remove() : doc.select({ id: Number(value), title: option!.label })
          }
        />
        {selected && doc.llmEnabled && (
          <div className={styles.documentActions}>
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
          </div>
        )}

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
                pendingFocusRef.current = true;
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
    </SectionCard>
  );
}
