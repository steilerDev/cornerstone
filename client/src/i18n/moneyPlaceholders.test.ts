import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * AC4 guard (#2195): a money input never ships a hard-coded US placeholder ("0.00", "1,000"),
 * and the deleted amount-placeholder keys are not referenced. Mutation: re-add
 * placeholder="0.00" to any input in client/src and the first test names the file.
 */
const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function collect(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : collect(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const files = collect(srcRoot).map((file) => ({
  rel: path.relative(srcRoot, file).split(path.sep).join('/'),
  source: fs.readFileSync(file, 'utf8'),
}));

describe('money input placeholders (AC4)', () => {
  it('scans a realistic number of production files', () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it('no production file hard-codes placeholder="0.00" or placeholder="1,000"', () => {
    const offenders = files
      .filter((f) => /placeholder=(["'{`]+)\s*(0\.00|1,000)/.test(f.source))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('no production file references the deleted amount-placeholder keys', () => {
    const offenders = files
      .filter(
        (f) => f.source.includes('placeholders.amount') || f.source.includes('amountPlaceholder'),
      )
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
});

describe('legacy status key sets are not referenced (AC3 / clean-up greps)', () => {
  const LEGACY =
    /I18N_UNION_KEYS\.(invoiceStatus|invoicesStatusLabel|invoiceDetailStatusLabel|diaryEntryType|diaryEntryTypeChip|householdItemStatus|subsidyApplicationStatus)\b/;

  it('no production file reads a removed union key set', () => {
    expect(files.filter((f) => LEGACY.test(f.source)).map((f) => f.rel)).toEqual([]);
  });

  it('no production file uses a dead global badge-<status> or status_<status> class string', () => {
    const offenders = files
      .filter((f) => /`badge-\$\{|`status_\$\{|badgeStyles\.quotation/.test(f.source))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('no production file reads a deleted status label key path', () => {
    const DELETED =
      /invoiceStatusLabels|subsidyPipeline\.statuses|gantt\.tooltip\.status|householdItems\.statuses|typeCard(Daily|SiteVisit|Delivery|Issue|GeneralNote)\b|statusOptions\.(notStarted|inProgress|completed)/;
    const offenders = files.filter((f) => DELETED.test(f.source)).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
});
