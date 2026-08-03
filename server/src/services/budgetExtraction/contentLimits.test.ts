/**
 * Unit tests for contentLimits.ts — the single source of truth for AI-generated report-content
 * length caps (#1931, AC 4.1/4.2).
 *
 * Scenario 1 pins the three cap values themselves. Scenario 2 proves the prompt text in
 * prompts.ts is DERIVED from these constants rather than carrying its own hardcoded numbers: the
 * expected substrings below are built by interpolating REPORT_CONTENT_LIMITS into the pattern,
 * never by typing "150" / "2000" / "200" as a literal. That means:
 *   - editing a value in contentLimits.ts alone cannot silently desync this test from the source
 *     of truth (the test always re-derives the value it expects to see), and
 *   - if prompts.ts ever stops importing the constant and hardcodes a number instead, this test
 *     starts asserting a value that no longer matches what's actually interpolated in place — the
 *     moment the two diverge, `toContain` on the interpolated string fails.
 */
import { describe, it, expect } from '@jest/globals';
import { REPORT_CONTENT_LIMITS } from './contentLimits.js';
import { REPORT_CONTENT_SYSTEM_PROMPT, buildReportContentUserPrompt } from './prompts.js';
import type { GenerateReportContentLlmInput } from './types.js';

describe('REPORT_CONTENT_LIMITS', () => {
  it('pins letterSubject at 150 characters', () => {
    expect(REPORT_CONTENT_LIMITS.letterSubject).toBe(150);
  });

  it('pins letterBody at 2000 characters', () => {
    expect(REPORT_CONTENT_LIMITS.letterBody).toBe(2000);
  });

  it('pins description (per-invoice) at 200 characters', () => {
    expect(REPORT_CONTENT_LIMITS.description).toBe(200);
  });
});

describe('REPORT_CONTENT_SYSTEM_PROMPT derives its stated caps from REPORT_CONTENT_LIMITS', () => {
  it('states the per-invoice description cap using REPORT_CONTENT_LIMITS.description', () => {
    expect(REPORT_CONTENT_SYSTEM_PROMPT).toContain(
      `Maximum ${REPORT_CONTENT_LIMITS.description} characters per description.`,
    );
  });

  it('states the letter subject cap using REPORT_CONTENT_LIMITS.letterSubject', () => {
    expect(REPORT_CONTENT_SYSTEM_PROMPT).toContain(
      `Letter subject: maximum ${REPORT_CONTENT_LIMITS.letterSubject} characters.`,
    );
  });

  it('states the letter body cap using REPORT_CONTENT_LIMITS.letterBody', () => {
    expect(REPORT_CONTENT_SYSTEM_PROMPT).toContain(
      `Letter body: maximum ${REPORT_CONTENT_LIMITS.letterBody} characters.`,
    );
  });
});

function buildInput(
  overrides: Partial<GenerateReportContentLlmInput> = {},
): GenerateReportContentLlmInput {
  return {
    language: 'en',
    reportType: 'claim',
    sourceName: 'Home Loan',
    sourceType: 'bank_loan',
    totalAmount: 1000,
    currency: 'EUR',
    invoices: [],
    ...overrides,
  };
}

describe('buildReportContentUserPrompt() derives its trailing reminder caps from REPORT_CONTENT_LIMITS', () => {
  it('reminds the letterSubject cap using the constant', () => {
    const result = buildReportContentUserPrompt(buildInput());
    expect(result).toContain(
      `"letterSubject": professional subject line (max ${REPORT_CONTENT_LIMITS.letterSubject} chars)`,
    );
  });

  it('reminds the letterBody cap using the constant', () => {
    const result = buildReportContentUserPrompt(buildInput());
    expect(result).toContain(
      `"letterBody": formal cover letter (max ${REPORT_CONTENT_LIMITS.letterBody} chars) summarizing the report`,
    );
  });

  it('reminds the per-invoice description cap using the constant', () => {
    const result = buildReportContentUserPrompt(buildInput());
    expect(result).toContain(`(descriptions max ${REPORT_CONTENT_LIMITS.description} chars each)`);
  });
});
