import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Vendor, CreateVendorRequest } from '@cornerstone/shared';
import { FormError } from '../FormError/FormError.js';
import { Modal } from '../Modal/Modal.js';
import { TradePicker } from '../TradePicker/TradePicker.js';
import { useTrades } from '../../hooks/useTrades.js';
import { createVendor } from '../../lib/vendorsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './VendorCreateModal.module.css';

const NAME_MAX_LENGTH = 200;

export interface VendorCreateModalProps {
  /** Prefill for the name field (truncated to 200). Empty/undefined -> empty field. */
  initialName?: string;
  /** Called with the created vendor. Parent must unmount the modal; do NOT also call onClose. */
  onCreated: (vendor: Vendor) => void;
  /** Cancel / Escape / backdrop / x. Ignored while the create request is in flight. */
  onClose: () => void;
}

export function VendorCreateModal({ initialName, onCreated, onClose }: VendorCreateModalProps) {
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const { trades } = useTrades();

  const [form, setForm] = useState<CreateVendorRequest>({
    name: (initialName ?? '').slice(0, NAME_MAX_LENGTH),
    phone: '',
    email: '',
    address: '',
    notes: '',
    tradeId: null,
  });
  const [isCreating, setIsCreating] = useState(false);
  const [apiError, setApiError] = useState('');
  const [nameError, setNameError] = useState('');

  const formRef = useRef<HTMLFormElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const caretPlacedRef = useRef(false);

  const handleClose = () => {
    if (!isCreating) onClose();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setApiError('');
    setNameError('');

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setNameError(t('vendors.validation.nameRequired'));
      return;
    }
    if (trimmedName.length > NAME_MAX_LENGTH) {
      setNameError(t('vendors.validation.nameTooLong'));
      return;
    }

    setIsCreating(true);
    try {
      const vendor = await createVendor({
        name: trimmedName,
        phone: form.phone?.trim() || null,
        email: form.email?.trim() || null,
        address: form.address?.trim() || null,
        notes: form.notes?.trim() || null,
        tradeId: form.tradeId || null,
      });
      onCreated(vendor);
    } catch (err) {
      setApiError(
        err instanceof ApiClientError
          ? translateApiError(err.error.code, tErrors)
          : t('vendors.messages.createError'),
      );
      setIsCreating(false);
    }
  };

  return (
    <Modal
      title={t('vendors.modal.title')}
      onClose={handleClose}
      initialFocusRef={nameInputRef}
      footer={
        <>
          <button
            type="button"
            className={sharedStyles.btnSecondary}
            onClick={handleClose}
            disabled={isCreating}
          >
            {t('vendors.buttons.cancel')}
          </button>
          <button
            type="button"
            className={sharedStyles.btnPrimary}
            onClick={() => formRef.current?.requestSubmit()}
            disabled={isCreating || !form.name.trim()}
          >
            {isCreating ? t('vendors.buttons.creating') : t('vendors.buttons.create')}
          </button>
        </>
      }
    >
      <p>{t('vendors.modal.description')}</p>

      <FormError variant="banner" message={apiError} />

      <form onSubmit={(e) => void handleSubmit(e)} className={styles.form} noValidate ref={formRef}>
        <div className={styles.field}>
          <label htmlFor="vendor-name" className={styles.label}>
            {t('vendors.form.name')}{' '}
            <span className={styles.required}>{t('vendors.form.required')}</span>
          </label>
          <input
            type="text"
            id="vendor-name"
            ref={nameInputRef}
            value={form.name}
            onChange={(e) => {
              setForm({ ...form, name: e.target.value });
              if (nameError) setNameError('');
            }}
            onFocus={(e) => {
              if (caretPlacedRef.current) return;
              caretPlacedRef.current = true;
              const len = e.currentTarget.value.length;
              e.currentTarget.setSelectionRange(len, len);
            }}
            className={styles.input}
            placeholder={t('vendors.form.placeholders.name')}
            maxLength={NAME_MAX_LENGTH}
            disabled={isCreating}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? 'vendor-name-error' : undefined}
          />
          <div id="vendor-name-error">
            <FormError variant="field" message={nameError} />
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.fieldGrow}>
            <label htmlFor="vendor-phone" className={styles.label}>
              {t('vendors.form.phone')}
            </label>
            <input
              type="tel"
              id="vendor-phone"
              value={form.phone ?? ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={styles.input}
              placeholder={t('vendors.form.placeholders.phone')}
              maxLength={50}
              disabled={isCreating}
            />
          </div>
          <div className={styles.fieldGrow}>
            <label htmlFor="vendor-email" className={styles.label}>
              {t('vendors.form.email')}
            </label>
            <input
              type="email"
              id="vendor-email"
              value={form.email ?? ''}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={styles.input}
              placeholder={t('vendors.form.placeholders.email')}
              maxLength={255}
              disabled={isCreating}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="vendor-address" className={styles.label}>
            {t('vendors.form.address')}
          </label>
          <input
            type="text"
            id="vendor-address"
            value={form.address ?? ''}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className={styles.input}
            placeholder={t('vendors.form.placeholders.address')}
            maxLength={500}
            disabled={isCreating}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="vendor-notes" className={styles.label}>
            {t('vendors.form.notes')}
          </label>
          <textarea
            id="vendor-notes"
            value={form.notes ?? ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className={styles.textarea}
            placeholder={t('vendors.form.placeholders.notes')}
            rows={3}
            maxLength={10000}
            disabled={isCreating}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="vendor-trade" className={styles.label}>
            {t('vendors.form.trade')}
          </label>
          <TradePicker
            trades={trades}
            value={form.tradeId ?? ''}
            onChange={(tradeId) => setForm({ ...form, tradeId })}
            disabled={isCreating}
            placeholder={t('vendors.form.placeholders.trade')}
          />
        </div>
      </form>
    </Modal>
  );
}
