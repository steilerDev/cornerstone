/**
 * Unit tests for publicAddress.ts (Story #2217): the public-address helpers shared by the
 * integrations status, the DAV token status, the OIDC redirect URI and the Paperless status.
 */
import { describe, it, expect } from '@jest/globals';
import {
  buildDavUrl,
  hostOf,
  publicUrlWithoutCredentials,
  requestOrigin,
} from './publicAddress.js';

describe('requestOrigin', () => {
  it('joins protocol and host', () => {
    expect(requestOrigin({ protocol: 'https', host: 'house.example.test' })).toBe(
      'https://house.example.test',
    );
  });

  it('keeps a non-default port in the host', () => {
    expect(requestOrigin({ protocol: 'http', host: 'localhost:3000' })).toBe(
      'http://localhost:3000',
    );
  });
});

describe('hostOf', () => {
  it.each([undefined, ''])('returns null for %p', (value) => {
    expect(hostOf(value)).toBeNull();
  });

  it('returns null for an unparsable value', () => {
    expect(hostOf('not a url')).toBeNull();
  });

  it('returns null when the URL has no host', () => {
    expect(hostOf('file:///tmp/x')).toBeNull();
  });

  it('returns the hostname without credentials, path, query or hash', () => {
    expect(hostOf('https://user1:pass1@docs.example.test/base?x=1#h')).toBe('docs.example.test');
  });

  it('keeps a non-default port and drops a default one', () => {
    expect(hostOf('https://docs.example.test:8443/x')).toBe('docs.example.test:8443');
    expect(hostOf('https://docs.example.test:443/x')).toBe('docs.example.test');
  });
});

describe('publicUrlWithoutCredentials', () => {
  it.each([undefined, ''])('returns null for %p', (value) => {
    expect(publicUrlWithoutCredentials(value)).toBeNull();
  });

  it('returns null for an unparsable value', () => {
    expect(publicUrlWithoutCredentials('::nope::')).toBeNull();
  });

  it('strips username, password, query and hash but keeps the path', () => {
    expect(publicUrlWithoutCredentials('https://u5:p5@house.example.test/cs?q=1#h')).toBe(
      'https://house.example.test/cs',
    );
  });

  it('drops a trailing slash after the origin', () => {
    expect(publicUrlWithoutCredentials('https://house.example.test/')).toBe(
      'https://house.example.test',
    );
    expect(publicUrlWithoutCredentials('https://house.example.test')).toBe(
      'https://house.example.test',
    );
  });

  it('drops several trailing slashes after a path', () => {
    expect(publicUrlWithoutCredentials('https://house.example.test/cs///')).toBe(
      'https://house.example.test/cs',
    );
  });

  it('keeps a non-default port', () => {
    expect(publicUrlWithoutCredentials('http://u:p@house.example.test:8080/a/b/')).toBe(
      'http://house.example.test:8080/a/b',
    );
  });
});

describe('buildDavUrl', () => {
  it('uses the external URL without credentials when set', () => {
    expect(buildDavUrl('https://u5:p5@house.example.test/cs?q=1#h', 'http://internal:3000')).toBe(
      'https://house.example.test/cs/dav/',
    );
  });

  it('does not double the slash when the external URL ends in one', () => {
    expect(buildDavUrl('https://house.example.test/', 'http://internal:3000')).toBe(
      'https://house.example.test/dav/',
    );
  });

  it('falls back to the request origin when the external URL is unset or empty', () => {
    expect(buildDavUrl(undefined, 'http://internal:3000')).toBe('http://internal:3000/dav/');
    expect(buildDavUrl('', 'http://internal:3000')).toBe('http://internal:3000/dav/');
  });

  it('falls back to the request origin when the external URL is unparsable', () => {
    expect(buildDavUrl('::nope::', 'http://internal:3000')).toBe('http://internal:3000/dav/');
  });
});
