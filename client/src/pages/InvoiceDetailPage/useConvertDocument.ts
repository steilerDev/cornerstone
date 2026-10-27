import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { previewAutoItemize } from '../../lib/invoiceAutoItemizeApi.js';
import { fetchConfig } from '../../lib/configApi.js';
import { getPaperlessStatus } from '../../lib/paperlessApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { fromCents, hasTotalMismatch, toCents } from '../../lib/quotationConversion.js';

export type ConvertField = 'amount' | 'date' | 'invoiceNumber' | 'dueDate' | 'notes';
export type ConvertCandidates = Partial<Record<ConvertField, string>>;
export type ConvertAiState = 'idle' | 'analyzing' | 'success' | 'error';

export interface ConvertDocument {
  readonly id: number;
  readonly title: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface DocumentConfig {
  readonly configured: boolean;
  readonly paperlessUrl: string | null;
  readonly llmEnabled: boolean;
}

/** Paperless and AI off: the Document card is not shown. */
const NOT_CONFIGURED: DocumentConfig = { configured: false, paperlessUrl: null, llmEnabled: false };

/**
 * The Convert page's document: whether Paperless (and the AI reader) is available, the selected
 * document, and `analyze`, which reads it and returns the values it found for the form's fields.
 */
export function useConvertDocument() {
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const [config, setConfig] = useState<DocumentConfig>(NOT_CONFIGURED);
  const [document, setDocument] = useState<ConvertDocument | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [aiState, setAiState] = useState<ConvertAiState>('idle');
  const [aiError, setAiError] = useState('');
  const [mismatch, setMismatch] = useState<{ readonly extracted: number } | null>(null);
  const [noLines, setNoLines] = useState(false);
  // Invalidates a read that is still running when the document changes or the page unmounts.
  const sessionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getPaperlessStatus(), fetchConfig()])
      .then(([status, appConfig]) => {
        if (cancelled) return;
        setConfig({
          configured: status.configured && status.reachable,
          paperlessUrl: status.paperlessUrl ?? null,
          llmEnabled: appConfig.llmEnabled,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      sessionRef.current += 1;
    };
  }, []);

  const resetRead = () => {
    sessionRef.current += 1;
    setAiState('idle');
    setAiError('');
    setMismatch(null);
    setNoLines(false);
  };

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);

  const select = (selected: ConvertDocument) => {
    setDocument({ id: selected.id, title: selected.title });
    setPickerOpen(false);
    resetRead();
  };

  const remove = () => {
    setDocument(null);
    resetRead();
  };

  /** Reads the selected document; resolves with the values found, or null when it failed. */
  const analyze = async (
    documentId: number,
    offerAmount: number,
  ): Promise<ConvertCandidates | null> => {
    if (aiState === 'analyzing') return null;
    const session = sessionRef.current;
    setAiState('analyzing');
    setAiError('');
    try {
      const result = await previewAutoItemize({ paperlessDocumentId: documentId });
      if (sessionRef.current !== session) return null;

      const candidates: ConvertCandidates = {};
      let extractedTotal: number | null = null;
      if (result.lines.length > 0) {
        const cents = result.lines.reduce((sum, line) => sum + toCents(line.totalAmount), 0);
        extractedTotal = fromCents(cents);
        candidates.amount = extractedTotal.toFixed(2);
      }
      if (result.extractedInvoiceDate && ISO_DATE.test(result.extractedInvoiceDate)) {
        candidates.date = result.extractedInvoiceDate;
      }
      if (result.extractedDueDate && ISO_DATE.test(result.extractedDueDate)) {
        candidates.dueDate = result.extractedDueDate;
      }
      if (result.extractedInvoiceNumber) candidates.invoiceNumber = result.extractedInvoiceNumber;
      if (result.extractedNotes) candidates.notes = result.extractedNotes;

      setNoLines(extractedTotal === null);
      setMismatch(
        extractedTotal !== null && hasTotalMismatch(extractedTotal, offerAmount)
          ? { extracted: extractedTotal }
          : null,
      );
      setAiState('success');
      return candidates;
    } catch (err) {
      if (sessionRef.current !== session) return null;
      setAiError(
        err instanceof ApiClientError
          ? translateApiError(err.error.code, tErrors)
          : t('convertPage.document.readError'),
      );
      setAiState('error');
      return null;
    }
  };

  return {
    configured: config.configured,
    paperlessUrl: config.paperlessUrl,
    llmEnabled: config.llmEnabled,
    document,
    pickerOpen,
    openPicker,
    closePicker,
    select,
    remove,
    aiState,
    aiError,
    mismatch,
    noLines,
    analyze,
  };
}

export type UseConvertDocument = ReturnType<typeof useConvertDocument>;
