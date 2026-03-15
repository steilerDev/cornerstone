import { get, post, patch, del } from './apiClient.js';
import type {
  DiaryEntrySummary,
  DiaryEntryDetail,
  DiaryEntryListResponse,
  DiaryEntryListQuery,
  CreateDiaryEntryRequest,
  UpdateDiaryEntryRequest,
} from '@cornerstone/shared';

/**
 * Fetches a paginated list of diary entries with optional filters.
 */
export function listDiaryEntries(params?: DiaryEntryListQuery): Promise<DiaryEntryListResponse> {
  const queryParams = new URLSearchParams();

  if (params?.page !== undefined) {
    queryParams.set('page', params.page.toString());
  }
  if (params?.pageSize !== undefined) {
    queryParams.set('pageSize', params.pageSize.toString());
  }
  if (params?.type) {
    queryParams.set('type', params.type);
  }
  if (params?.dateFrom) {
    queryParams.set('dateFrom', params.dateFrom);
  }
  if (params?.dateTo) {
    queryParams.set('dateTo', params.dateTo);
  }
  if (params?.automatic !== undefined) {
    queryParams.set('automatic', params.automatic.toString());
  }
  if (params?.q) {
    queryParams.set('q', params.q);
  }

  const queryString = queryParams.toString();
  const path = queryString ? `/diary-entries?${queryString}` : '/diary-entries';

  return get<DiaryEntryListResponse>(path);
}

/**
 * Fetches a single diary entry by ID with full details.
 */
export function getDiaryEntry(id: string): Promise<DiaryEntryDetail> {
  return get<DiaryEntryDetail>(`/diary-entries/${id}`);
}

/**
 * Creates a new diary entry.
 */
export function createDiaryEntry(data: CreateDiaryEntryRequest): Promise<DiaryEntryDetail> {
  return post<DiaryEntryDetail>('/diary-entries', data);
}

/**
 * Updates an existing diary entry.
 */
export function updateDiaryEntry(
  id: string,
  data: UpdateDiaryEntryRequest,
): Promise<DiaryEntryDetail> {
  return patch<DiaryEntryDetail>(`/diary-entries/${id}`, data);
}

/**
 * Deletes a diary entry.
 */
export function deleteDiaryEntry(id: string): Promise<void> {
  return del<void>(`/diary-entries/${id}`);
}
