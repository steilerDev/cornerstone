import { use } from 'react';
import { PhotoDialogsContext } from './photoDialogsContext.js';
import type { PhotoDialogsContextValue } from './photoDialogsContext.js';

/**
 * Opens the Annotate and bulk Set tags dialogs through `PhotoDialogsProvider` (mounted once by
 * `App.tsx`), so the dialogs stay out of page closures.
 */
export function usePhotoDialogs(): PhotoDialogsContextValue {
  return use(PhotoDialogsContext);
}
