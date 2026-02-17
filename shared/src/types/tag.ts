/**
 * Tag-related types and interfaces.
 * Tags are a shared resource used to organize work items and household items.
 */

/**
 * Tag entity as stored in the database.
 */
export interface Tag {
  id: string;
  name: string;
  color: string | null;
  createdAt: string;
}

/**
 * Tag response shape for API responses.
 */
export interface TagResponse {
  id: string;
  name: string;
  color: string | null;
  createdAt?: string;
}

/**
 * Request body for creating a new tag.
 */
export interface CreateTagRequest {
  name: string;
  color?: string | null;
}

/**
 * Request body for updating a tag.
 * All fields are optional; at least one must be provided.
 */
export interface UpdateTagRequest {
  name?: string;
  color?: string | null;
}

/**
 * Response for GET /api/tags - list all tags.
 */
export interface TagListResponse {
  tags: TagResponse[];
}
