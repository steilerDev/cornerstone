/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import type * as UseUserTextModule from './useUserText.js';

let language: 'de' | 'en' | null = 'de';

jest.unstable_mockModule('../contexts/HouseNameContext.js', () => ({
  useEntriesLanguage: () => language,
}));

let useUserText: typeof UseUserTextModule.useUserText;

beforeEach(async () => {
  language = 'de';
  ({ useUserText } = await import('./useUserText.js'));
});

describe('useUserText', () => {
  it('binds lang to the household entries language', () => {
    const { result } = renderHook(() => useUserText());
    expect(result.current()).toEqual({ lang: 'de', className: 'userText' });
  });

  it('merges an extra class', () => {
    const { result } = renderHook(() => useUserText());
    expect(result.current('note')).toEqual({ lang: 'de', className: 'userText note' });
  });

  it('has no lang attribute but keeps the class while the language is unknown', () => {
    language = null;
    const { result } = renderHook(() => useUserText());
    const props = result.current();
    expect(props).not.toHaveProperty('lang');
    expect(props.className).toBe('userText');
  });
});
