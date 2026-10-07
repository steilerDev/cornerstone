import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { BudgetSource, ConvertQuotationRequest, Invoice } from '@cornerstone/shared';
import { convertQuotation } from '../../lib/invoicesApi.js';
import { getPaperlessStatus } from '../../lib/paperlessApi.js';
import { fetchConfig } from '../../lib/configApi.js';
import { fetchBudgetSources } from '../../lib/budgetSourcesApi.js';
import { previewAutoItemize } from '../../lib/invoiceAutoItemizeApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import {
  computeDelta,
  computeDepositTotals,
  computeFinalPayment,
  computeProRataProposal,
  computeShortfall,
  defaultRefundSourceId,
  fromCents,
  hasTotalMismatch,
  parseAmount,
  toCents,
  type AmountDelta,
  type DepositTotals,
} from '../../lib/quotationConversion.js';

export type ConvertView = 'closed' | 'form' | 'paperless' | 'refund';
export type ConvertField = 'amount' | 'date' | 'invoiceNumber' | 'dueDate' | 'notes';
export type ConvertPendingFocus = 'addRefund' | 'finalAmount' | 'selectDocument';

export interface ConvertLineState {
  id: string;
  name: string;
  description: string | null;
  type: 'work_item' | 'household_item';
  /** Current itemizedAmount. */
  quoted: number;
  /** Input string. */
  proposed: string;
  /** True once the user typed into the proposed input. */
  edited: boolean;
  /** Per-row keep. */
  keep: boolean;
}

export interface ConvertFormState {
  amount: string;
  date: string;
  invoiceNumber: string;
  dueDate: string;
  notes: string;
  status: 'pending' | 'paid';
}

export interface UseConvertQuotationArgs {
  invoice: Invoice | null;
  /** Silent re-fetch (no page loading state); resolves with the fresh invoice. */
  refreshInvoice: () => Promise<Invoice>;
  onConverted: (invoice: Invoice) => void;
}

