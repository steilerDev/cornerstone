/** The `tel:` href for a stored number: only digits and '+' survive. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
