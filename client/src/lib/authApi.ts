import { get, post } from './apiClient.js';
import type { UserResponse } from '@cornerstone/shared';

export interface AuthMeResponse {
  user: UserResponse | null;
  setupRequired: boolean;
  oidcEnabled: boolean;
}

export interface SetupResponse {
  user: UserResponse;
}

export interface LoginResponse {
  user: UserResponse;
}

export interface SetupPayload {
  email: string;
  displayName: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export function getAuthMe(): Promise<AuthMeResponse> {
  return get<AuthMeResponse>('/auth/me');
}

export function setup(payload: SetupPayload): Promise<SetupResponse> {
  return post<SetupResponse>('/auth/setup', payload);
}

export function login(payload: LoginPayload): Promise<LoginResponse> {
  return post<LoginResponse>('/auth/login', payload);
}

export function logout(): Promise<void> {
  return post<void>('/auth/logout');
}

/** Start URL of the single sign-on flow; `next` (a validated in-app path) is where the user lands afterwards. */
export function oidcLoginUrl(next: string | null): string {
  return next
    ? `/api/auth/oidc/login?redirect=${encodeURIComponent(next)}`
    : '/api/auth/oidc/login';
}
