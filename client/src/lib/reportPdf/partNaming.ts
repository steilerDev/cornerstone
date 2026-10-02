/**
 * File naming for multi-PDF report parts (#2161). Pure; no imports.
 */

/** Base name shared by every part: `${useCase}-${slug}-${isoDate}` (same slug rules as the wizard). */
export function reportBaseName(useCase: string, sourceName: string, isoDate: string): string {
  const slug = sourceName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '');
  return `${useCase}-${slug}-${isoDate}`;
}

/** Part number, zero-padded to the width of `total` once total reaches 10. */
export function padPartNumber(k: number, total: number): string {
  return String(k).padStart(total >= 10 ? String(total).length : 1, '0');
}

export function partFileName(base: string, k: number, total: number): string {
  return `${base}-part-${padPartNumber(k, total)}-of-${total}.pdf`;
}
