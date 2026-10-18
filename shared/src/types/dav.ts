/**
 * DAV Token types
 * EPIC-17 Story #752: CalDAV/CardDAV DAV integration.
 */

export interface DavTokenStatus {
  hasToken: boolean;
  createdAt?: string;
  /** `${EXTERNAL_URL || request origin}/dav/`, user info removed. */
  davUrl: string;
}

export interface DavTokenResponse {
  token: string;
}
