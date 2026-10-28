const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when `text` looks like an e-mail address (client-side check; the server is authoritative). */
export function isEmailAddress(text: string): boolean {
  return EMAIL_PATTERN.test(text);
}