type AiState = 'idle' | 'analyzing' | 'success' | 'error';
type FieldErrorKey = 'amount' | 'date' | 'dueDate';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Local calendar date as YYYY-MM-DD. Call from handlers only, never during render. */
function todayIso(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

const EMPTY_FORM: ConvertFormState = {
  amount: '',
  date: '',
  invoiceNumber: '',
  dueDate: '',
  notes: '',
  status: 'pending',
};

/** Overwrites `proposed` on rows the user has neither edited nor pinned, from the pro-rata proposal. */
function applyProposal(
  lines: ConvertLineState[],
  quotedAmount: number,
  amountInput: string,
): ConvertLineState[] {
  const parsed = parseAmount(amountInput);
  if (parsed === null || parsed <= 0) return lines;
  const proposal = computeProRataProposal(
    lines.map((l) => ({ id: l.id, itemizedAmount: l.quoted })),
    quotedAmount,
    parsed,
  );
  return lines.map((l) =>
    !l.edited && !l.keep && proposal.has(l.id)
      ? { ...l, proposed: proposal.get(l.id)!.toFixed(2) }
      : l,
  );
}

export function useConvertQuotation({
  invoice,
  refreshInvoice,
  onConverted,
}: UseConvertQuotationArgs) {
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const { formatCurrency, formatDate } = useFormatters();

  const [view, setView] = useState<ConvertView>('closed');
  const [form, setForm] = useState<ConvertFormState>(EMPTY_FORM);
  const [touched, setTouched] = useState<ReadonlySet<ConvertField>>(() => new Set());
  const touchedRef = useRef<ReadonlySet<ConvertField>>(touched);
  // Fields holding saved quotation data (notes, invoice number): AI values are suggested, not applied.
  const protectedRef = useRef<ReadonlySet<ConvertField>>(new Set());
  const formRef = useRef<ConvertFormState>(EMPTY_FORM);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [lines, setLines] = useState<ConvertLineState[]>([]);
  const [keepExisting, setKeepExisting] = useState(false);

  const [paperless, setPaperless] = useState<{ configured: boolean; paperlessUrl: string | null }>({
    configured: false,
    paperlessUrl: null,
  });
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [budgetSources, setBudgetSources] = useState<BudgetSource[]>([]);

  const [selectedDocument, setSelectedDocument] = useState<{ id: number; title: string } | null>(
    null,
  );
  const [aiState, setAiState] = useState<AiState>('idle');
  const [aiError, setAiError] = useState('');
  const [suggestions, setSuggestions] = useState<Partial<Record<ConvertField, string>>>({});
  const [aiMismatch, setAiMismatch] = useState<{ extracted: number } | null>(null);
  const [aiNoLines, setAiNoLines] = useState(false);

  const [refundPreset, setRefundPreset] = useState({
    amount: '',
    dueDate: '',
    budgetSourceId: null as string | null,
    description: '',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [pendingFocus, setPendingFocus] = useState<ConvertPendingFocus | null>(null);

  // Invalidates in-flight async work when the flow is closed, reopened or unmounted.
  const sessionRef = useRef(0);
  useEffect(() => {
    formRef.current = form;
  }, [form]);
  useEffect(() => {
    return () => {
      sessionRef.current += 1;
    };
  }, []);

  const quotedAmount = invoice?.amount ?? 0;
  const deposits = invoice?.deposits ?? [];

  // ---- Derived values -----------------------------------------------------

  const parsedAmount = parseAmount(form.amount);
  const finalAmount: number | null =
    parsedAmount !== null && parsedAmount > 0 ? parsedAmount : null;
  const delta: AmountDelta = computeDelta(quotedAmount, finalAmount ?? quotedAmount);

  const lineEffectiveCents = (l: ConvertLineState): number => {
    if (keepExisting || l.keep) return toCents(l.quoted);
    return toCents(parseAmount(l.proposed) ?? 0);
  };
  const itemizedCents = lines.reduce((sum, l) => sum + lineEffectiveCents(l), 0);
  const itemizedTotal = fromCents(itemizedCents);
  const remainder = fromCents(toCents(finalAmount ?? 0) - itemizedCents);
  const overAllocated = finalAmount !== null && itemizedCents > toCents(finalAmount);
  const invalidLineIds = new Set<string>(
    keepExisting
      ? []
      : lines
          .filter((l) => {
            if (l.keep) return false;
            const v = parseAmount(l.proposed);
            return v === null || v <= 0;
          })
          .map((l) => l.id),
  );

  const depositTotals: DepositTotals = computeDepositTotals(deposits);
  const finalPayment = computeFinalPayment(finalAmount ?? 0, deposits);
  const shortfall = finalAmount !== null ? computeShortfall(finalAmount, deposits) : 0;

  const fieldErrors: Partial<Record<FieldErrorKey, string>> = {};
  if (form.amount.trim() === '' || parsedAmount === null) {
    fieldErrors.amount = t('invoiceDetail.convertModal.details.errors.amountRequired');
  } else if (parsedAmount <= 0) {
    fieldErrors.amount = t('invoiceDetail.convertModal.details.errors.amountPositive');
  }
  if (!form.date) {
    fieldErrors.date = t('invoiceDetail.convertModal.details.errors.dateRequired');
  }
  if (form.dueDate && form.date && form.dueDate < form.date) {
    fieldErrors.dueDate = t('invoiceDetail.convertModal.details.errors.dueDateBeforeDate');
  }

  const visibleFieldErrors: Partial<Record<FieldErrorKey, string>> = {};
  for (const key of ['amount', 'date', 'dueDate'] as const) {
    const message = fieldErrors[key];
    // The due date rule is cross-field and can already be broken at open or after AI prefill,
    // while Confirm is disabled, so its error must be visible without a touch or submit.
    if (message && (key === 'dueDate' || submitAttempted || touched.has(key))) {
      visibleFieldErrors[key] = message;
    }
  }

  const canConfirm =
    Object.keys(fieldErrors).length === 0 &&
    invalidLineIds.size === 0 &&
    !overAllocated &&
    !isSaving &&
    aiState !== 'analyzing';

  // "Deposits check passed" announcement: shortfall moved from > 0 to 0 while open.
  const [prevShortfall, setPrevShortfall] = useState(0);
  const [shortfallResolved, setShortfallResolved] = useState(false);
  if (prevShortfall !== shortfall) {
    setPrevShortfall(shortfall);
    setShortfallResolved(view !== 'closed' && prevShortfall > 0 && shortfall === 0);
  }

  // ---- Form handlers ------------------------------------------------------

  const markTouched = (field: ConvertField) => {
    if (touchedRef.current.has(field)) return;
    const next = new Set(touchedRef.current);
    next.add(field);
    touchedRef.current = next;
    setTouched(next);
  };

  const setField = <K extends ConvertField>(field: K, value: string) => {
    markTouched(field);
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === 'amount') {
      setLines((prev) => applyProposal(prev, quotedAmount, value));
    }
    // A manual edit supersedes any pending suggestion for the field.
    setSuggestions((prev) => {
      if (prev[field] === undefined) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const setStatus = (status: 'pending' | 'paid') => {
    setForm((prev) => ({ ...prev, status }));
  };

  const setLineProposed = (id: string, value: string) => {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, proposed: value, edited: true } : l)),
    );
  };

  const setLineKeep = (id: string, keep: boolean) => {
    setLines((prev) => {
      const toggled = prev.map((l) =>
        l.id === id ? { ...l, keep, edited: keep ? l.edited : false } : l,
      );
      return keep ? toggled : applyProposal(toggled, quotedAmount, form.amount);
    });
  };

  const resetProposal = () => {
    setLines((prev) =>
      applyProposal(
        prev.map((l) => ({ ...l, edited: false })),
        quotedAmount,
        form.amount,
      ),
    );
  };

  // ---- Open / close -------------------------------------------------------

  const open = () => {
    if (!invoice) return;
    const session = sessionRef.current + 1;
    sessionRef.current = session;

    const today = todayIso();
    const initialAmount = invoice.amount.toFixed(2);
    setForm({
      amount: initialAmount,
      date: today,
      invoiceNumber: invoice.invoiceNumber ?? '',
      dueDate: invoice.dueDate?.slice(0, 10) ?? '',
      notes: invoice.notes ?? '',
      status: 'pending',
    });
    const initialLines: ConvertLineState[] = invoice.budgetLines.map((bl) => ({
      id: bl.id,
      name: bl.itemName,
      description: bl.budgetLineDescription,
      type: bl.budgetLineType,
      quoted: bl.itemizedAmount,
      proposed: bl.itemizedAmount.toFixed(2),
      edited: false,
      keep: false,
    }));
    setLines(applyProposal(initialLines, invoice.amount, initialAmount));
    setKeepExisting(false);
    const emptyTouched = new Set<ConvertField>();
    touchedRef.current = emptyTouched;
    const protectedFields = new Set<ConvertField>();
    if ((invoice.notes ?? '').trim()) protectedFields.add('notes');
    if ((invoice.invoiceNumber ?? '').trim()) protectedFields.add('invoiceNumber');
    protectedRef.current = protectedFields;
    setTouched(emptyTouched);
    setSubmitAttempted(false);
    setSuggestions({});
    setAiState('idle');
    setAiError('');
    setAiMismatch(null);
    setAiNoLines(false);
    setSelectedDocument(null);
    setSaveError('');
    setIsSaving(false);
    setPendingFocus(null);
    setShortfallResolved(false);
    setView('form');

    void (async () => {
      try {
        const [status, config] = await Promise.all([getPaperlessStatus(), fetchConfig()]);
        if (sessionRef.current !== session) return;
        setPaperless({
          configured: status.configured && status.reachable,
          paperlessUrl: status.paperlessUrl ?? null,
        });
        setLlmEnabled(config.llmEnabled);
      } catch {
        if (sessionRef.current !== session) return;
        setPaperless({ configured: false, paperlessUrl: null });
        setLlmEnabled(false);
      }
    })();

    void (async () => {
      try {
        const result = await fetchBudgetSources();
        if (sessionRef.current !== session) return;
        setBudgetSources(result.budgetSources);
      } catch {
        if (sessionRef.current !== session) return;
        setBudgetSources([]);
      }
    })();
  };

  const close = () => {
    if (isSaving) return;
    sessionRef.current += 1;
    setView('closed');
  };

  // ---- Document / AI ------------------------------------------------------

  const openDocumentPicker = () => {
    setView('paperless');
  };

  const onDocumentSelected = (doc: { id: number; title: string }) => {
    setSelectedDocument({ id: doc.id, title: doc.title });
    setAiState('idle');
    setAiError('');
    setAiMismatch(null);
    setAiNoLines(false);
    setView('form');
    setPendingFocus('selectDocument');
  };

  const onPickerClosed = () => {
    setView('form');
    setPendingFocus('selectDocument');
  };

  const removeDocument = () => {
    setSelectedDocument(null);
    setAiState('idle');
    setAiError('');
    setAiMismatch(null);
    setAiNoLines(false);
  };

  const analyze = async () => {
    if (!selectedDocument || !llmEnabled || aiState === 'analyzing') return;
    const session = sessionRef.current;
    setAiState('analyzing');
    setAiError('');
    try {
      const result = await previewAutoItemize({ paperlessDocumentId: selectedDocument.id });
      if (sessionRef.current !== session) return;

      const candidates: Partial<Record<ConvertField, string>> = {};
      let extractedTotal: number | null = null;
      if (result.lines.length > 0) {
        const cents = result.lines.reduce((sum, l) => sum + toCents(l.totalAmount), 0);
        extractedTotal = fromCents(cents);
        candidates.amount = extractedTotal.toFixed(2);
        setAiNoLines(false);
      } else {
        setAiNoLines(true);
      }
      if (result.extractedInvoiceDate && ISO_DATE.test(result.extractedInvoiceDate)) {
        candidates.date = result.extractedInvoiceDate;
      }
      if (result.extractedDueDate && ISO_DATE.test(result.extractedDueDate)) {
        candidates.dueDate = result.extractedDueDate;
      }
      if (result.extractedInvoiceNumber) candidates.invoiceNumber = result.extractedInvoiceNumber;
      if (result.extractedNotes) candidates.notes = result.extractedNotes;

      const applied: Partial<Record<ConvertField, string>> = {};
      const suggested: Partial<Record<ConvertField, string>> = {};
      for (const field of Object.keys(candidates) as ConvertField[]) {
        if (candidates[field] === formRef.current[field]) continue;
        if (touchedRef.current.has(field) || protectedRef.current.has(field)) {
          suggested[field] = candidates[field];
        } else {
          applied[field] = candidates[field];
        }
      }

      if (Object.keys(applied).length > 0) {
        setForm((prev) => ({ ...prev, ...applied }));
      }
      if (applied.amount !== undefined) {
        const amountInput = applied.amount;
        setLines((prev) => applyProposal(prev, quotedAmount, amountInput));
      }
      setSuggestions(suggested);
      setAiMismatch(
        extractedTotal !== null && hasTotalMismatch(extractedTotal, quotedAmount)
          ? { extracted: extractedTotal }
          : null,
      );
      setAiState('success');
    } catch (err) {
      if (sessionRef.current !== session) return;
      setAiError(
        err instanceof ApiClientError
          ? translateApiError(err.error.code, tErrors)
          : t('invoiceDetail.convertModal.source.aiError'),
      );
      setAiState('error');
    }
  };

  const applySuggestion = (field: ConvertField) => {
    const value = suggestions[field];
    if (value === undefined) return;
    setField(field, value);
  };

  // ---- Refund -------------------------------------------------------------

  const openRefund = () => {
    setRefundPreset({
      amount: shortfall.toFixed(2),
      dueDate: todayIso(),
      budgetSourceId: defaultRefundSourceId(deposits),
      description: t('invoiceDetail.convertModal.overpaid.refundDescription'),
    });
    setView('refund');
  };

  const onRefundSaved = async () => {
    const session = sessionRef.current;
    let fresh: Invoice | null = null;
    try {
      fresh = await refreshInvoice();
    } catch {
      // Still return to the form; the shortfall banner stays until a refresh succeeds.
    }
    if (sessionRef.current !== session) return;
    const remaining =
      finalAmount !== null && fresh ? computeShortfall(finalAmount, fresh.deposits) : shortfall;
    setView('form');
    setPendingFocus(remaining > 0 ? 'addRefund' : 'finalAmount');
  };

  const onRefundClosed = () => {
    setView('form');
    setPendingFocus('addRefund');
  };

  // ---- Submit -------------------------------------------------------------

  const submit = async () => {
    setSubmitAttempted(true);
    if (!invoice || !canConfirm || finalAmount === null) return;

    const today = todayIso();
    const body: ConvertQuotationRequest = {
      amount: fromCents(toCents(finalAmount)),
      date: form.date,
      invoiceNumber: form.invoiceNumber.trim() || null,
      dueDate: form.dueDate || null,
      notes: form.notes.trim() || null,
      status: form.status,
      conversionNote: t('invoiceDetail.convertModal.history.converted', {
        amount: formatCurrency(quotedAmount),
        date: formatDate(today),
      }),
      budgetLines: keepExisting
        ? []
        : lines
            .filter((l) => !l.keep && toCents(parseAmount(l.proposed) ?? 0) !== toCents(l.quoted))
            .map((l) => ({
              id: l.id,
              itemizedAmount: fromCents(toCents(parseAmount(l.proposed) ?? 0)),
            })),
      ...(selectedDocument ? { paperlessDocumentId: selectedDocument.id } : {}),
    };

    setIsSaving(true);
    setSaveError('');
    try {
      const converted = await convertQuotation(invoice.id, body);
      onConverted(converted);
      sessionRef.current += 1;
      setView('closed');
    } catch (err) {
      if (err instanceof ApiClientError) {
        const code = err.error.code;
        if (code === 'ITEMIZED_SUM_EXCEEDS_INVOICE') {
          setSaveError(t('invoiceDetail.convertModal.errors.itemizedExceeds'));
        } else if (code === 'INVOICE_NOT_QUOTATION') {
          setSaveError(t('invoiceDetail.convertModal.errors.notQuotation'));
          void refreshInvoice().catch(() => undefined);
        } else {
          setSaveError(translateApiError(code, tErrors));
        }
      } else {
        setSaveError(t('invoiceDetail.convertModal.saveError'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const clearPendingFocus = useCallback(() => {
    setPendingFocus(null);
  }, []);

  return {
    view,
    open,
    close,
    form,
    setField,
    setStatus,
    lines,
    keepExisting,
    setKeepExisting,
    setLineProposed,
    setLineKeep,
    resetProposal,
    quotedAmount,
    finalAmount,
    delta,
    itemizedTotal,
    remainder,
    overAllocated,
    invalidLineIds,
    invoiceDeposits: deposits,
    depositTotals,
    finalPayment,
    shortfall,
    shortfallResolved,
    fieldErrors,
    visibleFieldErrors,
    canConfirm,
    paperless,
    llmEnabled,
    selectedDocument,
    openDocumentPicker,
    onDocumentSelected,
    onPickerClosed,
    removeDocument,
    aiState,
    aiError,
    analyze,
    suggestions,
    applySuggestion,
    aiMismatch,
    aiNoLines,
    openRefund,
    onRefundSaved,
    onRefundClosed,
    refundPreset,
    budgetSources,
    isSaving,
    saveError,
    submit,
    pendingFocus,
    clearPendingFocus,
  };
}

export type UseConvertQuotation = ReturnType<typeof useConvertQuotation>;
