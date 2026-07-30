/**
 * Lazy loader for pdfmake and pdf-lib.
 * Both packages are loaded dynamically (not statically imported elsewhere).
 */
import type pdfmakeType from 'pdfmake/build/pdfmake';
import type { PDFDocument as PDFDocumentType } from 'pdf-lib';

export interface PdfLibs {
  pdfMake: typeof pdfmakeType;
  PDFDocument: typeof PDFDocumentType;
}

let cached: Promise<PdfLibs> | null = null;

export function loadPdfLibs(): Promise<PdfLibs> {
  if (!cached) {
    cached = Promise.all([
      import('pdfmake/build/pdfmake'),
      import('pdfmake/build/vfs_fonts'),
      import('pdf-lib'),
    ]).then(([pdfMakeModule, vfsModule, pdfLibModule]) => {
      const pdfMake = pdfMakeModule.default;
      // pdfmake@0.3.11's vfs_fonts.js default-exports the font map directly (no .pdfMake wrapper)
      const vfsFontMap = (vfsModule as unknown as { default: unknown }).default;
      (pdfMake as unknown as { vfs?: unknown }).vfs = vfsFontMap;
      return {
        pdfMake: pdfMake as typeof pdfmakeType,
        PDFDocument: pdfLibModule.PDFDocument as typeof PDFDocumentType,
      };
    });
  }
  return cached;
}
