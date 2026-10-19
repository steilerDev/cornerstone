import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  DiaryEntryDetail,
  DiarySignatureEntry,
  ManualDiaryEntryType,
  UpdateDiaryEntryRequest,
} from '@cornerstone/shared';
import { ApiClientError } from '../../../lib/apiClient.js';
import {
  createDiaryEntry,
  deleteDiaryEntry,
  promoteDiaryEntry,
  updateDiaryEntry,
} from '../../../lib/diaryApi.js';
import { translateApiError } from '../../../lib/errorTranslation.js';
import { todayLocalIsoDate } from '../../../lib/localDate.js';
import {
  EMPTY_FIELDS,
  buildMetadata,
  buildSavePayload,
  droppedDetails,
  fieldsFromEntry,
  isInvalidTimePair,
  pruneFields,
  typeHasSignatures,
  typeHasTimes,
} from './captureMetadata.js';
import type {
  CaptureFields,
  CaptureFormValues,
  CaptureMode,
  DroppedDetail,
} from './captureMetadata.js';

const TYPING_DEBOUNCE_MS = 800;
const SLOW_SAVE_MS = 400;
const RETRY_DELAYS_MS: readonly number[] = [2000, 5000, 15000];

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed' | 'offline';

export interface UseCaptureDraftOptions {
  /** Mode the page resolved: new (no entry yet), draft or saved. */
  mode: CaptureMode;
  entry: DiaryEntryDetail | null;
  /** Pre-selected date (`?date=`). */
  prefillDate: string | null;
  /** Called once when this screen created the draft. */
  onDraftCreated: (id: string) => void;
  /** Text for the status region of the sticky bar. */
  announce: (message: string) => void;
}

export type SubmitResult =
  { status: 'ok'; id: string } | { status: 'error'; message: string; photosMissing: boolean };

export type TypeSwitchRequest =
  | { kind: 'applied' }
  | { kind: 'confirm'; to: ManualDiaryEntryType; dropped: DroppedDetail[] }
  | { kind: 'failed' };

function initialForm(
  options: Pick<UseCaptureDraftOptions, 'entry' | 'prefillDate'>,
): CaptureFormValues {
  const { entry, prefillDate } = options;
  if (entry) {
    const { fields, signatures } = fieldsFromEntry(entry);
    return {
      entryType: entry.entryType as ManualDiaryEntryType,
      entryDate: entry.entryDate,
      title: entry.title ?? '',
      body: entry.body,
      fields,
      signatures,
    };
  }
  return {
    entryType: 'daily_log',
    entryDate: prefillDate ?? todayLocalIsoDate(),
    title: '',
    body: '',
    fields: { ...EMPTY_FIELDS, materials: [] },
    signatures: [],
  };
}

/** The autosave PATCH of a draft; metadata is held back while the time pair is invalid. */
function patchPayloadOf(form: CaptureFormValues): UpdateDiaryEntryRequest {
  const payload: UpdateDiaryEntryRequest = {
    entryDate: form.entryDate,
    title: form.title.trim() || null,
    body: form.body,
  };
  const invalidTimes =
    typeHasTimes(form.entryType) && isInvalidTimePair(form.fields.workStart, form.fields.workEnd);
  if (!invalidTimes) {
    payload.metadata = buildMetadata(form.entryType, form.fields, form.signatures);
  }
  return payload;
}

/**
 * Fields, draft creation, autosave and saving of the capture screen.
 *
 * - New: nothing is written until the first photo or the first character of title or text.
 * - Draft: every change is saved (typing after 800 ms, chips at once), one request at a time.
 * - Saved: no autosave; the edits are sent by `submit`.
 */
