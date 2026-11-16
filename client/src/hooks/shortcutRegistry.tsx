import { createContext, use, useMemo, useRef, type ReactNode } from 'react';
import {
  readSingleKeyShortcutsEnabled,
  writeSingleKeyShortcutsEnabled,
} from '../lib/shortcutPreference.js';
import type { KeyboardShortcut } from './useKeyboardShortcuts.js';

export type ShortcutGroup = 'page' | 'global' | 'goTo';

/** Keys only the shell may own (#2253 AC7). */
export const RESERVED_SHORTCUT_KEYS: readonly string[] = ['g', '?', '/'];

export interface RegisteredShortcut extends KeyboardShortcut {
  readonly group: ShortcutGroup;
}

export interface ShortcutRegisterOptions {
  /** A fallback owner yields a key to any non-fallback owner of the same key. */
  readonly fallback?: boolean;
  /** Where the help overlay lists the shortcut. Default `'page'`. */
  readonly group?: ShortcutGroup;
}

export interface ShortcutRegistry {
  /**
   * Registers a list under an owner id; returns the unregister function. A `'page'` registration
   * of a reserved key (`g`, `?`, `/`) is dropped with a `console.error`; it never throws.
   */
  register(
    id: string,
    shortcuts: readonly KeyboardShortcut[],
    options?: ShortcutRegisterOptions,
  ): () => void;
  /**
   * Current shortcuts, owners in registration order, de-duplicated by key (last wins); a
   * non-fallback owner's entry always wins over a fallback one. Each entry carries its group.
   */
  snapshot(): RegisteredShortcut[];
  /** True when an owner other than `exceptId` registered `key` without being a fallback. */
  hasNonFallbackOwner(key: string, exceptId: string): boolean;
  /** Whether single-key (character) shortcuts are on (WCAG 2.1.4 off switch). */
  singleKeyEnabled(): boolean;
  /** Turns single-key shortcuts on or off and remembers the choice in this browser. */
  setSingleKeyEnabled(enabled: boolean): void;
}

interface Owner {
  readonly shortcuts: readonly KeyboardShortcut[];
  readonly fallback: boolean;
  readonly group: ShortcutGroup;
}

const ShortcutRegistryContext = createContext<ShortcutRegistry | null>(null);

export function isReservedShortcutKey(key: string): boolean {
  const first = key.split(' ')[0] ?? key;
  return RESERVED_SHORTCUT_KEYS.includes(first);
}

function createRegistry(owners: Map<string, Owner>, initialSingleKey: boolean): ShortcutRegistry {
  let singleKey = initialSingleKey;
  return {
    register(id, shortcuts, options) {
      const group = options?.group ?? 'page';
      let accepted = shortcuts;
      if (group === 'page') {
        accepted = shortcuts.filter((shortcut) => {
          if (!isReservedShortcutKey(shortcut.key)) return true;
          console.error(
            `[shortcutRegistry] Shortcut key "${shortcut.key}" is reserved for the shell; registration ignored`,
          );
          return false;
        });
      }
      const owner: Owner = { shortcuts: accepted, fallback: options?.fallback === true, group };
      owners.set(id, owner);
      return () => {
        if (owners.get(id) === owner) owners.delete(id);
      };
    },
    snapshot() {
      const byKey = new Map<string, { shortcut: RegisteredShortcut; fallback: boolean }>();
      for (const owner of owners.values()) {
        for (const shortcut of owner.shortcuts) {
          const existing = byKey.get(shortcut.key);
          if (existing && !existing.fallback && owner.fallback) continue;
          byKey.set(shortcut.key, {
            shortcut: { ...shortcut, group: owner.group },
            fallback: owner.fallback,
          });
        }
      }
      return Array.from(byKey.values(), (entry) => entry.shortcut);
    },
    hasNonFallbackOwner(key, exceptId) {
      for (const [id, owner] of owners) {
        if (id === exceptId || owner.fallback) continue;
        if (owner.shortcuts.some((s) => s.key === key)) return true;
      }
      return false;
    },
    singleKeyEnabled: () => singleKey,
    setSingleKeyEnabled(enabled) {
      singleKey = enabled;
      writeSingleKeyShortcutsEnabled(enabled);
    },
  };
}

/** Ref-backed registry: registering never re-renders anything. */
export function ShortcutRegistryProvider({ children }: { readonly children: ReactNode }) {
  const ownersRef = useRef(new Map<string, Owner>());
  const registry = useMemo(
    () => createRegistry(ownersRef.current, readSingleKeyShortcutsEnabled()),
    [],
  );
  return <ShortcutRegistryContext value={registry}>{children}</ShortcutRegistryContext>;
}

/** The registry, or null outside a provider. */
export function useShortcutRegistry(): ShortcutRegistry | null {
  return use(ShortcutRegistryContext);
}
