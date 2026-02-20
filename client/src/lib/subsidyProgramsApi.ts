import { get, post, patch, del } from './apiClient.js';
import type {
  SubsidyProgram,
  SubsidyProgramListResponse,
  SubsidyProgramResponse,
  CreateSubsidyProgramRequest,
  UpdateSubsidyProgramRequest,
} from '@cornerstone/shared';

/**
 * Fetches all subsidy programs.
 */
export function fetchSubsidyPrograms(): Promise<SubsidyProgramListResponse> {
  return get<SubsidyProgramListResponse>('/subsidy-programs');
}

/**
 * Fetches a single subsidy program by ID.
 */
export function fetchSubsidyProgram(id: string): Promise<SubsidyProgramResponse> {
  return get<SubsidyProgramResponse>(`/subsidy-programs/${id}`);
}

/**
 * Creates a new subsidy program.
 */
export function createSubsidyProgram(data: CreateSubsidyProgramRequest): Promise<SubsidyProgram> {
  return post<SubsidyProgram>('/subsidy-programs', data);
}

/**
 * Updates an existing subsidy program.
 */
export function updateSubsidyProgram(
  id: string,
  data: UpdateSubsidyProgramRequest,
): Promise<SubsidyProgram> {
  return patch<SubsidyProgram>(`/subsidy-programs/${id}`, data);
}

/**
 * Deletes a subsidy program.
 * @throws {ApiClientError} with statusCode 409 if the program is referenced by budget entries.
 */
export function deleteSubsidyProgram(id: string): Promise<void> {
  return del<void>(`/subsidy-programs/${id}`);
}
