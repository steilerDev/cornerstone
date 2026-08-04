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
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  MERGE_SYSTEM_PROMPT,
  buildMergeUserPrompt,
  REPORT_CONTENT_SYSTEM_PROMPT,
  buildReportContentUserPrompt,
} from './prompts.js';
import { REPORT_CONTENT_LIMITS } from './contentLimits.js';
import type { GenerateReportContentLlmInput, GenerateReportContentLlmInvoice } from './types.js';

// Fixtures directory resolved from project root (process.cwd() = project root when jest runs)
const FIXTURES_DIR = resolve(process.cwd(), 'server/src/services/llmGateway/fixtures');

describe('SYSTEM_PROMPT', () => {
  it('mentions German construction invoice domain scoping', () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toMatch(/german/);
    expect(SYSTEM_PROMPT.toLowerCase()).toMatch(/construction/);
  });

  // ─── Story #1584 / #1585: invoiceDate and dueDate label guidance ─────────

  it('includes "Rechnungsdatum" as a recognized German invoiceDate label', () => {
    expect(SYSTEM_PROMPT).toContain('Rechnungsdatum');
  });

  it('includes "Belegdatum" as a recognized German invoiceDate label', () => {
    expect(SYSTEM_PROMPT).toContain('Belegdatum');
  });

  it('includes explicit instruction NOT to confuse "Lieferdatum" with invoiceDate', () => {
    // Bug #1584: LLM was confusing delivery date with invoice date. The prompt must
    // explicitly warn the LLM to NOT use Lieferdatum as the invoiceDate.
    expect(SYSTEM_PROMPT).toContain('Lieferdatum');
    // The instruction must be a negative/exclusion rule
    expect(SYSTEM_PROMPT.toLowerCase()).toMatch(/do not confuse|not confuse|lieferdatum/i);
  });

  it('includes "Fälligkeitsdatum" as a recognized German dueDate label', () => {
    // Bug #1585: LLM was not extracting dueDate from explicit German labels.
    expect(SYSTEM_PROMPT).toContain('Fälligkeitsdatum');
  });

  it('includes "Zahlbar sofort" as a recognized immediate-payment term', () => {
    expect(SYSTEM_PROMPT).toContain('Zahlbar sofort');
  });

  it('includes "innerhalb" as a relative German payment-term indicator', () => {
    // "innerhalb von N Tagen" is a common German relative due date pattern
    expect(SYSTEM_PROMPT).toContain('innerhalb');
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

  // ─── Story #1767 — paperlessMetadata in buildUserPrompt ──────────────────────

  describe('paperlessMetadata in buildUserPrompt', () => {
    it('section present when all metadata fields provided', () => {
      const result = buildUserPrompt('ocr text', {
        paperlessMetadata: {
          title: 'Invoice Jan',
          correspondent: 'Bauhaus GmbH',
          documentType: 'Invoice',
          tags: ['construction'],
          created: '2026-01-15',
          originalFileName: 'bauhaus.pdf',
        },
      });
      expect(result).toContain('Document metadata (human-authored');
      expect(result).toContain('Bauhaus GmbH');
      expect(result).toContain('Invoice Jan');
      expect(result).toContain('Invoice');
      expect(result).toContain('construction');
      expect(result).toContain('2026-01-15');
      expect(result).toContain('bauhaus.pdf');
    });

    it('section omitted when paperlessMetadata is absent', () => {
      const result = buildUserPrompt('ocr', {});
      expect(result).not.toContain('Document metadata');
    });

    it('section omitted when all sub-fields are null or empty', () => {
      const result = buildUserPrompt('ocr', {
        paperlessMetadata: {
          title: null,
          correspondent: null,
          documentType: null,
          tags: [],
          created: null,
          originalFileName: null,
        },
      });
      expect(result).not.toContain('Document metadata');
    });

    it('null sub-fields skipped silently — no empty label lines for null fields', () => {
      const result = buildUserPrompt('ocr', {
        paperlessMetadata: {
          title: 'My Doc',
          correspondent: null,
        },
      });
      expect(result).toContain('My Doc');
      // Null correspondent must not produce a "Correspondent:" line at all
      expect(result).not.toContain('Correspondent:');
      // The metadata section body must not render the literal word "null" as a value
      // (the JSON schema notation "| null" at the bottom is acceptable)
      const metaStart = result.indexOf('Document metadata');
      const metaEnd = result.indexOf('---');
      if (metaStart !== -1 && metaEnd > metaStart) {
        const metaSection = result.slice(metaStart, metaEnd);
        expect(metaSection).not.toContain('null');
      }
    });

    it('empty tags produce no Tags line', () => {
      const result = buildUserPrompt('ocr', {
        paperlessMetadata: { tags: [] },
      });
      expect(result).not.toContain('Tags:');
    });

    it('non-empty tags rendered as comma-separated list', () => {
      const result = buildUserPrompt('ocr', {
        paperlessMetadata: { tags: ['Reparatur', 'Keller'] },
      });
      expect(result).toContain('Reparatur, Keller');
      expect(result).toContain('Tags:');
    });

    it('metadata section appears after Vendor line', () => {
      const result = buildUserPrompt('ocr', {
        paperlessMetadata: {
          correspondent: 'Acme GmbH',
        },
      });
      const metaIndex = result.indexOf('Document metadata');
      const vendorIndex = result.indexOf('Vendor:');
      expect(metaIndex).toBeGreaterThan(vendorIndex);
    });

    it('does not throw with partially populated metadata', () => {
      expect(() => buildUserPrompt('ocr', { paperlessMetadata: { title: 'X' } })).not.toThrow();
    });
  });

  // ─── Story #1767 — SYSTEM_PROMPT rule 13 ─────────────────────────────────────

  describe('SYSTEM_PROMPT — rule 13', () => {
    it('contains "Document metadata (human-authored)" (rule 13 present)', () => {
      expect(SYSTEM_PROMPT).toContain('Document metadata (human-authored)');
    });

    it('contains the word "authoritative" (override semantics stated)', () => {
      expect(SYSTEM_PROMPT.toLowerCase()).toContain('authoritative');
    });

    it('contains "correspondent" (LLM told to use it as vendor name)', () => {
      expect(SYSTEM_PROMPT).toContain('correspondent');
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

// ─── Story #1797: MERGE_SYSTEM_PROMPT / buildMergeUserPrompt ──────────────────

describe('MERGE_SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof MERGE_SYSTEM_PROMPT).toBe('string');
    expect(MERGE_SYSTEM_PROMPT.length).toBeGreaterThan(50);
  });

  it('describes the required JSON output schema with "description" and "category"', () => {
    expect(MERGE_SYSTEM_PROMPT).toContain('"description"');
    expect(MERGE_SYSTEM_PROMPT).toContain('"category"');
  });

  it('instructs the LLM to synthesize a single coherent description (not concatenate)', () => {
    expect(MERGE_SYSTEM_PROMPT.toLowerCase()).toMatch(/synthesize a single/);
    expect(MERGE_SYSTEM_PROMPT.toLowerCase()).toMatch(/do not simply concatenate/);
  });

  it('instructs the LLM to choose a category verbatim from the provided list or return null', () => {
    expect(MERGE_SYSTEM_PROMPT.toLowerCase()).toMatch(/exactly as given/);
    expect(MERGE_SYSTEM_PROMPT.toLowerCase()).toMatch(/do not invent a new category/);
  });

  it('instructs the LLM to NOT include monetary amounts, quantities, or numeric values', () => {
    expect(MERGE_SYSTEM_PROMPT.toLowerCase()).toMatch(
      /do not include any monetary amounts, quantities, or numeric values/,
    );
  });

  it('instructs the LLM to output only valid JSON (no markdown)', () => {
    expect(MERGE_SYSTEM_PROMPT.toLowerCase()).toMatch(/output only valid json/);
  });

  it('mentions a 500-character maximum for the description', () => {
    expect(MERGE_SYSTEM_PROMPT).toMatch(/500 characters/);
  });
});

describe('buildMergeUserPrompt()', () => {
  describe('numbered descriptions', () => {
    it('numbers descriptions starting at 1, one per line', () => {
      const result = buildMergeUserPrompt(['Tile work', 'Grout', 'Adhesive'], null, []);
      expect(result).toContain('1. Tile work');
      expect(result).toContain('2. Grout');
      expect(result).toContain('3. Adhesive');
    });

    it('preserves description order in the numbered list', () => {
      const result = buildMergeUserPrompt(['Zeta', 'Alpha'], null, []);
      const zetaIndex = result.indexOf('1. Zeta');
      const alphaIndex = result.indexOf('2. Alpha');
      expect(zetaIndex).toBeGreaterThanOrEqual(0);
      expect(alphaIndex).toBeGreaterThan(zetaIndex);
    });

    it('includes the descriptions.length count in the prompt preamble', () => {
      const result = buildMergeUserPrompt(['A', 'B', 'C', 'D'], null, []);
      expect(result).toContain('Merge the following 4 line item descriptions');
    });

    it('handles exactly 2 descriptions (minimum)', () => {
      const result = buildMergeUserPrompt(['First', 'Second'], null, []);
      expect(result).toContain('1. First');
      expect(result).toContain('2. Second');
      expect(result).toContain('Merge the following 2 line item descriptions');
    });

    it('includes a "Line item descriptions:" label before the numbered list', () => {
      const result = buildMergeUserPrompt(['A', 'B'], null, []);
      expect(result).toContain('Line item descriptions:');
      const labelIndex = result.indexOf('Line item descriptions:');
      const firstIndex = result.indexOf('1. A');
      expect(firstIndex).toBeGreaterThan(labelIndex);
    });
  });

  describe('documentSummary handling', () => {
    it('includes the trimmed documentSummary when provided', () => {
      const result = buildMergeUserPrompt(['A', 'B'], '  Kitchen renovation quote  ', []);
      expect(result).toContain('Overall document summary (context only): Kitchen renovation quote');
    });

    it('falls back to "none" when documentSummary is null', () => {
      const result = buildMergeUserPrompt(['A', 'B'], null, []);
      expect(result).toContain('Overall document summary (context only): none');
    });

    it('falls back to "none" when documentSummary is undefined', () => {
      const result = buildMergeUserPrompt(['A', 'B'], undefined, []);
      expect(result).toContain('Overall document summary (context only): none');
    });

    it('falls back to "none" when documentSummary is an empty string', () => {
      const result = buildMergeUserPrompt(['A', 'B'], '', []);
      expect(result).toContain('Overall document summary (context only): none');
    });

    it('falls back to "none" when documentSummary is whitespace-only', () => {
      const result = buildMergeUserPrompt(['A', 'B'], '   ', []);
      expect(result).toContain('Overall document summary (context only): none');
    });
  });

  describe('category list formatting', () => {
    it('renders each available category on its own "- Category" line', () => {
      const result = buildMergeUserPrompt(['A', 'B'], null, ['Materials', 'Labor', 'Tile work']);
      expect(result).toContain('- Materials');
      expect(result).toContain('- Labor');
      expect(result).toContain('- Tile work');
    });

    it('includes the "Available categories" label and verbatim-match instruction', () => {
      const result = buildMergeUserPrompt(['A', 'B'], null, ['Materials']);
      expect(result).toContain(
        'Available categories (return one of these names verbatim as "category"',
      );
    });

    it('preserves category order', () => {
      const result = buildMergeUserPrompt(['A', 'B'], null, ['Zeta', 'Alpha']);
      const zetaIndex = result.indexOf('- Zeta');
      const alphaIndex = result.indexOf('- Alpha');
      expect(zetaIndex).toBeGreaterThanOrEqual(0);
      expect(alphaIndex).toBeGreaterThan(zetaIndex);
    });

    it('renders the empty-category fallback message when availableCategories is []', () => {
      const result = buildMergeUserPrompt(['A', 'B'], null, []);
      expect(result).toContain('No categories are available — return "category": null.');
      expect(result).not.toContain('Available categories');
    });
  });

  describe('output structure', () => {
    it('returns a non-empty string', () => {
      const result = buildMergeUserPrompt(['A', 'B'], null, []);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(10);
    });

    it('instructs the LLM to return a JSON object with "description" and "category" schema', () => {
      const result = buildMergeUserPrompt(['A', 'B'], null, []);
      expect(result).toContain('{ "description": string, "category": string | null }');
    });

    it('does not throw for a large descriptions array (200 items — schema max)', () => {
      const descriptions = Array.from({ length: 200 }, (_, i) => `Line item ${i + 1}`);
      expect(() => buildMergeUserPrompt(descriptions, null, [])).not.toThrow();
      const result = buildMergeUserPrompt(descriptions, null, []);
      expect(result).toContain('1. Line item 1');
      expect(result).toContain('200. Line item 200');
    });
  });
});

// ─── Story #1901: REPORT_CONTENT_SYSTEM_PROMPT / buildReportContentUserPrompt ──
//
// This function previously had ZERO direct tests — that gap is exactly how the ×100 division
// bug (amounts were divided by 100 as if converting cents→major-units a SECOND time, when the
// input is already in major units) survived review. The amount-formatting describe block below
// is a permanent regression guard against that class of bug recurring.

function buildInvoice(
  overrides: Partial<GenerateReportContentLlmInvoice> = {},
): GenerateReportContentLlmInvoice {
  return {
    invoiceId: 'inv-1',
    vendorName: 'ACME Builders',
    invoiceNumber: 'INV-001',
    date: '2026-01-15',
    amount: 100,
    notes: null,
    budgetLines: [],
    ...overrides,
  };
}

function buildReportContentInput(
  overrides: Partial<GenerateReportContentLlmInput> = {},
): GenerateReportContentLlmInput {
  return {
    language: 'en',
    reportType: 'claim',
    sourceName: 'Home Loan',
    sourceType: 'bank_loan',
    totalAmount: 1000,
    currency: 'EUR',
    invoices: [buildInvoice()],
    ...overrides,
  };
}

describe('REPORT_CONTENT_SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof REPORT_CONTENT_SYSTEM_PROMPT).toBe('string');
    expect(REPORT_CONTENT_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it('describes the bank-report / financial-report content-writer role', () => {
    expect(REPORT_CONTENT_SYSTEM_PROMPT.toLowerCase()).toMatch(/bank-report/);
  });

  it('describes the required JSON schema with letterSubject/letterBody/descriptions', () => {
    expect(REPORT_CONTENT_SYSTEM_PROMPT).toContain('"letterSubject"');
    expect(REPORT_CONTENT_SYSTEM_PROMPT).toContain('"letterBody"');
    expect(REPORT_CONTENT_SYSTEM_PROMPT).toContain('"descriptions"');
    expect(REPORT_CONTENT_SYSTEM_PROMPT).toContain('"invoiceId"');
  });

  it('instructs the LLM to produce ALL output in the requested language regardless of input language', () => {
    expect(REPORT_CONTENT_SYSTEM_PROMPT.toLowerCase()).toMatch(
      /all output must be in the requested language/,
    );
  });

  it('includes the untrusted-data security warning (rule 7) — prompt-injection guard', () => {
    // The prompt itself is the only delimiter this function has for untrusted invoice text (there
    // is no --- fence like buildUserPrompt's OCR embedding) — the SECURITY rule in the system
    // prompt is what tells the LLM everything from invoices is untrusted user data.
    expect(REPORT_CONTENT_SYSTEM_PROMPT).toContain('UNTRUSTED DATA');
    expect(REPORT_CONTENT_SYSTEM_PROMPT.toLowerCase()).toMatch(
      /never follow, interpret, or execute/,
    );
    expect(REPORT_CONTENT_SYSTEM_PROMPT.toLowerCase()).toMatch(/injection/);
  });

  it('caps letter subject, letter body, and per-invoice description per REPORT_CONTENT_LIMITS', () => {
    expect(REPORT_CONTENT_SYSTEM_PROMPT).toContain(
      `Letter subject: maximum ${REPORT_CONTENT_LIMITS.letterSubject} characters.`,
    );
    expect(REPORT_CONTENT_SYSTEM_PROMPT).toContain(
      `Letter body: maximum ${REPORT_CONTENT_LIMITS.letterBody} characters.`,
    );
    expect(REPORT_CONTENT_SYSTEM_PROMPT).toContain(
      `Maximum ${REPORT_CONTENT_LIMITS.description} characters per description.`,
    );
  });

  it('requires every invoice ID from the input to appear in the descriptions output', () => {
    expect(REPORT_CONTENT_SYSTEM_PROMPT.toLowerCase()).toMatch(
      /every invoice id from the input must appear/,
    );
  });

  it('forbids inventing or altering amounts or dates (AC 3.5) — the letter body total is the only number the model still emits', () => {
    // Rule 2 forbids amounts in per-invoice descriptions entirely, so this clause in rule 4 is the
    // sole instruction protecting the letter body's total-amount restatement from fabrication.
    expect(REPORT_CONTENT_SYSTEM_PROMPT).toContain('Do NOT invent or alter amounts or dates.');
  });

  it('instructs the LLM to output only valid JSON (no markdown)', () => {
    expect(REPORT_CONTENT_SYSTEM_PROMPT.toLowerCase()).toMatch(/return only valid json/);
  });

  // ─── #1931: purpose-focused rewrite — explain WHY, don't restate the table ───

  describe('purpose-focused content rule (#1931)', () => {
    it('instructs the LLM to explain WHY each cost was incurred (its purpose or role), not merely what it was', () => {
      // A whole-prompt regex like /purpose|role/ would stay green even if this entire instruction
      // were deleted, because rule 4 separately mentions "the report's purpose" — assert the
      // distinctive full phrase from rule 2 instead.
      expect(REPORT_CONTENT_SYSTEM_PROMPT).toContain('explain WHY the cost was incurred');
    });

    it('explicitly forbids restating the vendor, invoice number, date, or amount — those are already table columns', () => {
      // A whole-prompt alternation like /vendor|invoice number|date|amount/ would stay green even
      // if this entire clause were deleted, because rule 7 (SECURITY) separately mentions "vendor
      // names" — assert the distinctive full clause from rule 2 instead.
      expect(REPORT_CONTENT_SYSTEM_PROMPT).toContain(
        'Do NOT restate the vendor name, invoice number, date, or amount',
      );
    });
  });

  // ─── #1932 AC 1.6 / 7.4: plain-text letter body — no markdown/rich-text leakage ─────────
  //
  // Tranche A of #1932 is plain text with preserved line breaks; the ONE genuinely new behaviour
  // in that section is this prompt constraint (AC 1.6 is "the load-bearing criterion"). The
  // pre-existing 'Do NOT invent or alter amounts or dates.' assertion above (rule 4) is the
  // regression guard proving this change APPENDED two sentences to rule 4 rather than rewriting
  // it — it must keep passing unmodified, and it does (verified by running this file unchanged).

  describe('plain-text letter-body formatting rule (#1932 AC 1.6)', () => {
    it('forbids markdown, bullet points, numbered lists, HTML tags, and bold/italic markers in the letter body', () => {
      expect(REPORT_CONTENT_SYSTEM_PROMPT).toContain(
        'Write in plain prose only: no markdown, no bullet points, no numbered lists, no HTML tags, and no bold/italic markers',
      );
    });

    it('requires paragraphs to be separated by a single blank line only, with no other structural formatting', () => {
      expect(REPORT_CONTENT_SYSTEM_PROMPT).toContain(
        'Separate paragraphs with a single blank line only',
      );
    });
  });
});

describe('buildReportContentUserPrompt()', () => {
  // ─── Regression guard: amounts are MAJOR units, never divided by 100 ────────

  describe('amount formatting (major units — regression guard for the ×100 division bug)', () => {
    it('renders totalAmount 12345.67 verbatim as "12345.67", not divided by 100', () => {
      const input = buildReportContentInput({ totalAmount: 12345.67, invoices: [] });
      const result = buildReportContentUserPrompt(input);
      expect(result).toContain('Total Amount: 12345.67 EUR');
      // Would appear if the value were erroneously divided by 100 a second time.
      expect(result).not.toContain('123.4567');
      expect(result).not.toContain('123.46');
    });

    it('renders a per-invoice amount of 999.99 verbatim as "999.99"', () => {
      const input = buildReportContentInput({
        invoices: [buildInvoice({ amount: 999.99 })],
      });
      const result = buildReportContentUserPrompt(input);
      expect(result).toContain('Amount: 999.99 EUR');
      expect(result).not.toContain('Amount: 9.9999');
      expect(result).not.toContain('Amount: 9.99 ');
    });

    it('formats a whole-number totalAmount with exactly two decimal places (1000 -> "1000.00")', () => {
      const input = buildReportContentInput({ totalAmount: 1000, invoices: [] });
      const result = buildReportContentUserPrompt(input);
      expect(result).toContain('Total Amount: 1000.00 EUR');
    });

    it('formats a whole-number per-invoice amount with exactly two decimal places', () => {
      const input = buildReportContentInput({
        invoices: [buildInvoice({ amount: 500 })],
      });
      const result = buildReportContentUserPrompt(input);
      expect(result).toContain('Amount: 500.00 EUR');
    });

    it('renders the configured currency code next to both totalAmount and per-invoice amounts', () => {
      const input = buildReportContentInput({
        totalAmount: 250,
        currency: 'CHF',
        invoices: [buildInvoice({ amount: 250 })],
      });
      const result = buildReportContentUserPrompt(input);
      expect(result).toContain('Total Amount: 250.00 CHF');
      expect(result).toContain('Amount: 250.00 CHF');
    });
  });

  // ─── Language label rendering ────────────────────────────────────────────────

  describe('language label rendering', () => {
    // #1931: buildReportContentUserPrompt previously used an inverted ternary at the old L153
    // that produced "German construction project" for 'en' and "Konstruktionsprojekt" for 'de' —
    // backwards AND wrong in both branches (the phrase describes the PROJECT DOMAIN, which is
    // always German construction regardless of output language; "Language:" is the only thing
    // that should vary). That ternary is now removed: the domain phrase is fixed literal text for
    // BOTH languages, and only the "Language:" label changes.

    it('renders "Language: English" and the fixed German-construction-project domain phrase for language "en"', () => {
      const input = buildReportContentInput({ language: 'en' });
      const result = buildReportContentUserPrompt(input);
      expect(result).toContain('Language: English');
      expect(result).toContain('German construction project');
    });

    it('renders "Language: German" and the SAME fixed domain phrase for language "de" (not translated)', () => {
      const input = buildReportContentInput({ language: 'de' });
      const result = buildReportContentUserPrompt(input);
      expect(result).toContain('Language: German');
      expect(result).toContain('German construction project');
      // Regression guard: pin the absence of the old buggy branch's output so a reintroduction of
      // the inverted ternary fails loudly instead of silently passing.
      expect(result).not.toContain('Konstruktionsprojekt');
    });
  });

  // ─── Source / report-type rendering ──────────────────────────────────────────

  describe('source and report-type rendering', () => {
    it('renders sourceName, sourceType, and reportType verbatim', () => {
      const input = buildReportContentInput({
        sourceName: 'Sparkasse Bauspardarlehen',
        sourceType: 'bank_loan',
        reportType: 'proof-of-funds',
      });
      const result = buildReportContentUserPrompt(input);
      expect(result).toContain('Source: Sparkasse Bauspardarlehen (bank_loan)');
      expect(result).toContain('Report Type: proof-of-funds');
    });
  });

  // ─── Invoice inclusion (excluded invoices absent) ────────────────────────────

  describe('invoice inclusion', () => {
    it('renders each invoice present in input.invoices by ID and vendor', () => {
      const input = buildReportContentInput({
        invoices: [
          buildInvoice({ invoiceId: 'inv-1', vendorName: 'ACME' }),
          buildInvoice({ invoiceId: 'inv-2', vendorName: 'Beta Supplies' }),
        ],
      });
      const result = buildReportContentUserPrompt(input);
      expect(result).toContain('Invoice ID: inv-1');
      expect(result).toContain('Invoice ID: inv-2');
      expect(result).toContain('Vendor: ACME');
      expect(result).toContain('Vendor: Beta Supplies');
    });

    it('does not mention an excluded invoice that is absent from input.invoices', () => {
      // The prompt builder has no exclusion logic of its own — it renders exactly what it is
      // given. Server-side exclusion filtering (invoice-level and line-level) already happened
      // upstream in reportContentGenerationService.ts before this function is ever called; this
      // test pins that contract by simply never including the "excluded" invoice in the input.
      const input = buildReportContentInput({
        invoices: [buildInvoice({ invoiceId: 'inv-included', vendorName: 'Included Vendor' })],
      });
      const result = buildReportContentUserPrompt(input);
      expect(result).not.toContain('inv-excluded');
      expect(result).not.toContain('Excluded Vendor');
    });

    it('renders "unknown" for a null invoiceNumber', () => {
      const input = buildReportContentInput({
        invoices: [buildInvoice({ invoiceNumber: null })],
      });
      const result = buildReportContentUserPrompt(input);
      expect(result).toContain('Invoice Number: unknown');
    });

    it('renders the invoice date verbatim', () => {
      const input = buildReportContentInput({
        invoices: [buildInvoice({ date: '2026-03-01' })],
      });
      const result = buildReportContentUserPrompt(input);
      expect(result).toContain('Date: 2026-03-01');
    });
  });

  // ─── Notes ────────────────────────────────────────────────────────────────────

  describe('invoice notes', () => {
    it('renders a "Notes:" line when notes is present', () => {
      const input = buildReportContentInput({
        invoices: [buildInvoice({ notes: 'Bathroom tile installation' })],
      });
      const result = buildReportContentUserPrompt(input);
      expect(result).toContain('Notes: Bathroom tile installation');
    });

    it('omits the "Notes:" line entirely when notes is null', () => {
      const input = buildReportContentInput({
        invoices: [buildInvoice({ notes: null })],
      });
      const result = buildReportContentUserPrompt(input);
      expect(result).not.toContain('Notes:');
    });
  });

  // ─── Budget lines with linked item name + description ────────────────────────

  describe('budget lines with linked item name and description', () => {
    it('joins description, linkedItemName, and linkedItemDescription with " — "', () => {
      const input = buildReportContentInput({
        invoices: [
          buildInvoice({
            budgetLines: [
              {
                description: 'Foundation work',
                linkedItemName: 'Foundation slab',
                linkedItemDescription: 'Pour the slab',
              },
            ],
          }),
        ],
      });
      const result = buildReportContentUserPrompt(input);
      expect(result).toContain('Foundation work — Foundation slab — Pour the slab');
    });

    it('omits linkedItemDescription from the joined line when it is null', () => {
      const input = buildReportContentInput({
        invoices: [
          buildInvoice({
            budgetLines: [
              { description: 'Roofing', linkedItemName: 'Roof', linkedItemDescription: null },
            ],
          }),
        ],
      });
      const result = buildReportContentUserPrompt(input);
      expect(result).toContain('Roofing — Roof');
      expect(result).not.toContain('Roofing — Roof — ');
    });

    it('renders multiple budget lines for the same invoice, each on its own "  - " line', () => {
      const input = buildReportContentInput({
        invoices: [
          buildInvoice({
            budgetLines: [
              { description: 'Line A', linkedItemName: 'Item A', linkedItemDescription: null },
              { description: 'Line B', linkedItemName: 'Item B', linkedItemDescription: null },
            ],
          }),
        ],
      });
      const result = buildReportContentUserPrompt(input);
      expect(result).toContain('\n  - Line A — Item A');
      expect(result).toContain('\n  - Line B — Item B');
    });

    it('renders "Budget lines: none" when an invoice has an empty budgetLines array', () => {
      const input = buildReportContentInput({
        invoices: [buildInvoice({ budgetLines: [] })],
      });
      const result = buildReportContentUserPrompt(input);
      expect(result).toContain('Budget lines: none');
    });

    it('renders the "Budget lines:" label (not "none") when at least one line is present', () => {
      const input = buildReportContentInput({
        invoices: [
          buildInvoice({
            budgetLines: [
              { description: 'Line A', linkedItemName: 'Item A', linkedItemDescription: null },
            ],
          }),
        ],
      });
      const result = buildReportContentUserPrompt(input);
      expect(result).toContain('Budget lines:');
      expect(result).not.toContain('Budget lines: none');
    });
  });

  // ─── Output structure / trailing instructions ────────────────────────────────

  describe('output structure', () => {
    it('returns a non-empty string', () => {
      const result = buildReportContentUserPrompt(buildReportContentInput());
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(10);
    });

    it('instructs the LLM to return letterSubject, letterBody, and descriptions', () => {
      const result = buildReportContentUserPrompt(buildReportContentInput());
      expect(result).toContain('"letterSubject"');
      expect(result).toContain('"letterBody"');
      expect(result).toContain('"descriptions"');
    });

    it('states that all invoices must appear in descriptions', () => {
      const result = buildReportContentUserPrompt(buildReportContentInput());
      expect(result).toContain('All invoices must appear in descriptions.');
    });

    it('does not throw for multiple invoices with multiple budget lines each', () => {
      const input = buildReportContentInput({
        invoices: [
          buildInvoice({
            invoiceId: 'inv-1',
            budgetLines: [
              { description: 'A', linkedItemName: 'Item A', linkedItemDescription: 'Desc A' },
              { description: 'B', linkedItemName: 'Item B', linkedItemDescription: null },
            ],
          }),
          buildInvoice({ invoiceId: 'inv-2', budgetLines: [] }),
        ],
      });
      expect(() => buildReportContentUserPrompt(input)).not.toThrow();
    });
  });
});
