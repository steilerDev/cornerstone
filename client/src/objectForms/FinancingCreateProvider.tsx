import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObjectForm } from '../components/ObjectForm/ObjectForm.js';
import type { ObjectFormResult, ObjectFormSchema } from '../components/ObjectForm/types.js';
import { useAuth } from '../contexts/AuthContext.js';
import { focusPageHeadingWhenReady } from '../lib/focusPageHeading.js';
import { originStateFor } from '../navigation/origin.js';
import type { OriginState } from '../navigation/origin.js';
import { useRealLocation } from '../navigation/realLocation.js';
import { FinancingCreateContext } from './financingCreateContext.js';
import type { FinancingCreateRequest, OpenFinancingForm } from './financingCreateContext.js';
import { useFundingSourceFormSchema } from './fundingSourceForm.js';
import { useGrantFormSchema } from './grantForm.js';

interface Background {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
}

interface OpenRequest {
  readonly request: FinancingCreateRequest;
  /** The page behind the dialog; the request is closed once the pathname differs. */
  readonly background: Background;
  readonly seq: number;
}

interface FinancingDialogProps {
  readonly request: FinancingCreateRequest;
  readonly background: Background;
  readonly onClose: () => void;
}

interface FinancingFormDialogProps extends FinancingDialogProps {
  readonly schema: ObjectFormSchema;
  readonly testId: string;
}

function FinancingFormDialog({
  schema,
  testId,
  request,
  background,
  onClose,
}: FinancingFormDialogProps) {
  const navigate = useNavigate();
  const originState: OriginState = request.originState ?? originStateFor(background);
  return (
    <ObjectForm
      schema={schema}
      returnFocusRef={request.returnFocusRef}
      testId={testId}
      onCreated={(result: ObjectFormResult) => {
        onClose();
        void navigate(result.href, { state: originState });
        // The destination renders after this; its heading takes focus once it exists.
        focusPageHeadingWhenReady();
      }}
      onCancel={onClose}
    />
  );
}

function SourceDialog(props: FinancingDialogProps) {
  const schema = useFundingSourceFormSchema();
  return <FinancingFormDialog {...props} schema={schema} testId="source-form" />;
}

function GrantDialog(props: FinancingDialogProps) {
  const schema = useGrantFormSchema();
  return <FinancingFormDialog {...props} schema={schema} testId="grant-form" />;
}

/**
 * Lets any page open the New funding source / New grant form in place (a dialog over the page)
 * through `useOpenFinancingForm`. Imported only by `App.tsx`: pages never import ObjectForm for
 * it. After Save it navigates to the new object; Add another stays in the dialog.
 */
export function FinancingCreateProvider({ children }: { readonly children: ReactNode }) {
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
  const open = useCallback<OpenFinancingForm>((request) => {
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

  const Dialog = current?.request.kind === 'grant' ? GrantDialog : SourceDialog;

  return (
    <FinancingCreateContext value={open}>
      {children}
      {user && current && (
        <Dialog
          key={current.seq}
          request={current.request}
          background={current.background}
          onClose={close}
        />
      )}
    </FinancingCreateContext>
  );
}

export default FinancingCreateProvider;
