import { useEffect, useState } from 'react';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import { listDiaryEntries } from '../../../lib/diaryApi.js';
import { listWorkItems } from '../../../lib/workItemsApi.js';
import { floorVendorsFromWorkItems } from './captureSuggestions.js';
import type { CompanySuggestion } from './captureSuggestions.js';

export interface CaptureSuggestionData {
  /** The household's latest saved manual entries, newest first. */
  entries: readonly DiaryEntrySummary[];
  /** Companies with work on the floor of the tagged area, most work first. */
  floorVendors: readonly CompanySuggestion[];
}

const NO_ENTRIES: readonly DiaryEntrySummary[] = [];
const NO_VENDORS: readonly CompanySuggestion[] = [];

/**
 * Loads the data behind the suggestion chips. Suggestions are a convenience: a failed request
 * leaves them empty, with no message.
 */
export function useCaptureSuggestions(floorAreaId: string | null): CaptureSuggestionData {
  const [entries, setEntries] = useState<readonly DiaryEntrySummary[]>(NO_ENTRIES);
  const [floor, setFloor] = useState<{
    areaId: string;
    vendors: readonly CompanySuggestion[];
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listDiaryEntries({ status: 'saved', automatic: false, pageSize: 50 })
      .then((response) => {
        if (!controller.signal.aborted) setEntries(response.items);
      })
      .catch(() => {
        // No suggestions.
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!floorAreaId) return undefined;
    const controller = new AbortController();
    listWorkItems({ areaId: floorAreaId, pageSize: 100 }, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        setFloor({
          areaId: floorAreaId,
          vendors: floorVendorsFromWorkItems(response.items),
        });
      })
      .catch(() => {
        // No suggestions.
      });
    return () => controller.abort();
  }, [floorAreaId]);

  const floorVendors = floorAreaId && floor?.areaId === floorAreaId ? floor.vendors : NO_VENDORS;
  return { entries, floorVendors };
}