export function useCaptureDraft({
  mode: initialMode,
  entry,
  prefillDate,
  onDraftCreated,
  announce,
}: UseCaptureDraftOptions) {
  const { t } = useTranslation('diary');
  const { t: tErrors } = useTranslation('errors');
  const isSaved = initialMode === 'saved';

  const [form, setForm] = useState<CaptureFormValues>(() => initialForm({ entry, prefillDate }));
  const formRef = useRef(form);
  const [draftId, setDraftId] = useState<string | null>(
    initialMode === 'draft' && entry ? entry.id : null,
  );
  const draftIdRef = useRef(draftId);
  const [initialJson] = useState(() => JSON.stringify(buildSavePayload(form)));

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [createFailed, setCreateFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const createRef = useRef<Promise<string | null> | null>(null);
  const loopRef = useRef<Promise<boolean> | null>(null);
  const queuedRef = useRef(false);
  const lastSentRef = useRef(JSON.stringify(patchPayloadOf(form)));
  // The date the server holds; a failed date change goes back to it.
  const confirmedDateRef = useRef(form.entryDate);
  const debounceRef = useRef<number | null>(null);
  const retryRef = useRef<number | null>(null);
  const slowRef = useRef<number | null>(null);
  const failCountRef = useRef(0);
  const hadFailureRef = useRef(false);
  const firstSavedRef = useRef(initialMode === 'draft');
  const promotedRef = useRef(false);
  const onDraftCreatedRef = useRef(onDraftCreated);
  const announceRef = useRef(announce);
  const tRef = useRef(t);
  useEffect(() => {
    onDraftCreatedRef.current = onDraftCreated;
    announceRef.current = announce;
    tRef.current = t;
  });

  const clearTimer = (ref: { current: number | null }) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  };

  const markSaved = useCallback(() => {
    clearTimer(slowRef);
    failCountRef.current = 0;
    setSaveStatus('saved');
    setSavedAt(new Date().toISOString());
    if (hadFailureRef.current) {
      hadFailureRef.current = false;
      announceRef.current(tRef.current('capture.announce.savedAgain'));
    } else if (!firstSavedRef.current) {
      firstSavedRef.current = true;
      announceRef.current(tRef.current('capture.announce.draftSaved'));
    }
  }, []);

  const flushRef = useRef<() => Promise<boolean>>(() => Promise.resolve(true));

  const handleFailure = useCallback(() => {
    clearTimer(slowRef);
    failCountRef.current += 1;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSaveStatus('offline');
      return;
    }
    setSaveStatus('failed');
    if (!hadFailureRef.current) {
      hadFailureRef.current = true;
      announceRef.current(tRef.current('capture.saveFailed'));
    }
    const delay = RETRY_DELAYS_MS[failCountRef.current - 1];
    if (delay !== undefined) {
      clearTimer(retryRef);
      retryRef.current = window.setTimeout(() => {
        retryRef.current = null;
        void flushRef.current();
      }, delay);
    }
  }, []);

  /**
   * Sends the latest state of the draft. One request in flight; changes made meanwhile cause
   * exactly one follow-up request with the latest state. Resolves false when a request failed.
   */
  const flush = useCallback((): Promise<boolean> => {
    clearTimer(debounceRef);
    if (loopRef.current) {
      queuedRef.current = true;
      return loopRef.current;
    }
    const run = async (): Promise<boolean> => {
      await Promise.resolve();
      let ok = true;
      try {
        do {
          queuedRef.current = false;
          const id = draftIdRef.current;
          if (!id || promotedRef.current) break;
          if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            // Not a failure: the save resumes when the browser is back online.
            setSaveStatus('offline');
            break;
          }
          const payload = patchPayloadOf(formRef.current);
          const json = JSON.stringify(payload);
          if (json === lastSentRef.current) break;
          clearTimer(slowRef);
          slowRef.current = window.setTimeout(() => {
            slowRef.current = null;
            setSaveStatus('saving');
          }, SLOW_SAVE_MS);
          await updateDiaryEntry(id, payload);
          lastSentRef.current = json;
          confirmedDateRef.current = payload.entryDate ?? confirmedDateRef.current;
          markSaved();
        } while (queuedRef.current);
      } catch {
        ok = false;
        handleFailure();
      }
      loopRef.current = null;
      return ok;
    };
    const running = run();
    loopRef.current = running;
    return running;
  }, [handleFailure, markSaved]);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  /** Applies a change to the form and schedules its save. */
  const update = useCallback(
    (patch: Partial<CaptureFormValues>, schedule: 'now' | 'typing' | 'none') => {
      const next = { ...formRef.current, ...patch };
      formRef.current = next;
      setForm(next);
      if (isSaved || schedule === 'none' || !draftIdRef.current) return;
      if (schedule === 'now') {
        void flush();
      } else {
        clearTimer(debounceRef);
        debounceRef.current = window.setTimeout(() => {
          debounceRef.current = null;
          void flush();
        }, TYPING_DEBOUNCE_MS);
      }
    },
    [flush, isSaved],
  );

  /** Creates the draft when there is none yet (new mode only). */
  const ensureDraft = useCallback((): Promise<string | null> => {
    if (isSaved) return Promise.resolve(entry?.id ?? null);
    if (draftIdRef.current) return Promise.resolve(draftIdRef.current);
    if (createRef.current) return createRef.current;
    const create = async (): Promise<string | null> => {
      await Promise.resolve();
      const snapshot = formRef.current;
      try {
        const body = patchPayloadOf(snapshot);
        const created = await createDiaryEntry({
          entryType: snapshot.entryType,
          status: 'draft',
          entryDate: snapshot.entryDate,
          title: body.title,
          body: body.body,
          metadata: body.metadata,
        });
        draftIdRef.current = created.id;
        lastSentRef.current = JSON.stringify(patchPayloadOf(snapshot));
        confirmedDateRef.current = snapshot.entryDate;
        setCreateFailed(false);
        setDraftId(created.id);
        markSaved();
        onDraftCreatedRef.current(created.id);
        // State that changed while the request ran is flushed now.
        void flush();
        return created.id;
      } catch {
        setCreateFailed(true);
        return null;
      } finally {
        createRef.current = null;
      }
    };
    const creating = create();
    createRef.current = creating;
    return creating;
  }, [entry, flush, isSaved, markSaved]);

  const isNewContent = (value: string) => value.trim().length > 0;

  const setTitle = useCallback(
    (title: string, schedule: 'now' | 'typing' = 'typing') => {
      update({ title }, schedule);
      if (!isSaved && !draftIdRef.current && isNewContent(title)) void ensureDraft();
    },
    [ensureDraft, isSaved, update],
  );

  const setBody = useCallback(
    (body: string) => {
      update({ body }, 'typing');
      if (!isSaved && !draftIdRef.current && isNewContent(body)) void ensureDraft();
    },
    [ensureDraft, isSaved, update],
  );

  /** A date change on a draft is saved at once; a failure puts the old date back. */
  const setEntryDate = useCallback(
    (entryDate: string) => {
      update({ entryDate }, 'now');
      if (isSaved || !draftIdRef.current) return;
      void (loopRef.current ?? Promise.resolve(true)).then(async (ok) => {
        if (ok) return;
        if (formRef.current.entryDate !== entryDate) return;
        update({ entryDate: confirmedDateRef.current }, 'none');
        clearTimer(retryRef);
        failCountRef.current = 0;
        hadFailureRef.current = false;
        setSaveStatus(firstSavedRef.current ? 'saved' : 'idle');
        announceRef.current(tRef.current('capture.announce.dateFailed'));
      });
    },
    [isSaved, update],
  );

  const setFields = useCallback(
    (patch: Partial<CaptureFields>, schedule: 'now' | 'typing' = 'now') => {
      update({ fields: { ...formRef.current.fields, ...patch } }, schedule);
    },
    [update],
  );

  const setSignatures = useCallback(
    (signatures: DiarySignatureEntry[]) => update({ signatures }, 'now'),
    [update],
  );

  /** Waits for the request in flight, if any. */
  const settle = useCallback(async () => {
    clearTimer(debounceRef);
    if (loopRef.current) await loopRef.current;
  }, []);

  const applyTypeChange = useCallback(
    async (to: ManualDiaryEntryType): Promise<boolean> => {
      const current = formRef.current;
      const fields = pruneFields(current.fields, to);
      const signatures = typeHasSignatures(to) ? current.signatures : [];
      const id = draftIdRef.current;
      if (id && !isSaved) {
        await settle();
        const sendFields =
          typeHasTimes(to) && isInvalidTimePair(fields.workStart, fields.workEnd)
            ? { ...fields, workEnd: null }
            : fields;
        try {
          await updateDiaryEntry(id, {
            entryType: to,
            metadata: buildMetadata(to, sendFields, signatures),
          });
        } catch {
          return false;
        }
        // The server now holds the new type and metadata; the next change sends the rest.
        lastSentRef.current = '';
      }
      update({ entryType: to, fields, signatures }, 'none');
      return true;
    },
    [isSaved, settle, update],
  );

  /** Switches the type at once when nothing would be lost, else asks the caller to confirm. */
  const requestTypeChange = useCallback(
    async (to: ManualDiaryEntryType): Promise<TypeSwitchRequest> => {
      const current = formRef.current;
      if (to === current.entryType) return { kind: 'applied' };
      const dropped = droppedDetails(current.entryType, to, current.fields, current.signatures);
      if (dropped.length > 0) return { kind: 'confirm', to, dropped };
      return (await applyTypeChange(to)) ? { kind: 'applied' } : { kind: 'failed' };
    },
    [applyTypeChange],
  );

  const retrySave = useCallback(() => {
    clearTimer(retryRef);
    failCountRef.current = 0;
    void flush();
  }, [flush]);

  /** Save entry (promote) or Save changes. */
  const submit = useCallback(async (): Promise<SubmitResult> => {
    setSubmitting(true);
    try {
      const current = formRef.current;
      const payload = buildSavePayload(current);
      if (isSaved) {
        const id = entry?.id ?? '';
        await updateDiaryEntry(id, payload);
        return { status: 'ok', id };
      }
      const id = draftIdRef.current ?? (await ensureDraft());
      if (!id) return { status: 'error', message: t('capture.draftFailed'), photosMissing: false };
      await settle();
      promotedRef.current = true;
      clearTimer(retryRef);
      try {
        await promoteDiaryEntry(id, payload);
      } catch (err) {
        promotedRef.current = false;
        throw err;
      }
      return { status: 'ok', id };
    } catch (err) {
      if (err instanceof ApiClientError) {
        const fieldsDetail = (err.error.details as { fields?: unknown } | undefined)?.fields;
        const photosMissing = Array.isArray(fieldsDetail) && fieldsDetail.includes('photos');
        return {
          status: 'error',
          message: translateApiError(err.error.code, tErrors),
          photosMissing,
        };
      }
      return { status: 'error', message: t('capture.saveFailed'), photosMissing: false };
    } finally {
      setSubmitting(false);
    }
  }, [ensureDraft, entry, isSaved, settle, t, tErrors]);

  /** Cancels pending saves and deletes the draft. */
  const discard = useCallback(
    async (beforeDelete?: (id: string) => Promise<void>) => {
      clearTimer(debounceRef);
      clearTimer(retryRef);
      promotedRef.current = true;
      await settle();
      const id = draftIdRef.current;
      if (id) {
        await beforeDelete?.(id);
        await deleteDiaryEntry(id);
      }
    },
    [settle],
  );

  /** After a failed discard the draft stays editable. */
  const resumeAfterFailedDiscard = useCallback(() => {
    promotedRef.current = false;
  }, []);

  // The browser coming back online resumes the save.
  useEffect(() => {
    const onOnline = () => {
      if (draftIdRef.current) {
        failCountRef.current = 0;
        void flushRef.current();
      }
    };
    const onOffline = () => {
      if (draftIdRef.current) setSaveStatus('offline');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Leaving sends what was typed in the last 800 ms and stops every timer.
  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) void flushRef.current();
      clearTimer(debounceRef);
      clearTimer(retryRef);
      clearTimer(slowRef);
    };
  }, []);

  const getDraftId = useCallback(() => draftIdRef.current, []);

  const mode: CaptureMode = isSaved ? 'saved' : draftId ? 'draft' : 'new';
  const dirty = isSaved && JSON.stringify(buildSavePayload(form)) !== initialJson;

  return {
    mode,
    form,
    draftId,
    getDraftId,
    saveStatus,
    savedAt,
    createFailed,
    submitting,
    dirty,
    setTitle,
    setBody,
    setEntryDate,
    setFields,
    setSignatures,
    ensureDraft,
    requestTypeChange,
    applyTypeChange,
    retrySave,
    submit,
    discard,
    resumeAfterFailedDiscard,
  };
}
