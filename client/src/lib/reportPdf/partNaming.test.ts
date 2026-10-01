/**
 * Unit tests for client/src/lib/reportPdf/partNaming.ts (#2161).
 */
import { describe, it, expect } from '@jest/globals';
import { reportBaseName, padPartNumber, partFileName } from './partNaming.js';

describe('reportBaseName', () => {
  it('builds "<useCase>-<slug>-<isoDate>" with a lower-cased, hyphenated slug', () => {
    expect(reportBaseName('claim', 'Home Loan', '2026-02-15')).toBe('claim-home-loan-2026-02-15');
  });

  it('collapses runs of whitespace into a single hyphen', () => {
    expect(reportBaseName('claim', 'Home   Loan\tBank', '2026-02-15')).toBe(
      'claim-home-loan-bank-2026-02-15',
    );
  });

  it('strips characters outside [A-Za-z0-9_-] (matches the wizard single-file slug)', () => {
    expect(reportBaseName('proof-of-funds', 'Bank & Söhne (2nd)', '2026-02-15')).toBe(
      'proof-of-funds-bank--shne-2nd-2026-02-15',
    );
  });

  it('produces exactly the single-file name the wizard builds, minus the extension', () => {
    const sourceName = 'My  Source: Loan #1';
    const slug = sourceName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]/g, '');
    expect(reportBaseName('budget-overview', sourceName, '2026-03-01')).toBe(
      `budget-overview-${slug}-2026-03-01`,
    );
  });
});

describe('padPartNumber', () => {
  it.each([
    [1, 3, '1'],
    [3, 3, '3'],
    [1, 9, '1'],
    [1, 10, '01'],
    [9, 10, '09'],
    [10, 10, '10'],
    [12, 12, '12'],
    [2, 12, '02'],
    [1, 100, '001'],
    [42, 100, '042'],
    [100, 100, '100'],
  ])('pads part %i of %i to "%s"', (k, total, expected) => {
    expect(padPartNumber(k, total)).toBe(expected);
  });
});

describe('partFileName', () => {
  it('formats "<base>-part-<k>-of-<N>.pdf" without padding for N = 3', () => {
    expect(partFileName('claim-home-loan-2026-02-15', 2, 3)).toBe(
      'claim-home-loan-2026-02-15-part-2-of-3.pdf',
    );
  });

  it('zero-pads the part number to the width of N for N = 10 and N = 12', () => {
    expect(partFileName('base', 1, 10)).toBe('base-part-01-of-10.pdf');
    expect(partFileName('base', 12, 12)).toBe('base-part-12-of-12.pdf');
  });

  it('zero-pads to three digits for N = 100', () => {
    expect(partFileName('base', 7, 100)).toBe('base-part-007-of-100.pdf');
  });
});
