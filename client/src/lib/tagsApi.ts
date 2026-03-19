/**
 * Tags are removed in EPIC-18. This file will be deleted in Story 6.
 * All functions return empty/no-op stubs since the /api/tags endpoint no longer exists.
 */

export interface TagResponse {
  id: string;
  name: string;
  color: string | null;
}

export interface TagListResponse {
  tags: TagResponse[];
}

export interface CreateTagRequest {
  name: string;
  color: string | null;
}

export interface UpdateTagRequest {
  name?: string;
  color?: string;
}

/**
 * Returns an empty tag list (tags endpoint removed in EPIC-18).
 */
export function fetchTags(): Promise<TagListResponse> {
  return Promise.resolve({ tags: [] });
}

/**
 * No-op (tags endpoint removed in EPIC-18).
 */
export function createTag(_data: CreateTagRequest): Promise<TagResponse> {
  return Promise.reject(new Error('Tags have been removed'));
}

/**
 * No-op (tags endpoint removed in EPIC-18).
 */
export function updateTag(_id: string, _data: UpdateTagRequest): Promise<TagResponse> {
  return Promise.reject(new Error('Tags have been removed'));
}

/**
 * No-op (tags endpoint removed in EPIC-18).
 */
export function deleteTag(_id: string): Promise<void> {
  return Promise.reject(new Error('Tags have been removed'));
}
