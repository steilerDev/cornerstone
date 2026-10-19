/**
 * User-related types and interfaces.
 */

export type UserRole = 'admin' | 'member';
export type AuthProvider = 'local' | 'oidc';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  authProvider: AuthProvider;
  createdAt: string;
  updatedAt: string;
  deactivatedAt: string | null;
}

/** User response shape for API responses (never includes sensitive fields) */
export interface UserResponse {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  authProvider: AuthProvider;
  createdAt: string;
  updatedAt?: string;
  deactivatedAt?: string | null;
  /** Always emitted by the server (`toUserResponse`). True when an OIDC subject is bound. */
  oidcLinked: boolean;
}

/**
 * A row of GET /api/users (#2219). `lockedUntil` is present only for admin callers: the ISO end of an
 * active login lockout, or null. Members never receive the key. Never part of UserResponse.
 */
export interface UserListItem extends UserResponse {
  lockedUntil?: string | null;
}

/** GET /api/users response. */
export interface UserListResponse {
  users: UserListItem[];
}

/**
 * Every `?error=` code the OIDC callback redirects to `/login` with. Runtime source of truth: the
 * server types its redirects against it and the client's I18N_UNION_KEYS.oidcLoginError set
 * enumerates it, so `unionKeys.test.ts` fails if a code lacks a translation (#2136).
 */
export const OIDC_LOGIN_ERROR_CODES = [
  'oidc_not_configured',
  'oidc_error',
  'invalid_state',
  'missing_email',
  'oidc_email_unverified',
  'account_deactivated',
  'oidc_no_matching_account',
] as const;
export type OidcLoginErrorCode = (typeof OIDC_LOGIN_ERROR_CODES)[number];
