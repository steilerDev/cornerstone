import { createContext, use, useMemo, useRef, type ReactNode } from 'react';
import type { KeyboardShortcut } from './useKeyboardShortcuts.js';

export interface ShortcutRegistry {
  /** Registers a list under an owner id; returns the unregister function. */
  register(id: string, shortcuts: readonly KeyboardShortcut[]): () => void;
  /** Current shortcuts, owners in registration order, de-duplicated by key (last wins). */
  snapshot(): KeyboardShortcut[];
}

const ShortcutRegistryContext = createContext<ShortcutRegistry | null>(null);

function createRegistry(owners: Map<string, readonly KeyboardShortcut[]>): ShortcutRegistry {
  return {
    register(id, shortcuts) {
      owners.set(id, shortcuts);
      return () => {
        if (owners.get(id) === shortcuts) owners.delete(id);
      };
    },
    snapshot() {
      const byKey = new Map<string, KeyboardShortcut>();
      for (const list of owners.values()) {
        for (const shortcut of list) byKey.set(shortcut.key, shortcut);
      }
      return Array.from(byKey.values());
    },
  };
}

/** Ref-backed registry: registering never re-renders anything. */
export function ShortcutRegistryProvider({ children }: { readonly children: ReactNode }) {
  const ownersRef = useRef(new Map<string, readonly KeyboardShortcut[]>());
  const registry = useMemo(() => createRegistry(ownersRef.current), []);
  return <ShortcutRegistryContext value={registry}>{children}</ShortcutRegistryContext>;
}

/** The registry, or null outside a provider. */
export function useShortcutRegistry(): ShortcutRegistry | null {
  return use(ShortcutRegistryContext);
}
