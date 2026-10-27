import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ConvertQuotationRequest,
  InvoiceDeposit,
  InvoiceDetail,
  InvoiceStatus,
} from '@cornerstone/shared';
import type { CostLineGroup, CostLineRow } from '../../components/CostLineTable/index.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { convertQuotation, fetchInvoiceById } from '../../lib/invoicesApi.js';
import { todayLocalIsoDate } from '../../lib/localDate.js';
import {
  computeDelta,
  computeDepositTotals,
  computeFinalPayment,
  computeShortfall,
  defaultRefundSourceId,
  fromCents,
  parseAmount,
  toCents,
  type AmountDelta,
  type DepositTotals,
} from '../../lib/quotationConversion.js';
import {
  applyProposal,
  initialLines,
  invalidLineKeys,
  lineKey,
  lineUpdates,
  proposedTotalCents,
  remainderState,
  type ConvertLines,
  type ConvertLineState,
  type RemainderState,
} from './convertLines.js';
import type { ConvertCandidates, ConvertField } from './useConvertDocument.js';

export type ConvertTargetStatus = Extract<InvoiceStatus, 'pending' | 'paid'>;
export type ConvertOutcome = 'converted' | 'blocked' | 'failed' | 'notOffer';
export type ConvertProblemId = 'amount' | 'date' | 'dueDate' | 'lines' | 'over';

export interface ConvertFormState {
  readonly amount: string;
  readonly date: string;
  readonly invoiceNumber: string;
  readonly dueDate: string;
  readonly notes: string;
  readonly status: ConvertTargetStatus;
}

export interface ConvertProblem {
  readonly id: ConvertProblemId;
  readonly message: string;
}

type FieldErrorKey = 'amount' | 'date' | 'dueDate';

/** How long the amount stays quiet before the new proposal is announced. */
const ANNOUNCE_DELAY_MS = 500;

export interface UseConvertOfferArgs {
  readonly invoice: InvoiceDetail;
  readonly rows: readonly CostLineRow[];
  readonly groups: readonly CostLineGroup[];
}

/**
 * The Convert page's form: details, per-line proposals, refund and submit state. Everything is
 * initialised once from the loaded offer; the form owns its own copy of the progress payments so
 * a refund recorded here never reloads the page.
 */
