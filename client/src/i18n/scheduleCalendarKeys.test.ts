/**
 * @jest-environment node
 *
 * Story #2198 (schedule display and calendar status colours): the new `schedule` keys exist in
 * both locales with the same interpolation placeholders, and the retired keys are gone from both.
 */
import { describe, it, expect } from '@jest/globals';
import en from './en/schedule.json';
import de from './de/schedule.json';

function lookup(tree: unknown, dotted: string): unknown {
  let node: unknown = tree;
  for (const part of dotted.split('.')) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  return node;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]!).sort();
}

const NEW_KEYS = [
  'gantt.tooltip.workItem.companyLabel',
  'gantt.tooltip.workItem.waitsFor',
  'gantt.tooltip.workItem.holdsUp',
  'gantt.tooltip.householdItem.areaLabel',
  'calendar.householdItem.ariaLabelWithArea',
  'calendar.item.ariaLabelWithArea',
  'calendar.emptyState.message',
  'calendar.emptyState.description',
  'calendar.emptyState.action',
  'calendar.monthGridAriaLabel',
  'calendar.weekGridAriaLabel',
];

const CHANGED_KEYS = [
  'gantt.tooltip.milestone.blockedByThis',
  'gantt.tooltip.milestone.blockedByThisAriaLabel',
  'calendar.item.ariaLabel',
];

const DELETED_KEYS = [
  'gantt.tooltip.workItem.dependencies',
  'gantt.tooltip.householdItem.statusLabel',
];

describe('schedule namespace keys for the calendar and tooltip (#2198)', () => {
  it.each([...NEW_KEYS, ...CHANGED_KEYS])('%s exists as a non-empty string in en and de', (key) => {
    for (const tree of [en, de]) {
      const value = lookup(tree, key);
      expect(typeof value).toBe('string');
      expect((value as string).trim().length).toBeGreaterThan(0);
    }
  });

  it.each([...NEW_KEYS, ...CHANGED_KEYS])('%s keeps the same placeholders in en and de', (key) => {
    expect(placeholders(lookup(de, key) as string)).toEqual(
      placeholders(lookup(en, key) as string),
    );
  });

  it.each(DELETED_KEYS)('%s is gone from both locales', (key) => {
    expect(lookup(en, key)).toBeUndefined();
    expect(lookup(de, key)).toBeUndefined();
  });

  it('the task aria-label carries title, status, start and end', () => {
    expect(placeholders(lookup(en, 'calendar.item.ariaLabel') as string)).toEqual([
      'end',
      'start',
      'status',
      'title',
    ]);
    expect(placeholders(lookup(en, 'calendar.item.ariaLabelWithArea') as string)).toEqual([
      'area',
      'end',
      'start',
      'status',
      'title',
    ]);
  });

  it('uses the glossary words in German for the groups and the milestone list', () => {
    expect(lookup(de, 'gantt.tooltip.workItem.waitsFor')).toBe('Wartet auf');
    expect(lookup(de, 'gantt.tooltip.workItem.holdsUp')).toBe('Hält auf');
    expect(lookup(de, 'gantt.tooltip.milestone.blockedByThis')).toBe('Hält auf');
    expect(lookup(de, 'gantt.tooltip.workItem.companyLabel')).toBe('Firma');
    expect(lookup(de, 'gantt.tooltip.milestone.blockedByThisAriaLabel')).toBe(
      'Aufgaben, die dieser Meilenstein aufhält',
    );
  });

  it('no longer shows the old "Blocked by this" / "Dependencies" wording in English', () => {
    expect(lookup(en, 'gantt.tooltip.milestone.blockedByThis')).toBe('Holds up');
    expect(JSON.stringify(en)).not.toMatch(/Blocked by this|"Dependencies"/);
  });
});
