/**
 * Copies text to the clipboard. Uses the Clipboard API; self-hosted instances often run over plain
 * http, where it is undefined, so it falls back to a hidden textarea and `execCommand('copy')`.
 * Resolves true on success, false when both fail. Never throws.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea fallback.
  }
  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  try {
    textarea.value = text;
    textarea.readOnly = true;
    textarea.setAttribute('aria-hidden', 'true');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.insetInlineStart = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();

    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}
