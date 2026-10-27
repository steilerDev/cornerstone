import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObjectForm } from '../components/ObjectForm/ObjectForm.js';
import { useAuth } from '../contexts/AuthContext.js';
import { focusPageHeadingWhenReady } from '../lib/focusPageHeading.js';
import { originStateFor } from '../navigation/origin.js';
import { useRealLocation } from '../navigation/realLocation.js';
import { InvoiceCreateContext } from './invoiceCreateContext.js';
import type { InvoiceCreateRequest, OpenInvoiceForm } from './invoiceCreateContext.js';
import { invoiceFormPrefill, useInvoiceFormSchema } from './invoiceForm.js';

interface Background {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
}

interface OpenRequest {
  readonly request: InvoiceCreateRequest;
  /** The page behind the dialog; the request is closed once the pathname differs. */
  readonly background: Background;
  readonly seq: number;
}

interface InvoiceCreateDialogProps {
  readonly request: InvoiceCreateRequest;
  readonly background: Background;
  readonly onClose: () => void;
}

function InvoiceCreateDialog({ request, background, onClose }: InvoiceCreateDialogProps) {
  const schema = useInvoiceFormSchema({ mode: 'create', request });
  const [prefill] = useState(() => invoiceFormPrefill(request));
  const navigate = useNavigate();
  return (
    <ObjectForm
      schema={schema}
      prefill={prefill}
      returnFocusRef={request.returnFocusRef}
      testId="invoice-form"
      onCreated={(result) => {
        onClose();
        void navigate(result.href, { state: request.originState ?? originStateFor(background) });
        // The destination renders after this; its heading takes focus once it exists.
        focusPageHeadingWhenReady();
      }}
      onCancel={onClose}
    />
  );
}

/**
 * Lets any page open the New invoice / New offer form in place (a dialog over the page) through
 * `useOpenInvoiceForm`. Imported only by `App.tsx`: pages never import ObjectForm for it. After
 * Save it navigates to the new invoice; Add another stays in the dialog.
 */
export function InvoiceCreateProvider({ children }: { readonly children: ReactNode }) {
  const { user } = useAuth();
  const location = useRealLocation();
  const { pathname } = location;
  const locationRef = useRef(location);
  locationRef.current = location;
  const seqRef = useRef(0);
  const [current, setCurrent] = useState<OpenRequest | null>(null);

  // Leaving the page (Back, a link) closes the dialog: dropped during render, so no frame shows
  // the form over a page it was not opened on.
  if (current !== null && current.background.pathname !== pathname) setCurrent(null);

  // One request at a time: a second open while the dialog is up is ignored.
  const open = useCallback<OpenInvoiceForm>((request) => {
    seqRef.current += 1;
    const { pathname: path, search, hash } = locationRef.current;
    const next: OpenRequest = {
      request,
      background: { pathname: path, search, hash },
      seq: seqRef.current,
    };
    setCurrent((prev) => prev ?? next);
  }, []);
  const close = useCallback(() => setCurrent(null), []);

  return (
    <InvoiceCreateContext value={open}>
      {children}
      {user && current && (
        <InvoiceCreateDialog
          key={current.seq}
          request={current.request}
          background={current.background}
          onClose={close}
        />
      )}
    </InvoiceCreateContext>
  );
}

export default InvoiceCreateProvider;
