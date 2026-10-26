import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  CreateInvoiceRequest,
  InvoiceStatus,
  PaperlessDocumentSearchResult,
  PaperlessStatusResponse,
} from '@cornerstone/shared';
import { INVOICE_STATUSES, routeUrl } from '@cornerstone/shared';
import { Modal } from '../../components/Modal/Modal.js';
import { EntityPicker } from '../../components/EntityPicker/EntityPicker.js';
import { InvoicePaperlessPickerModal } from '../../components/invoices/InvoicePaperlessPickerModal.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useCreateQuery } from '../../hooks/useCreateQuery.js';
import type { CreateRequest } from '../../hooks/useCreateQuery.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { fetchConfig } from '../../lib/configApi.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { createInvoice } from '../../lib/invoicesApi.js';
import { getPaperlessStatus } from '../../lib/paperlessApi.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './useInvoiceCreate.module.css';

interface IntegrationStatus {
  paperless: PaperlessStatusResponse | null;
  autoItemizeEnabled: boolean | null;
}

interface InvoiceFormState {
  vendorId: string;
  invoiceNumber: string;
  amount: string;
  date: string;
  dueDate: string;
  status: InvoiceStatus;
  notes: string;
}

const EMPTY_FORM: InvoiceFormState = {
  vendorId: '',
  invoiceNumber: '',
  amount: '',
  date: '',
  dueDate: '',
  status: 'pending',
  notes: '',
};

export interface InvoiceCreateFlow {
  /** Opens the Paperless picker or the manual modal; before the status load settles, opens once it does. */
  readonly open: () => void;
  /** True once Paperless is configured, false when it is not, null while the status is unknown. */
  readonly paperlessConfigured: boolean | null;
  /** The dialogs to render once (picker + manual modal). */
  readonly dialogs: ReactNode;
}

/**
 * The Invoices create flow: the integration-status load, `?create=1` (New menu, dashboard
 * shortcut), the `n` shortcut, the Paperless document picker and the manual create modal.
 */
