import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ObjectForm } from '../components/ObjectForm/ObjectForm.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useRealLocation } from '../navigation/realLocation.js';
import { CompanyCreateContext } from './companyCreateContext.js';
import type { RequestCompanyCreate } from './companyCreateContext.js';
import { useCompanyFormSchema } from './companyForm.js';
import type { CompanyOption } from './companyForm.js';

interface PendingRequest {
  readonly name: string;
  /** Where the picker lives; the request is closed once the pathname differs. */
  readonly pathname: string;
  settled: boolean;
  readonly settle: (company: CompanyOption | null) => void;
}

interface CompanyCreateDialogProps {
  readonly name: string;
  readonly onFinish: (company: CompanyOption | null) => void;
}

function CompanyCreateDialog({ name, onFinish }: CompanyCreateDialogProps) {
  const schema = useCompanyFormSchema();
  const [prefill] = useState(() => ({ name }));
  return (
    <ObjectForm
      schema={schema}
      prefill={prefill}
      onCreated={(result) => onFinish({ id: result.id, name: result.label })}
      onCancel={() => onFinish(null)}
      testId="company-create-form"
    />
  );
}

/**
 * Lets a company picker anywhere in the app open the New company form in place (a dialog over
 * the page) and get the created company back. Imported only by `App.tsx`: pages use the
 * `useCompanyCreateAction` hook, which never imports ObjectForm. It never navigates.
 */
export function CompanyCreateProvider({ children }: { readonly children: ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useRealLocation();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const pendingRef = useRef<PendingRequest | null>(null);

  // Closing from the form itself (Save, Cancel).
  const finish = useCallback((company: CompanyOption | null) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.settle(company);
  }, []);

  // Leaving the page (Back, a link) unmounts the picker that asked, so the request is closed:
  // it is derived as closed during render (its pathname no longer matches) and settled with null
  // here, so Save cannot create an orphan. The pathname is compared, not the key: a query
  // `replace` keeps the picker mounted.
  const departed = pending !== null && pending.pathname !== pathname;
  useEffect(() => {
    if (!departed) return;
    const current = pendingRef.current;
    pendingRef.current = null;
    current?.settle(null);
  }, [departed]);

  const request = useCallback<RequestCompanyCreate>((name) => {
    if (pendingRef.current !== null) return Promise.resolve(null);
    return new Promise<CompanyOption | null>((resolve) => {
      const next: PendingRequest = {
        name,
        pathname: pathnameRef.current,
        settled: false,
        settle: (company) => {
          next.settled = true;
          resolve(company);
        },
      };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const open = pending !== null && !pending.settled && pending.pathname === pathname;

  return (
    <CompanyCreateContext value={request}>
      {children}
      {user && open && (
        <CompanyCreateDialog key={pending.name} name={pending.name} onFinish={finish} />
      )}
    </CompanyCreateContext>
  );
}

export default CompanyCreateProvider;
