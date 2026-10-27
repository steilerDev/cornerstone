import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import { EntityPicker } from '../components/EntityPicker/EntityPicker.js';
import { FormError } from '../components/FormError/FormError.js';
import type { ObjectFormRenderContext, ObjectFormValues } from '../components/ObjectForm/types.js';
import type { DocumentIntegration } from '../hooks/useDocumentIntegration.js';
import { findCompanyByName } from '../lib/companyMatch.js';
import { getPaperlessDocument } from '../lib/paperlessApi.js';
import { NavAnchor } from '../navigation/NavAnchor.js';
import { useOriginState } from '../navigation/useOriginState.js';
import styles from './objectForms.module.css';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface PickedDocument {
  readonly id: number;
  readonly title: string;
  readonly correspondent: string | null;
  readonly created: string | null;
}

export interface InvoiceDocumentFieldProps {
  readonly ctx: ObjectFormRenderContext;
  readonly integration: DocumentIntegration;
  /** A document from the URL (`?documentId=`), applied once Paperless is available. */
  readonly pendingDocumentId?: number;
  /** Called when the pending document has been taken up (the host then forgets it). */
  readonly onPendingConsumed: () => void;
  /** The generated default date: only this (or an empty date) is replaced by the document's. */
  readonly defaultDate: string;
  /** Title of the picked document (the host keeps it across child steps). */
  readonly label: string;
  readonly onPicked: (title: string) => void;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * The "Start from a document" control of the New invoice form: a Paperless document picker that
 * pre-fills company, date and notes, and (with the AI reader on) a link to the document review.
 */
export function InvoiceDocumentField({
  ctx,
  integration,
  pendingDocumentId,
  onPendingConsumed,
  defaultDate,
  label,
  onPicked,
}: InvoiceDocumentFieldProps) {
  const { t } = useTranslation('budget');
  const originState = useOriginState();
  const [loadFailed, setLoadFailed] = useState(false);
  // Invalidates a pending apply when the document changes or the field goes away.
  const sessionRef = useRef(0);
  // The values as of the latest render: an apply finishes after an await.
  const valuesRef = useRef<ObjectFormValues>(ctx.values);
  useEffect(() => {
    valuesRef.current = ctx.values;
  });
  useEffect(
    () => () => {
      sessionRef.current += 1;
    },
    [],
  );

  const apply = async (doc: PickedDocument) => {
    sessionRef.current += 1;
    const session = sessionRef.current;
    setLoadFailed(false);
    ctx.setValue(String(doc.id));
    onPicked(doc.title);
    const company = doc.correspondent ? await findCompanyByName(doc.correspondent) : null;
    if (sessionRef.current !== session) return;
    const current = valuesRef.current;
    const patch: Record<string, unknown> = {};
    if (company && !text(current.vendorId)) patch.vendorId = company.id;
    if (doc.created && ISO_DATE.test(doc.created)) {
      const date = text(current.date);
      if (!date || date === defaultDate) patch.date = doc.created;
    }
    if (!text(current.notes)) patch.notes = doc.title;
    ctx.setValues(patch, t('invoiceForm.document.filled', { title: doc.title }));
  };

  const startPending = useEffectEvent((id: number) => {
    onPendingConsumed();
    // A late answer (the field unmounted, or another document was picked) must not write.
    const session = sessionRef.current;
    void getPaperlessDocument(id).then(
      ({ document: doc }) => {
        if (sessionRef.current !== session) return;
        return apply({
          id: doc.id,
          title: doc.title,
          correspondent: doc.correspondent,
          created: doc.created,
        });
      },
      () => {
        if (sessionRef.current === session) setLoadFailed(true);
      },
    );
  });
  useEffect(() => {
    if (integration.available && pendingDocumentId !== undefined) startPending(pendingDocumentId);
  }, [integration.available, pendingDocumentId]);

  const value = text(ctx.value);

  return (
    <>
      <EntityPicker
        kind="document"
        id={ctx.id}
        value={value}
        selectedLabel={label || undefined}
        disabled={ctx.busy}
        inputAriaProps={{
          'aria-invalid': ctx.invalid || undefined,
          'aria-describedby': ctx.describedBy,
        }}
        onChange={(next, option) => {
          if (next === '') {
            sessionRef.current += 1;
            onPicked('');
            ctx.setValue('');
            return;
          }
          void apply({ id: Number(next), ...option!.document! });
        }}
      />
      <FormError
        variant="field"
        message={loadFailed ? t('invoiceForm.document.loadError') : undefined}
      />
      {integration.llmEnabled && value !== '' && (
        <>
          <NavAnchor
            to={routeUrl('invoicePaperlessReview', undefined, { documentId: value })}
            state={originState}
            className={styles.aiLink}
            data-testid="invoice-form-read-ai"
          >
            {t('invoiceForm.document.readWithAi')}
          </NavAnchor>
          <p className={styles.aiHint}>{t('invoiceForm.document.readWithAiHint')}</p>
        </>
      )}
    </>
  );
}
