import type { WorkItemPageDetail } from '@cornerstone/shared';
import { useObjectRecord } from '../../hooks/useObjectRecord.js';
import type { UseObjectRecordResult } from '../../hooks/useObjectRecord.js';
import { getWorkItem } from '../../lib/workItemsApi.js';

export type UseTaskRecordResult = UseObjectRecordResult<WorkItemPageDetail>;

/** The task of the page with its strip figures; only the newest request writes. */
export function useTaskRecord(id: string): UseTaskRecordResult {
  return useObjectRecord(id, getWorkItem);
}
