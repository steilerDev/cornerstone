import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ObjectForm } from '../components/ObjectForm/ObjectForm.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useAreas } from '../hooks/useAreas.js';
import { useRealLocation } from '../navigation/realLocation.js';
import { useAreaFormSchema } from './areaForm.js';
import { useOrientationFormSchema } from './orientationForm.js';
import { TagCreateContext } from './tagCreateContext.js';
import type { CreatedTag, RequestTagCreate, TagKind } from './tagCreateContext.js';

interface PendingRequest {
  readonly kind: TagKind;
  /** Where the chip lives; the request is closed once the pathname differs. */
  readonly pathname: string;
  readonly returnFocus: HTMLElement | null;
  settled: boolean;
  readonly settle: (tag: CreatedTag | null) => void;
}

interface TagCreateDialogProps {
  readonly returnFocus: HTMLElement | null;
  readonly onFinish: (tag: CreatedTag | null) => void;
}

function AreaCreateDialog({ returnFocus, onFinish }: TagCreateDialogProps) {
  const { areas, isLoading } = useAreas();
  const schema = useAreaFormSchema({ mode: 'new', areas });
  const returnFocusRef = useRef<HTMLElement | null>(returnFocus);
  // The areas are needed for the duplicate check, so the form waits for them.
  if (isLoading) return null;
  return (
    <ObjectForm
      schema={schema}
      onCreated={(result) => onFinish({ id: result.id, name: result.label })}
      onCancel={() => onFinish(null)}
      returnFocusRef={returnFocusRef}
      testId="tag-create-form"
    />
  );
}

function OrientationCreateDialog({ returnFocus, onFinish }: TagCreateDialogProps) {
  const schema = useOrientationFormSchema();
  const returnFocusRef = useRef<HTMLElement | null>(returnFocus);
  return (
    <ObjectForm
      schema={schema}
      onCreated={(result) => onFinish({ id: result.id, name: result.label })}
      onCancel={() => onFinish(null)}
      returnFocusRef={returnFocusRef}
      testId="tag-create-form"
    />
  );
}

/**
 * Lets the capture screen's Area and Orientation chips open New area / New orientation in place
 * (a dialog over the page) and get the created tag back. Imported only by `App.tsx`, so
 * ObjectForm stays out of page closures; pages use `useTagCreate`. It never navigates.
 */
export function TagCreateProvider({ children }: { readonly children: ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useRealLocation();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const pendingRef = useRef<PendingRequest | null>(null);

  const finish = useCallback((tag: CreatedTag | null) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.settle(tag);
  }, []);

  // Leaving the page unmounts the chip that asked, so the request is closed with null.
  const departed = pending !== null && pending.pathname !== pathname;
  useEffect(() => {
    if (!departed) return;
    const current = pendingRef.current;
    pendingRef.current = null;
    current?.settle(null);
  }, [departed]);

  const request = useCallback<RequestTagCreate>((kind, returnFocus) => {
    if (pendingRef.current !== null) return Promise.resolve(null);
    return new Promise<CreatedTag | null>((resolve) => {
      const next: PendingRequest = {
        kind,
        pathname: pathnameRef.current,
        returnFocus: returnFocus ?? null,
        settled: false,
        settle: (tag) => {
          next.settled = true;
          resolve(tag);
        },
      };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const open = pending !== null && !pending.settled && pending.pathname === pathname;

  return (
    <TagCreateContext value={request}>
      {children}
      {user && open && pending.kind === 'area' && (
        <AreaCreateDialog returnFocus={pending.returnFocus} onFinish={finish} />
      )}
      {user && open && pending.kind === 'orientation' && (
        <OrientationCreateDialog returnFocus={pending.returnFocus} onFinish={finish} />
      )}
    </TagCreateContext>
  );
}

export default TagCreateProvider;
