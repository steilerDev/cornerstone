/**
 * PDF output sinks: download, preview URL, upload to Paperless.
 */
import { uploadPaperlessDocument } from '../paperlessApi.js';

/**
 * Triggers a download of the PDF blob with the given filename.
 */
export function downloadPdf(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Creates a blob URL for preview (caller must revoke).
 */
export function createPreviewUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

/**
 * Uploads the PDF blob to Paperless-ngx with the given title.
 */
export async function uploadToPaperless(blob: Blob, title: string): Promise<void> {
  await uploadPaperlessDocument(blob, title);
}