export function useInvoiceCreate(options: { readonly onCreated: () => void }): InvoiceCreateFlow {
  const { t } = useTranslation('budget');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const navigate = useNavigate();
  const originState = useOriginState();
  const statusVariants = useStatusBadgeVariants();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<InvoiceFormState>(EMPTY_FORM);
  const [isCreating, setIsCreating] = useState(false);
  // The New company form stacks over the create modal, which stays put meanwhile.
  const [isCreatingCompany, setIsCreatingCompany] = useState(false);
  const [isResolvingCompany, setIsResolvingCompany] = useState(false);
  const [createError, setCreateError] = useState<string>('');

  // Set only when Paperless is configured, so the picker always has its status at hand.
  const [paperlessPicker, setPaperlessPicker] = useState<{ paperlessUrl: string | null } | null>(
    null,
  );
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus>({
    paperless: null,
    autoItemizeEnabled: null,
  });
  // True once the status load settled, on success AND failure (a failed load leaves
  // paperless === null but autoItemizeEnabled === false, i.e. "manual modal").
  const integrationReady = integrationStatus.autoItemizeEnabled !== null;
  // A press of the primary (or `n`) before the status load settled: opens once it does.
  const openWhenReadyRef = useRef(false);
  // Preset of the last create request (Offer kind, pre-selected company), reused by the manual-entry
  // fallback of the Paperless picker.
  const createRequestRef = useRef<CreateRequest | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const presetCreateForm = (request: CreateRequest | null): InvoiceFormState => ({
    ...EMPTY_FORM,
    status: request?.kind === 'offer' ? 'quotation' : 'pending',
    // Never dropped here: the lookup effect keeps (found) or clears (failed) a pre-filled company.
    vendorId: request?.prefill.companyId ?? '',
  });

  const openCreateModalFor = (status: IntegrationStatus, request: CreateRequest | null = null) => {
    createRequestRef.current = request;
    // If Paperless and auto-itemize are both configured, open the picker modal
    if (status.paperless?.configured && status.paperless.reachable && status.autoItemizeEnabled) {
      setPaperlessPicker({ paperlessUrl: status.paperless.paperlessUrl });
    } else {
      // Otherwise open the manual create modal
      setCreateForm(presetCreateForm(request));
      setCreateError('');
      setShowCreateModal(true);
    }
  };

  const open = () => {
    if (integrationReady) openCreateModalFor(integrationStatus);
    else openWhenReadyRef.current = true;
  };

  const openPending = useEffectEvent(() => {
    if (!openWhenReadyRef.current) return;
    openWhenReadyRef.current = false;
    openCreateModalFor(integrationStatus);
  });
  useEffect(() => {
    if (integrationReady) openPending();
  }, [integrationReady]);

  // Resolution handler for the status load (an Effect Event, so the mount-only effect below needs no
  // extra dependencies).
  const onIntegrationStatusResolved = useEffectEvent((status: IntegrationStatus) => {
    setIntegrationStatus(status);
  });

  // `?create=1` (New menu, dashboard shortcut): opens the create flow once the status load settled.
  useCreateQuery({
    ready: integrationReady,
    prefillKeys: ['companyId'],
    onOpen: (request) => openCreateModalFor(integrationStatus, request),
  });

  // Load Paperless and config status on mount
  useEffect(() => {
    let cancelled = false;

    async function loadIntegrationStatus() {
      try {
        const [paperlessStatus, config] = await Promise.all([getPaperlessStatus(), fetchConfig()]);
        if (!cancelled) {
          onIntegrationStatusResolved({
            paperless: paperlessStatus,
            autoItemizeEnabled: config.autoItemizeEnabled,
          });
        }
      } catch {
        if (!cancelled) {
          onIntegrationStatusResolved({
            paperless: null,
            autoItemizeEnabled: false,
          });
        }
      }
    }

    void loadIntegrationStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  // `n` creates like the primary button, including the Paperless-picker gating (read at press time).
  const openRef = useRef<() => void>(open);
  useEffect(() => {
    openRef.current = open;
  });
  const listShortcuts = useMemo(
    () => [
      {
        key: 'n',
        handler: () => openRef.current(),
        description: tCommon('listShortcuts.newInvoice'),
      },
    ],
    [tCommon],
  );
  useKeyboardShortcuts(listShortcuts);

  const handlePaperlessDocumentSelected = (doc: PaperlessDocumentSearchResult) => {
    setPaperlessPicker(null);
    navigate(routeUrl('invoicePaperlessReview', undefined, { documentId: doc.id }), {
      state: originState,
    });
  };

  const handlePaperlessManualEntry = () => {
    setPaperlessPicker(null);
    setCreateForm(presetCreateForm(createRequestRef.current));
    setCreateError('');
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    if (!isCreating) {
      setShowCreateModal(false);
      setCreateError('');
    }
  };

  const handleCreateInvoice = async (event: FormEvent) => {
    event.preventDefault();
    setCreateError('');

    if (!createForm.vendorId) {
      setCreateError(t('invoices.validation.vendorRequired'));
      return;
    }
    const amount = parseFloat(createForm.amount);
    if (isNaN(amount) || amount <= 0) {
      setCreateError(t('invoices.validation.amountRequired'));
      return;
    }
    if (!createForm.date) {
      setCreateError(t('invoices.validation.dateRequired'));
      return;
    }

    setIsCreating(true);

    try {
      const data: CreateInvoiceRequest = {
        invoiceNumber: createForm.invoiceNumber.trim() || null,
        amount,
        date: createForm.date,
        dueDate: createForm.dueDate || null,
        status: createForm.status,
        notes: createForm.notes.trim() || null,
      };
      await createInvoice(createForm.vendorId, data);
      setShowCreateModal(false);
      options.onCreated();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(translateApiError(err.error.code, tErrors));
      } else {
        setCreateError(t('invoices.messages.createError'));
      }
    } finally {
      setIsCreating(false);
    }
  };

  const dialogs = (
    <>
      {paperlessPicker && (
        <InvoicePaperlessPickerModal
          onDocumentSelected={handlePaperlessDocumentSelected}
          onManualEntry={handlePaperlessManualEntry}
          onClose={() => setPaperlessPicker(null)}
          paperlessUrl={paperlessPicker.paperlessUrl}
        />
      )}

      {showCreateModal && (
        <Modal
          title={t('invoices.modal.title')}
          onClose={closeCreateModal}
          dismissible={!isCreatingCompany}
          footer={
            <>
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={closeCreateModal}
                disabled={isCreating}
              >
                {t('invoices.buttons.cancel')}
              </button>
              <button
                type="button"
                className={sharedStyles.btnPrimary}
                onClick={() => formRef.current!.requestSubmit()}
                disabled={
                  isCreating ||
                  isResolvingCompany ||
                  !createForm.vendorId ||
                  !createForm.amount ||
                  !createForm.date
                }
              >
                {isCreating ? t('invoices.buttons.creating') : t('invoices.buttons.create')}
              </button>
            </>
          }
        >
          <p>{t('invoices.modal.description')}</p>

          {createError && (
            <div className={styles.errorBanner} role="alert">
              {createError}
            </div>
          )}

          <form onSubmit={handleCreateInvoice} className={styles.form} noValidate ref={formRef}>
            <div className={styles.field}>
              <label htmlFor="invoice-vendor" className={styles.label}>
                {t('invoices.form.vendor')}{' '}
                <span className={styles.required}>{t('invoices.form.required')}</span>
              </label>
              <EntityPicker
                kind="company"
                id="invoice-vendor"
                value={createForm.vendorId}
                onChange={(id) => setCreateForm((form) => ({ ...form, vendorId: id }))}
                // A pre-selected company that does not exist (404) is dropped, never submitted.
                onUnknownCompany={() => setCreateForm((form) => ({ ...form, vendorId: '' }))}
                onCreatingChange={setIsCreatingCompany}
                onResolvingChange={setIsResolvingCompany}
                disabled={isCreating}
                placeholder={t('invoices.form.placeholders.vendor')}
                inputAriaProps={{ 'aria-required': true }}
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.fieldGrow}>
                <label htmlFor="invoice-number" className={styles.label}>
                  {t('invoices.form.invoiceNumber')}
                </label>
                <input
                  type="text"
                  id="invoice-number"
                  value={createForm.invoiceNumber}
                  onChange={(e) => setCreateForm({ ...createForm, invoiceNumber: e.target.value })}
                  className={styles.input}
                  placeholder={t('invoices.form.placeholders.invoiceNumber')}
                  maxLength={100}
                  disabled={isCreating}
                />
              </div>
              <div className={styles.fieldGrow}>
                <label htmlFor="invoice-amount" className={styles.label}>
                  {t('invoices.form.amount')}{' '}
                  <span className={styles.required}>{t('invoices.form.required')}</span>
                </label>
                <input
                  type="number"
                  id="invoice-amount"
                  value={createForm.amount}
                  onChange={(e) => setCreateForm({ ...createForm, amount: e.target.value })}
                  className={styles.input}
                  min="0.01"
                  step="0.01"
                  required
                  disabled={isCreating}
                  onWheel={(e) => e.currentTarget.blur()}
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.fieldGrow}>
                <label htmlFor="invoice-date" className={styles.label}>
                  {t('invoices.form.invoiceDate')}{' '}
                  <span className={styles.required}>{t('invoices.form.required')}</span>
                </label>
                <input
                  type="date"
                  id="invoice-date"
                  value={createForm.date}
                  onChange={(e) => setCreateForm({ ...createForm, date: e.target.value })}
                  className={styles.input}
                  required
                  disabled={isCreating}
                />
              </div>
              <div className={styles.fieldGrow}>
                <label htmlFor="invoice-due-date" className={styles.label}>
                  {t('invoices.form.dueDate')}
                </label>
                <input
                  type="date"
                  id="invoice-due-date"
                  value={createForm.dueDate}
                  onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.value })}
                  className={styles.input}
                  disabled={isCreating}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="invoice-status" className={styles.label}>
                {t('invoices.form.status')}
              </label>
              <select
                id="invoice-status"
                value={createForm.status}
                onChange={(e) =>
                  setCreateForm({ ...createForm, status: e.target.value as InvoiceStatus })
                }
                className={styles.select}
                disabled={isCreating}
              >
                {INVOICE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {statusVariants.invoice[status].label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="invoice-notes" className={styles.label}>
                {t('invoices.form.notes')}
              </label>
              <textarea
                id="invoice-notes"
                value={createForm.notes}
                onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                className={styles.textarea}
                placeholder={t('invoices.form.placeholders.notes')}
                rows={3}
                disabled={isCreating}
              />
            </div>
          </form>
        </Modal>
      )}
    </>
  );

  return {
    open,
    paperlessConfigured: integrationReady ? integrationStatus.paperless?.configured === true : null,
    dialogs,
  };
}
