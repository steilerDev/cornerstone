/**
 * Unit tests for client/src/lib/reportPdf/loader.ts
 *
 * Covers: loadPdfLibs() against the REAL installed packages (pdfmake@0.3.11 / pdf-lib per
 * client/package.json) — this file deliberately does NOT mock 'pdfmake/build/pdfmake',
 * 'pdfmake/build/vfs_fonts', or 'pdf-lib', so it exercises the actual shape the app ships with,
 * not a hypothetical one.
 *
 * FIXED (Round 5): loader.ts used to do `const pdfMake = pdfMakeModule;`, assigning
 * the raw dynamic-import() MODULE NAMESPACE OBJECT to `pdfMake` instead of the real CJS interop
 * default. Namespace objects are non-extensible per spec, so the very next line — assigning
 * `pdfMake.vfs = ...` — threw `TypeError: Cannot add property vfs, object is not extensible`,
 * rejecting `loadPdfLibs()` on every call. Production code now does
 * `const pdfMake = pdfMakeModule.default;` (loader.ts line 22), which is the real, extensible CJS
 * export — confirmed below: `loadPdfLibs()` now resolves successfully.
 *
 * FIXED (Round 6): loader.ts's vfs assignment — `vfsModule_.default?.pdfMake?.vfs` — was
 * incorrectly assuming 'pdfmake/build/vfs_fonts.js' has a `default.pdfMake.vfs` shape. The
 * actually-installed pdfmake@0.3.11's vfs_fonts.js default-exports the font map DIRECTLY (no
 * `pdfMake` wrapper). Production code now correctly assigns the vfs font map directly:
 * `const vfsFontMap = vfsModule.default; pdfMake.vfs = vfsFontMap;` (loader.ts lines 23-24).
 * This fixes embedded Roboto font support.
 *
 * FIXED (Round 6): merge.ts's document definition was setting `defaultStyle: { font: 'Helvetica' }`
 * (merge.ts line 122) but pdfmake@0.3.11 ships with `pdfMake.fonts` defaulting to `{ Roboto: {...} }`
 * ONLY. Every real call to `pdfMake.createPdf(...)` — i.e. every real PDF generation — was
 * throwing: `Error: Font 'Helvetica' in style 'normal' is not defined in the font
 * section of the document definition.` Production code now uses the available 'Roboto' font
 * instead (merge.ts line 122). Both the font fix and vfs fix are confirmed working via the
 * real-package probe in the test suite.
 */
import { describe, it, expect } from '@jest/globals';

describe('loadPdfLibs', () => {
  it('FIXED: resolves successfully now that pdfMake is extracted from the CJS interop default (not the frozen ESM namespace), and vfs is properly assigned from vfs_fonts.default', async () => {
    const { loadPdfLibs } = await import('./loader.js');

    const libs = await loadPdfLibs();

    expect(typeof libs.pdfMake.createPdf).toBe('function');
    expect(typeof libs.PDFDocument.create).toBe('function');
    // `vfs` is now properly assigned to the font map from vfs_fonts.default
    expect(Object.prototype.hasOwnProperty.call(libs.pdfMake, 'vfs')).toBe(true);
    const vfs = (libs.pdfMake as unknown as { vfs?: unknown }).vfs;
    expect(vfs).toBeDefined();
    expect(typeof vfs).toBe('object');
    // Verify the font map contains expected Roboto font files
    expect('Roboto-Regular.ttf' in (vfs as Record<string, unknown>)).toBe(true);
  });

  it('caches the promise — a second call returns the identical (resolved) promise instance without re-importing', async () => {
    const { loadPdfLibs } = await import('./loader.js');
    const first = loadPdfLibs();
    const second = loadPdfLibs();

    expect(second).toBe(first);

    await first;
    const third = loadPdfLibs();
    expect(third).toBe(first);
  });

  it("FIXED: pdfMake.createPdf() now works with Roboto font (was broken with 'Helvetica')", async () => {
    const { loadPdfLibs } = await import('./loader.js');
    const { pdfMake } = await loadPdfLibs();

    // pdfMake.fonts defaults to { Roboto: {...} } only
    expect(Object.keys(pdfMake.fonts)).toEqual(['Roboto']);

    // createPdf() with Roboto (the font now used in merge.ts) works correctly
    // and getBlob() generates a valid PDF blob (no longer throws)
    const pdfDoc = pdfMake.createPdf({
      content: [{ text: 'hello' }],
      defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.4 },
    });
    const blob = await pdfDoc.getBlob();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it("smoking gun: pdfmake/build/pdfmake.js is a UMD/CJS bundle, so its real exports live on the dynamic-import() namespace's `.default`, not the namespace itself", async () => {
    const pdfMakeModule = await import('pdfmake/build/pdfmake');
    const namespace = pdfMakeModule as unknown as { createPdf?: unknown; default?: unknown };
    const defaultExport = namespace.default as { createPdf?: unknown } | undefined;

    expect(typeof namespace.createPdf).toBe('undefined');
    expect(typeof defaultExport?.createPdf).toBe('function');
    expect(Object.isExtensible(pdfMakeModule)).toBe(false);
    expect(Object.isExtensible(defaultExport)).toBe(true);
  });

  it('smoking gun: the real vfs_fonts.js default export IS the font map directly (no .pdfMake wrapper)', async () => {
    const vfsModule = await import('pdfmake/build/vfs_fonts');
    expect(typeof vfsModule.default).toBe('object');
    const hasRobotoKey = Object.prototype.hasOwnProperty.call(
      vfsModule.default,
      'Roboto-Regular.ttf',
    );
    expect(hasRobotoKey).toBe(true);
    // Neither of loader.ts's two lookup paths exist on the real module shape:
    expect((vfsModule as unknown as { pdfMake?: unknown }).pdfMake).toBeUndefined();
    expect((vfsModule.default as unknown as { pdfMake?: unknown }).pdfMake).toBeUndefined();
  });

  it('pdf-lib (unlike pdfmake) is a real ESM package — PDFDocument resolves correctly straight off the namespace', async () => {
    const pdfLibModule = await import('pdf-lib');
    expect(typeof pdfLibModule.PDFDocument).toBe('function');
    expect(typeof pdfLibModule.PDFDocument.create).toBe('function');
  });
});
