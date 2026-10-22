import { describe, it, expect } from '@jest/globals';
import { ATTACHMENT_TYPES, DOCUMENT_LINK_ENTITY_TYPES } from './document.js';
import * as sharedIndex from '../index.js';

describe('document link entity types', () => {
  it('lists the linkable entity types in a stable order', () => {
    expect([...DOCUMENT_LINK_ENTITY_TYPES]).toEqual([
      'work_item',
      'household_item',
      'invoice',
      'budget_source',
      'subsidy_program',
    ]);
  });

  it('has no duplicates', () => {
    expect(new Set(DOCUMENT_LINK_ENTITY_TYPES).size).toBe(DOCUMENT_LINK_ENTITY_TYPES.length);
  });

  it('is exported from the package index next to the attachment types', () => {
    expect(sharedIndex.DOCUMENT_LINK_ENTITY_TYPES).toBe(DOCUMENT_LINK_ENTITY_TYPES);
    expect(sharedIndex.ATTACHMENT_TYPES).toBe(ATTACHMENT_TYPES);
  });
});
