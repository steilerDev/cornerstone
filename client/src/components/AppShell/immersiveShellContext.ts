import { createContext } from 'react';

export interface ImmersiveShell {
  /** Registers an immersive page; the returned function unregisters it. */
  register: () => () => void;
}

/** Provided by `AppShell`; null outside it (unit tests). */
export const ImmersiveShellContext = createContext<ImmersiveShell | null>(null);
