import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCreateQuery } from '../../hooks/useCreateQuery.js';
import type { CreateRequest } from '../../hooks/useCreateQuery.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { hasCreateOpener } from '../../navigation/dialogRoutes.js';
import type { InvoiceFormKind } from '../../objectForms/invoiceCreateContext.js';
import { useOpenInvoiceForm } from '../../objectForms/useOpenInvoiceForm.js';

export interface InvoiceCreateFlow {
  /** Opens the New invoice / New offer dialog (the kind defaults to the list's chip). */
  readonly open: (kind?: InvoiceFormKind) => void;
}

/**
 * The Invoices create flow: `?create=1` (New menu, dashboard shortcut, the Paperless-off and AI-off
 * redirects) and the `n` shortcut open the New invoice / New offer dialog in place; the dialog
 * itself lives in `InvoiceCreateProvider`.
 */
export function useInvoiceCreate({
  defaultKind,
}: {
  readonly defaultKind: InvoiceFormKind;
}): InvoiceCreateFlow {
  const { t: tCommon } = useTranslation('common');
  const openForm = useOpenInvoiceForm();
  const location = useLocation();
  const defaultKindRef = useRef(defaultKind);
  useEffect(() => {
    defaultKindRef.current = defaultKind;
  });

  const open = (kind: InvoiceFormKind = defaultKindRef.current) => openForm?.({ kind });

  useCreateQuery({
    prefillKeys: ['companyId', 'documentId'],
    onOpen: (request: CreateRequest) => {
      const { companyId, documentId } = request.prefill;
      openForm?.({
        kind: request.kind === 'offer' ? 'offer' : 'invoice',
        ...(companyId ? { company: { id: companyId } } : {}),
        ...(documentId ? { documentId: Number(documentId) } : {}),
        // The New menu trigger takes focus back when the opener is gone; read before the replace.
        ...(hasCreateOpener(location.state)
          ? {
              returnFocusRef: {
                current: document.querySelector<HTMLElement>('[data-create-trigger]'),
              },
            }
          : {}),
      });
    },
  });

  // `n` creates like the primary button (read at press time).
  const openRef = useRef(open);
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

  return { open };
}
