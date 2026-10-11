import { useState } from 'react';
import { useShortcutRegistry } from '../hooks/shortcutRegistry.js';

/**
 * Test helper (#2211): render inside a `ShortcutRegistryProvider`; clicking the button prints the
 * registry as `key:description|key:description` into the output, so a test can assert which
 * shortcuts a page registers (read with `shortcutRegistryText()`).
 */
export function ShortcutSnapshot() {
  const registry = useShortcutRegistry();
  const [text, setText] = useState('');
  return (
    <>
      <button
        type="button"
        data-testid="shortcut-snapshot"
        onClick={() =>
          setText((registry?.snapshot() ?? []).map((s) => `${s.key}:${s.description}`).join('|'))
        }
      >
        snapshot
      </button>
      <output data-testid="shortcut-snapshot-out">{text}</output>
    </>
  );
}
