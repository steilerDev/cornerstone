import { describe, it, expect, jest } from '@jest/globals';
import { createRef } from 'react';
import { render } from '@testing-library/react';
import { PhotoDialogsContext } from './photoDialogsContext.js';
import type { PhotoDialogsContextValue } from './photoDialogsContext.js';
import { usePhotoDialogs } from './usePhotoDialogs.js';

describe('usePhotoDialogs', () => {
  it('returns the value supplied by the nearest provider', async () => {
    const annotate = jest.fn(async () => null);
    const bulkTag = jest.fn(async () => null);
    const value: PhotoDialogsContextValue = { annotate, bulkTag };
    let seen: PhotoDialogsContextValue | null = null;
    function Probe() {
      seen = usePhotoDialogs();
      return null;
    }

    render(
      <PhotoDialogsContext value={value}>
        <Probe />
      </PhotoDialogsContext>,
    );

    expect(seen).toBe(value);
    const returnFocusRef = createRef<HTMLElement>();
    await seen!.bulkTag({ photoIds: ['a'], areas: [], returnFocusRef });
    expect(bulkTag).toHaveBeenCalledTimes(1);
    expect(annotate).not.toHaveBeenCalled();
  });

  it('falls back to a default that throws when no provider is mounted', () => {
    let seen: PhotoDialogsContextValue | null = null;
    function Probe() {
      seen = usePhotoDialogs();
      return null;
    }
    render(<Probe />);

    expect(() =>
      seen!.bulkTag({ photoIds: ['a'], areas: [], returnFocusRef: createRef<HTMLElement>() }),
    ).toThrow('PhotoDialogsProvider missing');
  });
});
