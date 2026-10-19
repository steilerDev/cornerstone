import { createContext } from 'react';

export type TagKind = 'area' | 'orientation';

export interface CreatedTag {
  id: string;
  name: string;
}

/** Opens New area / New orientation in place; resolves with the created tag, or null on cancel. */
export type RequestTagCreate = (
  kind: TagKind,
  returnFocus?: HTMLElement | null,
) => Promise<CreatedTag | null>;

export const TagCreateContext = createContext<RequestTagCreate | null>(null);
