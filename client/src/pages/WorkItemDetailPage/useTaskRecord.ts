import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkItemPageDetail } from '@cornerstone/shared';
import { getWorkItem } from '../../lib/workItemsApi.js';
import { toFetchFailure } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';

export interface UseTaskRecordResult {
  readonly record: WorkItemPageDetail | null;
  readonly isLoading: boolean;
  /** Why the last load failed; null when it worked. The page translates it at render time. */
  readonly failure: FetchFailure | null;
  /** The last load answered 404. */
  readonly notFound: boolean;
  /** Loads again and shows the loading state. */
  readonly reload: () => Promise<void>;
  /** Silent re-fetch: keeps the page as it is; a failure falls back to `reload`. */
  readonly refresh: () => Promise<void>;
  /** Bumps on every successful `refresh`, for panels that load their own data. */
  readonly revision: number;
}

/** The task of the page with its strip figures; only the newest request writes. */
export function useTaskRecord(id: string): UseTaskRecordResult {
  const [record, setRecord] = useState<WorkItemPageDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failure, setFailure] = useState<FetchFailure | null>(null);
  const [revision, setRevision] = useState(0);
  const latestRequestRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    latestRequestRef.current += 1;
    const request = latestRequestRef.current;
    setIsLoading(true);
    setFailure(null);
    try {
      const data = await getWorkItem(id);
      if (!mountedRef.current || request !== latestRequestRef.current) return;
      setRecord(data);
    } catch (err) {
      if (!mountedRef.current || request !== latestRequestRef.current) return;
      setFailure(toFetchFailure(err));
    } finally {
      if (mountedRef.current && request === latestRequestRef.current) setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const refresh = useCallback(async () => {
    latestRequestRef.current += 1;
    const request = latestRequestRef.current;
    try {
      const fresh = await getWorkItem(id);
      if (!mountedRef.current || request !== latestRequestRef.current) return;
      setRecord(fresh);
      setIsLoading(false);
      setFailure(null);
      setRevision((value) => value + 1);
    } catch {
      if (mountedRef.current && request === latestRequestRef.current) await reload();
    }
  }, [id, reload]);

  const notFound = failure?.kind === 'api' && failure.notFound;

  return { record, isLoading, failure, notFound, reload, refresh, revision };
}
