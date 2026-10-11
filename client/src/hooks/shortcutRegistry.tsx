import { createContext, use, useMemo, useRef, type ReactNode } from 'react';
import type { KeyboardShortcut } from './useKeyboardShortcuts.js';

export interface ShortcutRegisterOptions {
  /** A fallback owner yields a key to any non-fallback owner of the same key. */
  readonly fallback?: boolean;
}

export interface ShortcutRegistry {
  /** Registers a list under an owner id; returns the unregister function. */
  register(
    id: string,
    shortcuts: readonly KeyboardShortcut[],
    options?: ShortcutRegisterOptions,
  ): () => void;
  /**
   * Current shortcuts, owners in registration order, de-duplicated by key (last wins); a
   * non-fallback owner's entry always wins over a fallback one.
   */
  snapshot(): KeyboardShortcut[];
  /** True when an owner other than `exceptId` registered `key` without being a fallback. */
  hasNonFallbackOwner(key: string, exceptId: string): boolean;
}

interface Owner {
  readonly shortcuts: readonly KeyboardShortcut[];
  readonly fallback: boolean;
}

const ShortcutRegistryContext = createContext<ShortcutRegistry | null>(null);

function createRegistry(owners: Map<string, Owner>): ShortcutRegistry {
  return {
    register(id, shortcuts, options) {
      const owner: Owner = { shortcuts, fallback: options?.fallback === true };
      owners.set(id, owner);
      return () => {
        if (owners.get(id) === owner) owners.delete(id);
      };
    },
    snapshot() {
      const byKey = new Map<string, { shortcut: KeyboardShortcut; fallback: boolean }>();
      for (const owner of owners.values()) {
        for (const shortcut of owner.shortcuts) {
          const existing = byKey.get(shortcut.key);
          if (existing && !existing.fallback && owner.fallback) continue;
          byKey.set(shortcut.key, { shortcut, fallback: owner.fallback });
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
  };
}

/** Ref-backed registry: registering never re-renders anything. */
export function ShortcutRegistryProvider({ children }: { readonly children: ReactNode }) {
  const ownersRef = useRef(new Map<string, Owner>());
  const registry = useMemo(() => createRegistry(ownersRef.current), []);
  return <ShortcutRegistryContext value={registry}>{children}</ShortcutRegistryContext>;
}

/** The registry, or null outside a provider. */
export function useShortcutRegistry(): ShortcutRegistry | null {
  return use(ShortcutRegistryContext);
}
