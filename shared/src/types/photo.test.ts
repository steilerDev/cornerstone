import { describe, it, expect } from '@jest/globals';
import { PHOTO_SPOT_ANY, PHOTO_SPOT_NONE } from './photo.js';
import * as sharedIndex from '../index.js';

describe('photo spot query sentinels', () => {
  it('PHOTO_SPOT_ANY is the __any__ sentinel and differs from the none sentinel', () => {
    expect(PHOTO_SPOT_ANY).toBe('__any__');
    expect(PHOTO_SPOT_ANY).not.toBe(PHOTO_SPOT_NONE);
  });

  it('is exported from the package index', () => {
    expect(sharedIndex.PHOTO_SPOT_ANY).toBe(PHOTO_SPOT_ANY);
    expect(sharedIndex.PHOTO_SPOT_NONE).toBe(PHOTO_SPOT_NONE);
  });
});
