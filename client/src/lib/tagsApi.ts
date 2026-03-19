/**
 * Tags are removed in EPIC-18. This stub prevents compilation errors
 * in files that still import tags (WorkItemDetailPage, WorkItemsPage).
 * These imports will be removed in Story #1037.
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

export function fetchTags(): Promise<TagListResponse> {
  return Promise.resolve({ tags: [] });
}

export function createTag(_data: CreateTagRequest): Promise<TagResponse> {
  return Promise.reject(new Error('Tags have been removed'));
}

export function updateTag(_id: string, _data: UpdateTagRequest): Promise<TagResponse> {
  return Promise.reject(new Error('Tags have been removed'));
}

export function deleteTag(_id: string): Promise<void> {
  return Promise.reject(new Error('Tags have been removed'));
}
