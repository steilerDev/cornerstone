import type { FastifyRequest } from 'fastify';

/** `${protocol}://${host}` of the request; honours TRUST_PROXY exactly as the OIDC flow does. */
export function requestOrigin(request: Pick<FastifyRequest, 'protocol' | 'host'>): string {
  return `${request.protocol}://${request.host}`;
}

/** `new URL(value).host` (hostname + non-default port); null for undefined or unparsable input. */
export function hostOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host || null;
  } catch {
    return null;
  }
}

/**
 * The URL with username, password, search and hash removed and trailing slashes stripped.
 * The path is kept. Null when undefined or unparsable.
 */
export function publicUrlWithoutCredentials(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/** `${(externalUrl without credentials) || origin}/dav/` */
export function buildDavUrl(externalUrl: string | undefined, origin: string): string {
  return `${publicUrlWithoutCredentials(externalUrl) ?? origin}/dav/`;
}
