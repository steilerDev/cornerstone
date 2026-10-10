function firstLetter(word: string | undefined): string {
  return word ? (Array.from(word)[0] ?? '') : '';
}

/**
 * Avatar initials: first letter of the first and last word of the name; one word gives one
 * letter; an empty name falls back to the first letter of the e-mail; neither gives '?'.
 * Upper-cased (locale-independent).
 */
export function initialsOf(
  displayName: string | null | undefined,
  email: string | null | undefined,
): string {
  const words = (displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    const first = firstLetter(words[0]);
    const last = words.length > 1 ? firstLetter(words[words.length - 1]) : '';
    return (first + last).toUpperCase();
  }
  const fromEmail = firstLetter((email ?? '').trim());
  return fromEmail ? fromEmail.toUpperCase() : '?';
}
