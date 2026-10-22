import { useCallback } from 'react';
import { deleteDiaryEntry } from '../lib/diaryApi.js';
import { useCaptureUploads } from './captureUploadsContext.js';
import { clearStickyTags } from './stickyTags.js';

export interface UseDiscardDraft {
  /** Discards a draft: its queued uploads, the entry, then its remembered tags. Throws on failure. */
  discard: (entryId: string) => Promise<void>;
  /** Photos of the draft still waiting in the upload queue. */
  waitingCount: (entryId: string) => number;
}

/** The one definition of "discard a diary draft" (Site diary Unfinished row, Home Tidy up). */
export function useDiscardDraft(): UseDiscardDraft {
  const uploads = useCaptureUploads();
  const { discardDraft, items } = uploads;

  const discard = useCallback(
    async (entryId: string) => {
      await discardDraft(entryId);
      await deleteDiaryEntry(entryId);
      clearStickyTags(entryId);
    },
    [discardDraft],
  );

  const waitingCount = useCallback(
    (entryId: string) => items.filter((item) => item.draftId === entryId).length,
    [items],
  );

  return { discard, waitingCount };
}
