import { describe, expect, it } from '@jest/globals';
import { loginUrlFor, readNextParam } from './nextParam.js';

describe('loginUrlFor', () => {
  it('D-13: carries the full in-app URL (path, search and hash) as an encoded next', () => {
    expect(loginUrlFor({ pathname: '/diary', search: '?q=1', hash: '#h' })).toBe(
      '/login?next=%2Fdiary%3Fq%3D1%23h',
    );
  });

  it('omits next when the requested URL is exactly the root', () => {
    expect(loginUrlFor({ pathname: '/', search: '', hash: '' })).toBe('/login');
  });

  it('keeps next for the root when it has a query (not exactly "/")', () => {
    expect(loginUrlFor({ pathname: '/', search: '?a=1', hash: '' })).toBe(
      '/login?next=%2F%3Fa%3D1',
    );
  });

  it('omits next when the requested URL fails the safe-path rule', () => {
    expect(loginUrlFor({ pathname: '//evil.example', search: '', hash: '' })).toBe('/login');
    expect(loginUrlFor({ pathname: '/a\\b', search: '', hash: '' })).toBe('/login');
  });
});

describe('readNextParam', () => {
  it('D-13: returns the decoded next, so a deep link survives sign-in', () => {
    expect(readNextParam('?next=%2Fdiary')).toBe('/diary');
    expect(readNextParam('?next=%2Fdiary%3Fq%3D1%23h')).toBe('/diary?q=1#h');
  });

  it('returns null when there is no next', () => {
    expect(readNextParam('')).toBeNull();
    expect(readNextParam('?error=oidc_error')).toBeNull();
  });

  it('returns null for a protocol-relative next', () => {
    expect(readNextParam('?next=%2F%2Fevil')).toBeNull();
  });

  it('returns null for a backslash next (the open-redirect form)', () => {
    expect(readNextParam('?next=%2F%5Cevil.example')).toBeNull();
  });

  it('returns null for an absolute URL', () => {
    expect(readNextParam('?next=https%3A%2F%2Fevil.example')).toBeNull();
  });

  it('returns null when next points at the login page (loop guard)', () => {
    expect(readNextParam('?next=%2Flogin%3Fnext%3D%2Fx')).toBeNull();
    expect(readNextParam('?next=%2Flogin')).toBeNull();
  });

  it('returns null when next points at the setup page (loop guard)', () => {
    expect(readNextParam('?next=%2Fsetup')).toBeNull();
  });

  it('does not treat a longer path that merely starts with the login word as the login page', () => {
    expect(readNextParam('?next=%2Flogin-help')).toBe('/login-help');
  });
});
