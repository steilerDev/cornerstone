/**
 * PDF fixtures for E2E tests.
 *
 * `buildPaddedPdf` produces a minimal, valid PDF 1.4 of an exact byte size. It is used to serve
 * deterministic invoice attachments to the report wizard (Story #2161 — maximum file size /
 * multi-PDF split), where the split is driven by the attachment byte sizes.
 */

/**
 * Builds a minimal valid PDF (catalog, pages, one page, Helvetica font) that is exactly
 * `targetBytes` long (or the minimal size when `targetBytes` is smaller than the minimal PDF).
 *
 * The padding is written as `% xxx…` comment lines INSIDE the page content stream, so it is part
 * of a stream object and survives pdf-lib `copyPages` (padding after `%%EOF`, or in a comment
 * between objects, would be dropped when the attachment is merged into the report). `/Length` and
 * the xref offsets are computed programmatically.
 */
export function buildPaddedPdf(targetBytes: number, label: string): Uint8Array {
  const safeLabel = label.replace(/[\\()\r\n]/g, ' ');

  const assemble = (padLength: number): Uint8Array => {
    const drawing = `BT /F1 18 Tf 72 720 Td (${safeLabel}) Tj ET\n`;
    let padding = '';
    if (padLength > 0) {
      // Whole `%xxx…\n` comment lines plus one shorter final line for the remainder.
      const lineLength = 80;
      const fullLines = Math.floor(padLength / lineLength);
      const remainder = padLength - fullLines * lineLength;
      padding = ('%' + 'x'.repeat(lineLength - 2) + '\n').repeat(fullLines);
      if (remainder === 1) {
        padding += '\n';
      } else if (remainder > 1) {
        padding += '%' + 'x'.repeat(remainder - 2) + '\n';
      }
    }
    const content = drawing + padding;

    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R ' +
        '/Resources << /Font << /F1 5 0 R >> >> >>',
      `<< /Length ${content.length} >>\nstream\n${content}endstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];

    let body = '%PDF-1.4\n';
    const offsets: number[] = [];
    objects.forEach((obj, i) => {
      offsets.push(body.length);
      body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    });
    const xrefOffset = body.length;
    body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) {
      body += `${String(offset).padStart(10, '0')} 00000 n \n`;
    }
    body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    // Everything above is ASCII, so string length === byte length.
    return new TextEncoder().encode(body);
  };

  const base = assemble(0);
  const padLength = targetBytes - base.byteLength;
  if (padLength <= 0) return base;
  const padded = assemble(padLength);
  // `/Length` and the xref offsets gain digits as the stream grows, so the first pass can miss
  // the target by a few bytes — correct it with one more pass.
  const drift = targetBytes - padded.byteLength;
  return drift === 0 ? padded : assemble(padLength + drift);
}