export function useConvertOffer({ invoice, rows, groups }: UseConvertOfferArgs) {
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const { formatCurrency, formatDate } = useFormatters();

  const offerAmount = invoice.amount;
  const [today] = useState(() => todayLocalIsoDate());
  const [initialForm] = useState<ConvertFormState>(() => ({
    amount: invoice.amount.toFixed(2),
    date: today,
    invoiceNumber: invoice.invoiceNumber ?? '',
    dueDate: invoice.dueDate?.slice(0, 10) ?? '',
    notes: invoice.notes ?? '',
    status: 'pending',
  }));
  const [form, setForm] = useState<ConvertFormState>(initialForm);
  const [lines, setLines] = useState<ConvertLines>(() =>
    initialLines(rows, offerAmount, initialForm.amount),
  );
  const [touched, setTouched] = useState<ReadonlySet<ConvertField>>(() => new Set());
  // Fields that hold saved offer data: AI values are suggested there, never applied.
  const [protectedFields] = useState<ReadonlySet<ConvertField>>(() => {
    const fields = new Set<ConvertField>();
    if (initialForm.notes.trim()) fields.add('notes');
    if (initialForm.invoiceNumber.trim()) fields.add('invoiceNumber');
    return fields;
  });
  const [suggestions, setSuggestions] = useState<ConvertCandidates>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deposits, setDeposits] = useState<readonly InvoiceDeposit[]>(invoice.deposits);
  const [recordedRefund, setRecordedRefund] = useState<number | null>(null);
  const [proposalAnnouncement, setProposalAnnouncement] = useState('');

  // The latest form for the AI apply/suggest split, which runs after an await.
  const formRef = useRef(form);
  // Fields the user has typed into; an AI value never overwrites one.
  const editedRef = useRef(new Set<ConvertField>());
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    formRef.current = form;
  }, [form]);
  useEffect(
    () => () => {
      if (announceTimerRef.current !== null) clearTimeout(announceTimerRef.current);
    },
    [],
  );

  // ---- Derived values -----------------------------------------------------

  const parsedAmount = parseAmount(form.amount);
  const finalAmount = parsedAmount !== null && parsedAmount > 0 ? parsedAmount : null;
  const delta: AmountDelta = computeDelta(offerAmount, finalAmount ?? offerAmount);

  const offeredTotal = fromCents(rows.reduce((sum, row) => sum + toCents(row.gross), 0));
  const proposedCents = proposedTotalCents(lines);
  const proposedTotal = fromCents(proposedCents);
  const remainderCents = finalAmount === null ? 0 : toCents(finalAmount) - proposedCents;
  const remainder = fromCents(remainderCents);
  const remainderKind: RemainderState = remainderState(remainderCents);
  const invalidKeys = invalidLineKeys(lines);
  const groupProposedTotals = new Map<string, number>(
    groups.map((group) => [
      group.id,
      fromCents(
        proposedTotalCents(
          lines,
          group.rows.map((row) => lineKey(row)),
        ),
      ),
    ]),
  );
  const keptCount = [...lines.values()].filter((line) => line.keep).length;
  const allKept = lines.size > 0 && keptCount === lines.size;
  const someKept = keptCount > 0 && !allKept;

  const depositTotals: DepositTotals = computeDepositTotals([...deposits]);
  const finalPayment = computeFinalPayment(finalAmount ?? 0, [...deposits]);
  const shortfall = finalAmount === null ? 0 : computeShortfall(finalAmount, [...deposits]);

  const fieldErrors: Partial<Record<FieldErrorKey, string>> = {};
  if (form.amount.trim() === '' || parsedAmount === null) {
    fieldErrors.amount = t('convertPage.details.errors.amountRequired');
  } else if (parsedAmount <= 0) {
    fieldErrors.amount = t('convertPage.details.errors.amountPositive');
  }
  if (!form.date) fieldErrors.date = t('convertPage.details.errors.dateRequired');
  if (form.dueDate && form.date && form.dueDate < form.date) {
    fieldErrors.dueDate = t('convertPage.details.errors.dueDateBeforeDate');
  }

  const visibleFieldErrors: Partial<Record<FieldErrorKey, string>> = {};
  for (const key of ['amount', 'date', 'dueDate'] as const) {
    const message = fieldErrors[key];
    // The due date rule is cross-field and can be broken on arrival or after an AI pre-fill,
    // so its error is visible without a blur or a submit.
    if (message && (key === 'dueDate' || submitAttempted || touched.has(key))) {
      visibleFieldErrors[key] = message;
    }
  }

  // A refund due is advisory (#2188): it is never a problem.
  const problems: ConvertProblem[] = [];
  for (const key of ['amount', 'date', 'dueDate'] as const) {
    const message = fieldErrors[key];
    if (message) problems.push({ id: key, message });
  }
  if (invalidKeys.size > 0) problems.push({ id: 'lines', message: t('convertPage.blocked.lines') });
  if (remainderKind === 'over') {
    problems.push({ id: 'over', message: t('convertPage.blocked.over') });
  }

  const isFormDirty =
    form.amount !== initialForm.amount ||
    form.date !== initialForm.date ||
    form.invoiceNumber !== initialForm.invoiceNumber ||
    form.dueDate !== initialForm.dueDate ||
    form.notes !== initialForm.notes ||
    form.status !== initialForm.status ||
    [...lines.values()].some((line) => line.edited || line.keep);

  // ---- Handlers -----------------------------------------------------------

  /** A field the user has left: its error may show. */
  const markTouched = (field: ConvertField) => {
    if (touched.has(field)) return;
    setTouched(new Set(touched).add(field));
  };

  const announceProposal = (amountInput: string) => {
    if (announceTimerRef.current !== null) clearTimeout(announceTimerRef.current);
    setProposalAnnouncement('');
    const parsed = parseAmount(amountInput);
    if (parsed === null || parsed <= 0) return;
    announceTimerRef.current = setTimeout(
      () => setProposalAnnouncement(t('convertPage.lines.updated')),
      ANNOUNCE_DELAY_MS,
    );
  };

  const setField = (field: ConvertField, value: string) => {
    editedRef.current.add(field);
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === 'amount') {
      setLines((prev) => applyProposal(prev, offerAmount, value));
      announceProposal(value);
    }
    // A manual edit supersedes a pending suggestion for the field.
    setSuggestions((prev) => {
      if (prev[field] === undefined) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const setStatus = (status: ConvertTargetStatus) => setForm((prev) => ({ ...prev, status }));

  const setLineProposed = (key: string, value: string) => {
    setLines((prev) =>
      new Map(prev).set(key, { ...prev.get(key)!, proposed: value, edited: true }),
    );
  };

  const setLineKeep = (key: string, keep: boolean) => {
    setLines((prev) => {
      const line = prev.get(key)!;
      const next = new Map(prev).set(key, { ...line, keep, edited: keep ? line.edited : false });
      return keep ? next : applyProposal(next, offerAmount, form.amount);
    });
  };

  const setAllKept = (keep: boolean) => {
    setLines((prev) => {
      const next = new Map<string, ConvertLineState>();
      for (const [key, line] of prev) {
        next.set(key, { ...line, keep, edited: keep ? line.edited : false });
      }
      return keep ? next : applyProposal(next, offerAmount, form.amount);
    });
  };

  const resetProposal = () => {
    setLines((prev) => {
      const next = new Map<string, ConvertLineState>();
      for (const [key, line] of prev) next.set(key, { ...line, edited: false });
      return applyProposal(next, offerAmount, form.amount);
    });
  };

  /** Applies what the document reader found; touched or saved fields get a suggestion instead. */
  const applyCandidates = (candidates: ConvertCandidates) => {
    const applied: ConvertCandidates = {};
    const suggested: ConvertCandidates = {};
    for (const field of Object.keys(candidates) as ConvertField[]) {
      const value = candidates[field]!;
      if (value === formRef.current[field]) continue;
      if (editedRef.current.has(field) || protectedFields.has(field)) suggested[field] = value;
      else applied[field] = value;
    }
    if (Object.keys(applied).length > 0) setForm((prev) => ({ ...prev, ...applied }));
    if (applied.amount !== undefined) {
      const amountInput = applied.amount;
      setLines((prev) => applyProposal(prev, offerAmount, amountInput));
      announceProposal(amountInput);
    }
    setSuggestions(suggested);
  };

  const applySuggestion = (field: ConvertField) => {
    const value = suggestions[field];
    if (value !== undefined) setField(field, value);
  };

  // ---- Refund -------------------------------------------------------------

  const refundPreset = {
    entryType: 'refund' as const,
    status: 'pending' as const,
    amount: shortfall.toFixed(2),
    dueDate: today,
    budgetSourceId: defaultRefundSourceId([...deposits]),
    description: t('convertPage.refund.description'),
  };

  /** Records the saved refund and refreshes the progress payments; a failed refresh keeps them. */
  const onRefundSaved = async (deposit: InvoiceDeposit) => {
    setRecordedRefund(deposit.amount);
    try {
      const fresh = await fetchInvoiceById(invoice.id);
      setDeposits(fresh.deposits);
    } catch {
      // The Refund due block stays until a later refresh succeeds.
    }
  };

  // ---- Submit -------------------------------------------------------------

  const submit = async (paperlessDocumentId?: number): Promise<ConvertOutcome> => {
    setSubmitAttempted(true);
    if (problems.length > 0 || isSaving) return 'blocked';

    const body: ConvertQuotationRequest = {
      amount: fromCents(toCents(finalAmount!)),
      date: form.date,
      invoiceNumber: form.invoiceNumber.trim() || null,
      dueDate: form.dueDate || null,
      notes: form.notes.trim() || null,
      status: form.status,
      conversionNote: t('convertPage.history.converted', {
        amount: formatCurrency(offerAmount),
        date: formatDate(today),
      }),
      budgetLines: lineUpdates(lines),
      ...(paperlessDocumentId !== undefined ? { paperlessDocumentId } : {}),
    };

    setIsSaving(true);
    setSaveError('');
    try {
      await convertQuotation(invoice.id, body);
      return 'converted';
    } catch (err) {
      if (err instanceof ApiClientError) {
        const code = err.error.code;
        if (code === 'INVOICE_NOT_QUOTATION') return 'notOffer';
        setSaveError(
          code === 'ITEMIZED_SUM_EXCEEDS_INVOICE'
            ? t('convertPage.errors.itemizedExceeds')
            : translateApiError(code, tErrors),
        );
      } else {
        setSaveError(t('convertPage.errors.saveFailed'));
      }
      return 'failed';
    } finally {
      setIsSaving(false);
    }
  };

  return {
    form,
    setField,
    setStatus,
    markTouched,
    lines,
    setLineProposed,
    setLineKeep,
    setAllKept,
    resetProposal,
    allKept,
    someKept,
    applyCandidates,
    applySuggestion,
    suggestions,
    offerAmount,
    finalAmount,
    delta,
    offeredTotal,
    proposedTotal,
    groupProposedTotals,
    remainder,
    remainderState: remainderKind,
    invalidKeys,
    deposits,
    depositTotals,
    finalPayment,
    shortfall,
    refundPreset,
    recordedRefund,
    onRefundSaved,
    visibleFieldErrors,
    problems,
    submitAttempted,
    isFormDirty,
    isSaving,
    saveError,
    submit,
    proposalAnnouncement,
    today,
  };
}

export type UseConvertOffer = ReturnType<typeof useConvertOffer>;
