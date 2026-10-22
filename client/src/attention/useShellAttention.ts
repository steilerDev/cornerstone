import { use } from 'react';
import { AttentionContext } from './attentionContext.js';
import type { ShellAttention } from './attentionContext.js';

/** The one shell-level attention state (Home, the bell, the bottom bar and Home's title). */
export function useShellAttention(): ShellAttention {
  const value = use(AttentionContext);
  if (value === null) throw new Error('useShellAttention must be used inside AttentionProvider');
  return value;
}
