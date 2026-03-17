/**
 * DAV Token types
 * EPIC-17 Story #752: CalDAV/CardDAV DAV integration.
 */

export interface DavTokenStatus {
  hasToken: boolean;
  createdAt?: string;
}

export interface DavTokenResponse {
  token: string;
}
