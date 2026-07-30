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
 * default. Namespace objects are non-extensible per spec, so any direct property assignment onto
 * that object (e.g. `pdfMake.vfs = ...`) threw `TypeError: Cannot add property vfs, object is not
 * extensible`. Production code now does `const pdfMake = pdfMakeModule.default;` (loader.ts),
 * which is the real, extensible CJS export.
 *
 * FIXED (Round 7 / frontend fix spec item 1): pdfmake@0.3.11 has NO `.vfs` setter at all — an
 * earlier round's `pdfMake.vfs = vfsFontMap` direct-assignment approach was based on a
 * misunderstanding of the installed version's real API. Production code now uses the real 0.3.x
 * public API: `pdfMake.addVirtualFileSystem(vfsFontMap)` followed by
 * `pdfMake.addFonts({ Roboto: { normal, bold, italics, bolditalics } })`. Internally,
 * `addVirtualFileSystem` writes each font file into a module-level `VirtualFileSystem` instance
 * exposed as `pdfMake.virtualfs` (confirmed by reading node_modules/pdfmake/build/pdfmake.js) —
 * `pdfMake.virtualfs.existsSync(filename)` is the correct way to verify the vfs was populated,
 * not `Object.prototype.hasOwnProperty.call(pdfMake, 'vfs')` (there never was a `.vfs` own
 * property to check for on this pdfmake version).
 */
import { describe, it, expect } from '@jest/globals';

describe('loadPdfLibs', () => {
  it('resolves successfully — pdfMake is extracted from the CJS interop default (not the frozen ESM namespace)', async () => {
    const { loadPdfLibs } = await import('./loader.js');

    const libs = await loadPdfLibs();

    expect(typeof libs.pdfMake.createPdf).toBe('function');
    expect(typeof libs.PDFDocument.create).toBe('function');
  });

  it('populates the virtual file system with the Roboto font files via addVirtualFileSystem()', async () => {
    const { loadPdfLibs } = await import('./loader.js');
    const { pdfMake } = await loadPdfLibs();

    const virtualfs = (pdfMake as unknown as { virtualfs: { existsSync: (f: string) => boolean } })
      .virtualfs;
    expect(virtualfs).toBeDefined();
    expect(virtualfs.existsSync('Roboto-Regular.ttf')).toBe(true);
    expect(virtualfs.existsSync('Roboto-Medium.ttf')).toBe(true);
  });

  it('registers the Roboto font family via addFonts()', async () => {
    const { loadPdfLibs } = await import('./loader.js');
    const { pdfMake } = await loadPdfLibs();

    expect(Object.keys(pdfMake.fonts)).toEqual(['Roboto']);
    expect(pdfMake.fonts.Roboto).toEqual({
      normal: 'Roboto-Regular.ttf',
      bold: 'Roboto-Medium.ttf',
      italics: 'Roboto-Italic.ttf',
      bolditalics: 'Roboto-MediumItalic.ttf',
    });
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

  it('createPdf() with plain Roboto text produces a non-empty PDF blob', async () => {
    const { loadPdfLibs } = await import('./loader.js');
    const { pdfMake } = await loadPdfLibs();

    const pdfDoc = pdfMake.createPdf({
      content: [{ text: 'hello' }],
      defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.4 },
    });
    const blob = await pdfDoc.getBlob();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('createPdf() with bold Roboto text (the "Roboto-Medium.ttf" font file) produces a non-empty PDF blob', async () => {
    // Exercises the embedded bold font specifically — merge.ts's own document definition uses
    // `bold: true` throughout (table headers, subtotal/total rows, styles.title, etc.), so this
    // confirms addFonts()'s `bold: 'Roboto-Medium.ttf'` mapping is actually resolvable from the
    // virtual file system populated by addVirtualFileSystem(), not just the `normal` variant.
    const { loadPdfLibs } = await import('./loader.js');
    const { pdfMake } = await loadPdfLibs();

    const pdfDoc = pdfMake.createPdf({
      content: [{ text: 'test', bold: true }],
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
