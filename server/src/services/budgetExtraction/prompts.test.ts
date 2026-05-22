/**
 * Unit tests for budget extraction prompts.
 *
 * Tests cover:
 * - SYSTEM_PROMPT content and scoping
 * - buildUserPrompt() with all hints provided
 * - buildUserPrompt() with missing hints (defaults applied)
 * - OCR text inclusion verbatim
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';

// Fixtures directory resolved from project root (process.cwd() = project root when jest runs)
const FIXTURES_DIR = resolve(process.cwd(), 'server/src/services/budgetExtraction/fixtures');

describe('SYSTEM_PROMPT', () => {
  it('mentions German construction invoice domain scoping', () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toMatch(/german/);
    expect(SYSTEM_PROMPT.toLowerCase()).toMatch(/construction/);
  });

  it('describes the required JSON output schema with "lines" array', () => {
    expect(SYSTEM_PROMPT).toContain('"lines"');
    expect(SYSTEM_PROMPT).toContain('"description"');
    expect(SYSTEM_PROMPT).toContain('"totalAmount"');
    expect(SYSTEM_PROMPT).toContain('"confidence"');
  });

  it('includes German decimal notation rule', () => {
    // The prompt must instruct the LLM to handle German comma decimal separators
    expect(SYSTEM_PROMPT).toMatch(/1\.234,56/);
  });

  it('includes confidence scoring guidance', () => {
    expect(SYSTEM_PROMPT).toMatch(/confidence/i);
    expect(SYSTEM_PROMPT).toMatch(/0-1|0\.{0,1}1/);
  });

  it('instructs LLM to output only valid JSON (no markdown)', () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toMatch(/only valid json|output only valid json/);
  });

  it('is a non-empty string', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });
});

describe('buildUserPrompt()', () => {
  describe('with all hints provided', () => {
    it('includes vendorName hint in output', () => {
      const result = buildUserPrompt('some OCR text', {
        vendorName: 'OBI',
        invoiceTotal: 199.99,
        invoiceDate: '2026-01-15',
        locale: 'de-DE',
      });
      expect(result).toContain('OBI');
    });

    it('includes invoiceTotal hint in output', () => {
      const result = buildUserPrompt('some OCR text', {
        vendorName: 'OBI',
        invoiceTotal: 199.99,
        invoiceDate: '2026-01-15',
        locale: 'de-DE',
      });
      expect(result).toContain('199.99');
    });

    it('includes invoiceDate hint in output', () => {
      const result = buildUserPrompt('some OCR text', {
        vendorName: 'OBI',
        invoiceTotal: 199.99,
        invoiceDate: '2026-01-15',
        locale: 'de-DE',
      });
      expect(result).toContain('2026-01-15');
    });

    it('includes locale hint in output', () => {
      const result = buildUserPrompt('some OCR text', {
        vendorName: 'OBI',
        invoiceTotal: 199.99,
        invoiceDate: '2026-01-15',
        locale: 'de-DE',
      });
      expect(result).toContain('de-DE');
    });

    it('includes the verbatim OCR text in output', () => {
      const ocrText = 'Rigipsplatten RB 12,5 mm    5x    EUR 12,50    EUR 62,50';
      const result = buildUserPrompt(ocrText, {
        vendorName: 'OBI',
        invoiceTotal: 123.17,
        invoiceDate: '2024-03-15',
        locale: 'de-DE',
      });
      expect(result).toContain(ocrText);
    });
  });

  describe('with missing hints (defaults applied)', () => {
    it('uses "unknown" when vendorName is omitted', () => {
      const result = buildUserPrompt('ocr text', {});
      expect(result).toContain('unknown');
    });

    it('uses "unknown" when invoiceTotal is omitted', () => {
      const result = buildUserPrompt('ocr text', {});
      // invoiceTotal missing → 'unknown' in prompt
      expect(result).toContain('unknown');
    });

    it('uses "unknown" when invoiceDate is omitted', () => {
      const result = buildUserPrompt('ocr text', {});
      expect(result).toContain('unknown');
    });

    it('defaults locale to de-DE when locale is omitted', () => {
      const result = buildUserPrompt('ocr text', {});
      expect(result).toContain('de-DE');
    });

    it('handles empty hints object without throwing', () => {
      expect(() => buildUserPrompt('ocr text', {})).not.toThrow();
    });

    it('handles undefined individual hint fields without throwing', () => {
      expect(() =>
        buildUserPrompt('ocr text', {
          vendorName: undefined,
          invoiceTotal: undefined,
          invoiceDate: undefined,
          locale: undefined,
        }),
      ).not.toThrow();
    });
  });

  describe('output structure', () => {
    it('returns a non-empty string', () => {
      const result = buildUserPrompt('some text', {});
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(10);
    });

    it('instructs the LLM to return JSON with "lines" key', () => {
      const result = buildUserPrompt('some text', {});
      expect(result).toContain('"lines"');
    });

    it('embeds OCR text between delimiters (--- markers)', () => {
      const ocrText = 'UNIQUE_OCR_CONTENT_12345';
      const result = buildUserPrompt(ocrText, {});
      // OCR text should appear after a --- delimiter
      expect(result).toContain('---');
      const ocrIndex = result.indexOf(ocrText);
      const delimiterIndex = result.indexOf('---');
      expect(ocrIndex).toBeGreaterThan(delimiterIndex);
    });

    it('multiline OCR text is preserved intact', () => {
      const multilineOcr = `Line 1\nLine 2\nLine 3`;
      const result = buildUserPrompt(multilineOcr, {});
      expect(result).toContain('Line 1\nLine 2\nLine 3');
    });
  });

  describe('fixture text embedding', () => {
    it('can embed obi-baumarkt fixture without throwing', () => {
      const fixture = readFileSync(resolve(FIXTURES_DIR, 'obi-baumarkt.txt'), 'utf8');

      expect(() =>
        buildUserPrompt(fixture, { vendorName: 'OBI', invoiceTotal: 123.17 }),
      ).not.toThrow();
      expect(buildUserPrompt(fixture, { vendorName: 'OBI' })).toContain('Rigipsplatten');
    });

    it('can embed elektriker-rechnung fixture without throwing', () => {
      const fixture = readFileSync(resolve(FIXTURES_DIR, 'elektriker-rechnung.txt'), 'utf8');

      expect(() =>
        buildUserPrompt(fixture, { vendorName: 'Elektro Schmidt GmbH', invoiceTotal: 1165.61 }),
      ).not.toThrow();
      expect(buildUserPrompt(fixture, {})).toContain('Elektro Schmidt');
    });

    it('can embed dachdecker fixture without throwing', () => {
      const fixture = readFileSync(resolve(FIXTURES_DIR, 'dachdecker.txt'), 'utf8');

      expect(() =>
        buildUserPrompt(fixture, { vendorName: 'Dachdeckerei Weber', invoiceTotal: 15950.46 }),
      ).not.toThrow();
      expect(buildUserPrompt(fixture, {})).toContain('Dachdeckerei');
    });

    it('can embed installateur-pauschale fixture without throwing', () => {
      const fixture = readFileSync(resolve(FIXTURES_DIR, 'installateur-pauschale.txt'), 'utf8');

      expect(() =>
        buildUserPrompt(fixture, { vendorName: 'Installationen Bergmann', invoiceTotal: 7937.3 }),
      ).not.toThrow();
      expect(buildUserPrompt(fixture, {})).toContain('Bergmann');
    });

    it('can embed fliesenleger fixture without throwing', () => {
      const fixture = readFileSync(resolve(FIXTURES_DIR, 'fliesenleger.txt'), 'utf8');

      expect(() =>
        buildUserPrompt(fixture, { vendorName: 'Fliesen König', invoiceTotal: 2663.22 }),
      ).not.toThrow();
      expect(buildUserPrompt(fixture, {})).toContain('Fliesen');
    });
  });
});
