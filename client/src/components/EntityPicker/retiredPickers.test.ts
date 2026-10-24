/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * AC1/AC2 (#2236): entity selection goes through EntityPicker. The per-entity pickers below were
 * deleted; none of them may come back, nothing may import them, and no test may mock them.
 *
 * Mutation that must fail this test: re-adding any one of the files below (for example an empty
 * `components/TradePicker/TradePicker.tsx` or `TradePicker.module.css`), importing
 * `./AssignmentPicker.js` from any source file, or mocking one of them in a test.
 */
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const RETIRED = [
  'AreaPicker',
  'AssignmentPicker',
  'OrientationPicker',
  'TradePicker',
  'WorkItemPicker',
  'CostLineCompanyPicker',
  'CostLineTargetPicker',
  'CompanyPickerDialog',
  'TagPickerDialog',
] as const;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const FILES = walk(SRC);
const isTest = (file: string) => /\.test\.tsx?$/.test(file);
const relative = (file: string) => path.relative(SRC, file);
const GUARD = 'retiredPickers.test.ts';

describe('retired entity pickers', () => {
  it.each(RETIRED)('has no %s source, test or stylesheet', (name) => {
    const found = FILES.filter((file) => {
      const base = path.basename(file);
      return base.startsWith(`${name}.`) && /\.(tsx?|css)$/.test(base);
    }).map(relative);
    expect(found).toEqual([]);
  });

  it.each(RETIRED)('has no %s folder left behind', (name) => {
    expect(fs.existsSync(path.join(SRC, 'components', name))).toBe(false);
  });

  it('no client source or test imports a retired module', () => {
    const names = RETIRED.join('|');
    const importRe = new RegExp(`from\\s+['"][^'"]*/(${names})(\\.js)?['"]`);
    const dynamicRe = new RegExp(`import\\(\\s*['"][^'"]*/(${names})(\\.js)?['"]`);
    const offenders = FILES.filter((file) => /\.tsx?$/.test(file))
      .filter((file) => path.basename(file) !== GUARD)
      .filter((file) => {
        const source = fs.readFileSync(file, 'utf8');
        return importRe.test(source) || dynamicRe.test(source);
      })
      .map(relative);
    expect(offenders).toEqual([]);
  });

  it('no test mocks a retired module path', () => {
    const mockRe = new RegExp(
      `(unstable_mockModule|jest\\.mock)\\(\\s*['"][^'"]*/(${RETIRED.join('|')})(\\.js)?['"]`,
    );
    const offenders = FILES.filter(isTest)
      .filter((file) => path.basename(file) !== GUARD)
      .filter((file) => mockRe.test(fs.readFileSync(file, 'utf8')))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  it('is not vacuous: the walk sees the EntityPicker sources', () => {
    expect(FILES.map(relative)).toContain(
      path.join('components', 'EntityPicker', 'EntityPicker.tsx'),
    );
  });
});
