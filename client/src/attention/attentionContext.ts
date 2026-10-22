import { createContext } from 'react';
import type { RefObject } from 'react';
import type { UseAttentionResult } from '../hooks/useAttention.js';

/** Quiet refetch on route change, tab focus and bell open: at most once per minute. */
export const ATTENTION_STALE_MS = 60_000;
/** Home refetches on mount unless a request started this recently (dedupes the first load). */
export const HOME_ATTENTION_STALE_MS = 2_000;
/** Rows shown before "Show all (n)" (Home's Needs attention and the bell). */
export const NEEDS_ATTENTION_LIMIT = 8;

export interface ShellAttention extends UseAttentionResult {
  /** Silent refetch unless the last request started less than `maxAgeMs` ago. */
  refreshStale: (maxAgeMs: number) => void;
  /** Home's Needs-attention h2 (Home attaches it; the bell's "Open Home" focuses it on Home). */
  homeHeadingRef: RefObject<HTMLHeadingElement | null>;
}

export const AttentionContext = createContext<ShellAttention | null>(null);
