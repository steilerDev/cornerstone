import { describe, it, expect } from '@jest/globals';
import type { AreaResponse } from '@cornerstone/shared';
import {
  floorOf,
  floorVendorsFromWorkItems,
  rankCompanies,
  recentTimes,
  recentTitles,
} from './captureSuggestions.js';

type Entry = Parameters<typeof rankCompanies>[0][number];

function log(title: string, vendorId: string | null, vendorName: string | null): Entry {
  return {
    title,
    entryType: 'daily_log',
    metadata: vendorId ? { vendorId, vendorName } : {},
  } as unknown as Entry;
}

function delivery(title: string, vendor: string | null): Entry {
  return { title, entryType: 'delivery', metadata: { vendor } } as unknown as Entry;
}

function area(id: string, parentId: string | null): AreaResponse {
  return {
    id,
    name: id,
    parentId,
    color: null,
    description: null,
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
  };
}

describe('recentTitles', () => {
  it('returns distinct non-empty titles, newest first, folding case and accents', () => {
    const titles = recentTitles([
      { title: 'Screed' },
      { title: '  screed ' },
      { title: '' },
      { title: null as unknown as string },
      { title: 'Électricité' },
      { title: 'electricite' },
      { title: 'Roof' },
    ]);

    expect(titles).toEqual(['Screed', 'Électricité', 'Roof']);
  });

  it('stops at six titles', () => {
    const entries = Array.from({ length: 9 }, (_, i) => ({ title: `Title ${i}` }));

    expect(recentTitles(entries)).toHaveLength(6);
    expect(recentTitles(entries)[0]).toBe('Title 0');
  });
});

describe('floorVendorsFromWorkItems', () => {
  it('counts work items per company and sorts most work first', () => {
    const vendor = (id: string) => ({ assignedVendor: { id, name: `Company ${id}` } });

    const result = floorVendorsFromWorkItems([
      vendor('a'),
      vendor('b'),
      vendor('b'),
      { assignedVendor: null },
    ] as never);

    expect(result).toEqual([
      { id: 'b', name: 'Company b' },
      { id: 'a', name: 'Company a' },
    ]);
  });
});

describe('rankCompanies', () => {
  const floor = [
    { id: 'f1', name: 'Floor One' },
    { id: 'f2', name: 'Floor Two' },
  ];

  it('puts companies used on same-title entries first, by count then recency', () => {
    const entries = [
      log('Screed', 'c1', 'Alpha'),
      log('Screed', 'c2', 'Beta'),
      log('Screed', 'c2', 'Beta'),
      log('Other', 'c3', 'Gamma'),
    ];

    const result = rankCompanies(entries, ' screed ', floor, { requireId: true });

    expect(result.map((c) => c.id)).toEqual(['c2', 'c1', 'f1', 'f2']);
  });

  it('breaks count ties by the newest entry', () => {
    const entries = [log('Screed', 'c1', 'Alpha'), log('Screed', 'c2', 'Beta')];

    const result = rankCompanies(entries, 'Screed', [], { requireId: true });

    expect(result.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('matches delivery vendor names to a known company by fold, else keeps the name', () => {
    const entries = [delivery('Bricks', 'ALPHA'), delivery('Bricks', 'Unknown Ltd')];
    const known = [{ id: 'c1', name: 'Alpha' }];

    const withNames = rankCompanies(entries, 'Bricks', known, { requireId: false });
    const idOnly = rankCompanies(entries, 'Bricks', known, { requireId: true });

    expect(withNames).toEqual([
      { id: 'c1', name: 'Alpha' },
      { id: null, name: 'Unknown Ltd' },
    ]);
    expect(idOnly).toEqual([{ id: 'c1', name: 'Alpha' }]);
  });

  it('resolves a delivery vendor through a daily log company of the same name', () => {
    const entries = [delivery('Bricks', 'beta'), log('Other', 'c2', 'Beta')];

    const result = rankCompanies(entries, 'Bricks', [], { requireId: true });

    expect(result).toEqual([{ id: 'c2', name: 'Beta' }]);
  });

  it('ignores entries without metadata, without a vendor or of other types', () => {
    const entries = [
      { title: 'Screed', entryType: 'daily_log', metadata: null },
      { title: 'Screed', entryType: 'issue', metadata: { vendorId: 'x', vendorName: 'X' } },
      log('Screed', null, null),
      delivery('Screed', '  '),
      { title: null, entryType: 'daily_log', metadata: { vendorId: 'y', vendorName: 'Y' } },
    ] as unknown as Entry[];

    expect(rankCompanies(entries, 'Screed', [], { requireId: false })).toEqual([]);
  });

  it('offers only the floor companies when the title is empty', () => {
    const entries = [log('', 'c1', 'Alpha')];

    expect(rankCompanies(entries, '  ', floor, { requireId: true })).toEqual(floor);
  });

  it('deduplicates across the groups and stops at four', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, name: `F${i}` }));
    const entries = [log('Screed', 'f0', 'F0')];

    const result = rankCompanies(entries, 'Screed', many, { requireId: true });

    expect(result.map((c) => c.id)).toEqual(['f0', 'f1', 'f2', 'f3']);
  });
});

describe('recentTimes', () => {
  const entry = (entryType: string, workStart?: string, workEnd?: string): Entry =>
    ({ entryType, metadata: { workStart, workEnd } }) as unknown as Entry;

  it('returns up to three distinct values from daily logs and site visits', () => {
    const entries = [
      entry('daily_log', '07:00'),
      entry('delivery', '09:00'),
      entry('site_visit', '07:00'),
      entry('daily_log', undefined),
      entry('site_visit', '08:00'),
      entry('daily_log', '07:30'),
      entry('daily_log', '10:00'),
      { entryType: 'daily_log', metadata: null } as unknown as Entry,
    ];

    expect(recentTimes(entries, 'workStart')).toEqual(['07:00', '08:00', '07:30']);
  });

  it('reads the end time with the end key', () => {
    expect(recentTimes([entry('daily_log', '07:00', '16:00')], 'workEnd')).toEqual(['16:00']);
  });
});

describe('floorOf', () => {
  const several = [
    area('ground', null),
    area('upper', null),
    area('kitchen', 'ground'),
    area('pantry', 'kitchen'),
  ];
  const single = [area('house', null), area('ground', 'house'), area('kitchen', 'ground')];

  it('returns the root ancestor when the household has several roots', () => {
    expect(floorOf('pantry', several)).toBe('ground');
    expect(floorOf('ground', several)).toBe('ground');
    expect(floorOf('upper', several)).toBe('upper');
  });

  it('returns the ancestor one level below the only root', () => {
    expect(floorOf('kitchen', single)).toBe('ground');
    expect(floorOf('ground', single)).toBe('ground');
  });

  it('returns the area itself for the only root', () => {
    expect(floorOf('house', single)).toBe('house');
  });

  it('returns null without an area or for an unknown id', () => {
    expect(floorOf(null, several)).toBeNull();
    expect(floorOf('missing', several)).toBeNull();
  });

  it('survives a parent cycle', () => {
    const cyclic = [area('a', 'b'), area('b', 'a'), area('r', null)];

    expect(floorOf('a', cyclic)).toBe('a');
  });
});
