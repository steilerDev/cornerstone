import { describe, it, expect, afterEach } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import { installMatchMedia } from '../test/matchMediaControl.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import { useWideDialog, WIDE_DIALOG_MEDIA_QUERY } from './useWideDialog.js';

describe('useWideDialog', () => {
  let media: MatchMediaControl;

  afterEach(() => media.restore());

  it('uses the 768px breakpoint shared with ObjectForm', () => {
    media = installMatchMedia();
    expect(WIDE_DIALOG_MEDIA_QUERY).toBe('(min-width: 768px)');
  });

  it('is false below 768px and true from 768px, following width changes', () => {
    media = installMatchMedia({ [WIDE_DIALOG_MEDIA_QUERY]: false });
    const { result } = renderHook(() => useWideDialog());
    expect(result.current).toBe(false);

    media.set(WIDE_DIALOG_MEDIA_QUERY, true);
    expect(result.current).toBe(true);

    media.set(WIDE_DIALOG_MEDIA_QUERY, false);
    expect(result.current).toBe(false);
  });
});
