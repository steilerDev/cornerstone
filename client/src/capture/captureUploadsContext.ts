import { createContext, use } from 'react';
import type { CaptureUploadsApi } from './captureTypes.js';

export const CaptureUploadsContext = createContext<CaptureUploadsApi | null>(null);

/** The app-wide capture upload engine. Throws outside `CaptureUploadProvider`. */
export function useCaptureUploads(): CaptureUploadsApi {
  const value = use(CaptureUploadsContext);
  if (value === null) {
    throw new Error('useCaptureUploads must be used within a CaptureUploadProvider');
  }
  return value;
}
