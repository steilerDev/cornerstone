import { get, post, patch } from './apiClient.js';
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
