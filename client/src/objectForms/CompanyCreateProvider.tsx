import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ObjectForm } from '../components/ObjectForm/ObjectForm.js';
import { useAuth } from '../contexts/AuthContext.js';
import { CompanyCreateContext } from './companyCreateContext.js';
import type { RequestCompanyCreate } from './companyCreateContext.js';
import { useCompanyFormSchema } from './companyForm.js';
import type { CompanyOption } from './companyForm.js';

interface PendingRequest {
  readonly name: string;
  readonly resolve: (company: CompanyOption | null) => void;
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
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const pendingRef = useRef<PendingRequest | null>(null);

  const finish = useCallback((company: CompanyOption | null) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(company);
  }, []);

  const request = useCallback<RequestCompanyCreate>((name) => {
    if (pendingRef.current !== null) return Promise.resolve(null);
    return new Promise<CompanyOption | null>((resolve) => {
      const next: PendingRequest = { name, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  return (
    <CompanyCreateContext value={request}>
      {children}
      {user && pending && (
        <CompanyCreateDialog key={pending.name} name={pending.name} onFinish={finish} />
      )}
    </CompanyCreateContext>
  );
}

export default CompanyCreateProvider;
