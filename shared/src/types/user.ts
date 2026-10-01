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
  /** True when the account can sign in via OIDC (oidc_subject set). Always emitted by the server; optional only so existing fixtures need not change. Absent ⇒ false. */
  oidcLinked?: boolean;
}
