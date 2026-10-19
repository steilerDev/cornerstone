import { useMediaQuery } from './useMediaQuery.js';

/** Same breakpoint as ObjectForm: a Modal from 768px, a Sheet below. */
export const WIDE_DIALOG_MEDIA_QUERY = '(min-width: 768px)';

/**
 * True when dialogs render as a centred Modal (768px and wider); false when they render as a
 * Sheet. Kept apart from `ObjectForm` so small shared components need not import the form engine.
 */
export function useWideDialog(): boolean {
  return useMediaQuery(WIDE_DIALOG_MEDIA_QUERY);
}
