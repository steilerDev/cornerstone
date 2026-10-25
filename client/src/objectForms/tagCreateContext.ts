import { createContext } from 'react';

export type TagKind = 'area' | 'orientation' | 'trade' | 'category';

export interface CreatedTag {
  id: string;
  name: string;
}

/**
 * Opens New area / New orientation / New trade / New purchase category in place (`name` pre-fills
 * the Name field); resolves with the created tag, or null on cancel.
 */
export type RequestTagCreate = (
  kind: TagKind,
  returnFocus?: HTMLElement | null,
  name?: string,
) => Promise<CreatedTag | null>;

export const TagCreateContext = createContext<RequestTagCreate | null>(null);
