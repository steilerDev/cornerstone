import { get, post, patch, del } from './apiClient.js';
import type {
  TagResponse,
  TagListResponse,
  CreateTagRequest,
  UpdateTagRequest,
} from '@cornerstone/shared';

/**
 * Fetches all tags, sorted alphabetically by name.
 */
export function fetchTags(): Promise<TagListResponse> {
  return get<TagListResponse>('/tags');
}

/**
 * Creates a new tag.
 */
export function createTag(data: CreateTagRequest): Promise<TagResponse> {
  return post<TagResponse>('/tags', data);
}

/**
 * Updates an existing tag.
 */
export function updateTag(id: string, data: UpdateTagRequest): Promise<TagResponse> {
  return patch<TagResponse>(`/tags/${id}`, data);
}

/**
 * Deletes a tag.
 */
export function deleteTag(id: string): Promise<void> {
  return del<void>(`/tags/${id}`);
}
