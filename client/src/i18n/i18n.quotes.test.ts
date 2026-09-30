import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const deDir = path.join(dirname, 'de');
const deFiles = fs
  .readdirSync(deDir)
  .filter((f) => f.endsWith('.json'))
  .sort();

const OPEN = '„'; // „
const CLOSE = '“'; // “

function readDe(file: string): string {
  return fs.readFileSync(path.join(deDir, file), 'utf-8');
}

function leaves(value: unknown, prefix: string, out: Array<[string, string]>): void {
  if (typeof value === 'string') {
    out.push([prefix, value]);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      leaves(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
}

function allLeaves(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const file of deFiles) {
    leaves(JSON.parse(readDe(file)), file, out);
  }
  return out;
}

function count(text: string, ch: string): number {
  return text.split(ch).length - 1;
}

describe('German locale quotation marks', () => {
  it('finds de locale files to check', () => {
    expect(deFiles.length).toBeGreaterThan(0);
  });

  it('AC2: opening and closing German quotes are balanced across all de files and present', () => {
    const raw = deFiles.map(readDe).join('\n');
    const opens = count(raw, OPEN);
    expect(opens).toBeGreaterThan(0);
    expect(opens).toBe(count(raw, CLOSE));
  });

  it('AC1: no translated string contains an ASCII double quote', () => {
    const offenders = allLeaves()
      .filter(([, v]) => v.includes('"'))
      .map(([k]) => k);
    expect(offenders).toEqual([]);
  });

  it('every string alternates „ and “ with equal counts', () => {
    const offenders: string[] = [];
    for (const [key, value] of allLeaves()) {
      const marks = [...value].filter((c) => c === OPEN || c === CLOSE);
      const ok =
        marks.length % 2 === 0 && marks.every((c, i) => c === (i % 2 === 0 ? OPEN : CLOSE));
      if (!ok) offenders.push(`${key}: ${value}`);
    }
    expect(offenders).toEqual([]);
  });

  it('AC3: usageHiddenAttachmentsWarning quotes the translated "usage" column name', () => {
    const budget = JSON.parse(readDe('budget.json')) as {
      sourceReports: {
        editable: { usageHiddenAttachmentsWarning: string };
        table: { usage: string };
      };
    };
    const { usageHiddenAttachmentsWarning } = budget.sourceReports.editable;
    expect(usageHiddenAttachmentsWarning).toContain(
      `${OPEN}${budget.sourceReports.table.usage}${CLOSE}`,
    );
  });
});
