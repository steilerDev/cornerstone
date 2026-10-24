/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * AC8 (#2235): the per-record budget-line UI was replaced by CostLineTable / CostLineForm. These
 * files must not come back, and nothing may import them.
 *
 * Mutation that must fail this test: re-adding any one of the files below (for example an empty
 * `components/budget/BudgetLineCard.tsx`), or importing `useBudgetSection` from any source file.
 */
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const RETIRED = [
  'BudgetLineCard',
  'BudgetLineForm',
  'BudgetSection',
  'EditBudgetLineModal',
  'InvoiceGroup',
  'InvoiceLinkModal',
  'InvoiceBudgetLinesSection',
  'BudgetLinePickerModal',
  'AutoItemizeLineCard',
  'AutoItemizeLineList',
  'MergingLineCard',
  'useBudgetSection',
  'useBudgetLinePicker',
  'ParentPicker',
  'HouseholdItemPicker',
] as const;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const FILES = walk(SRC);
const isTest = (file: string) => /\.test\.tsx?$/.test(file);

describe('retired budget-line components', () => {
  it.each(RETIRED)('has no %s source or stylesheet', (name) => {
    const found = FILES.filter((file) => {
      const base = path.basename(file);
      return (
        base === `${name}.ts` ||
        base === `${name}.tsx` ||
        base === `${name}.module.css` ||
        (base.startsWith(`${name}.`) && !isTest(file) && /\.(tsx?|css)$/.test(base))
      );
    }).map((file) => path.relative(SRC, file));
    expect(found).toEqual([]);
  });

  it('no client source imports a retired module', () => {
    const importRe = new RegExp(`from\\s+['"][^'"]*/(${RETIRED.join('|')})(\\.js)?['"]`);
    const offenders = FILES.filter((file) => /\.tsx?$/.test(file))
      .filter((file) => {
        if (isTest(file) && path.basename(file) === 'retiredComponents.test.ts') return false;
        return importRe.test(fs.readFileSync(file, 'utf8'));
      })
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it('no mocked module path points at a retired file', () => {
    const mockRe = new RegExp(
      `unstable_mockModule\\(\\s*['"][^'"]*/(${RETIRED.join('|')})(\\.js)?['"]`,
    );
    const offenders = FILES.filter((file) => isTest(file))
      .filter((file) => mockRe.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
