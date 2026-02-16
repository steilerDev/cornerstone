import { get, post, patch, del } from './apiClient.js';
import type { UserResponse } from '@cornerstone/shared';

/**
 * Fetches the current user's profile.
 */
export function getProfile(): Promise<UserResponse> {
  return get<UserResponse>('/users/me');
}

/**
 * Updates the current user's display name.
 */
export function updateProfile(data: { displayName: string }): Promise<UserResponse> {
  return patch<UserResponse>('/users/me', data);
}

/**
 * Changes the current user's password (local auth only).
 */
export function changePassword(data: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  return post<void>('/users/me/password', data);
}

/**
 * List users response shape.
 */
export interface ListUsersResponse {
  users: UserResponse[];
}

/**
 * Admin update user payload.
 */
export interface AdminUpdateUserPayload {
  displayName?: string;
  email?: string;
  role?: 'admin' | 'member';
}

/**
 * Lists all users in the system (admin only).
 */
export function listUsers(searchQuery?: string): Promise<ListUsersResponse> {
  const params = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : '';
  return get<ListUsersResponse>(`/users${params}`);
}

/**
 * Updates a user's profile (admin only).
 */
export function adminUpdateUser(
  userId: string,
  data: AdminUpdateUserPayload,
): Promise<UserResponse> {
  return patch<UserResponse>(`/users/${userId}`, data);
}

/**
 * Deactivates a user account (admin only).
 */
export function deactivateUser(userId: string): Promise<void> {
  return del<void>(`/users/${userId}`);
}
