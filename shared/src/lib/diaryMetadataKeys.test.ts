import { describe, it, expect } from '@jest/globals';
import { DIARY_TYPE_METADATA_KEYS, droppedMetadataKeys } from './diaryMetadataKeys.js';
import {
  DIARY_WEATHERS,
  DIARY_INSPECTION_OUTCOMES,
  DIARY_ISSUE_SEVERITIES,
} from '../types/diary.js';

describe('DIARY_TYPE_METADATA_KEYS', () => {
  it('equals the contract table', () => {
    expect(DIARY_TYPE_METADATA_KEYS).toEqual({
      daily_log: [
        'weather',
        'temperatureCelsius',
        'workersOnSite',
        'vendorId',
        'workStart',
        'workEnd',
        'signatures',
      ],
      site_visit: ['inspectorName', 'outcome', 'workStart', 'workEnd', 'signatures'],
      delivery: ['vendor', 'materials', 'deliveryConfirmed'],
      issue: ['severity', 'resolutionStatus', 'signatures'],
      general_note: [],
    });
  });
});

describe('option tuples', () => {
  it.each([
    ['DIARY_WEATHERS', DIARY_WEATHERS],
    ['DIARY_INSPECTION_OUTCOMES', DIARY_INSPECTION_OUTCOMES],
    ['DIARY_ISSUE_SEVERITIES', DIARY_ISSUE_SEVERITIES],
  ])('%s is a non-empty list of unique strings', (_name, tuple) => {
    expect(tuple.length).toBeGreaterThan(0);
    expect(new Set(tuple).size).toBe(tuple.length);
  });
});

describe('droppedMetadataKeys', () => {
  it('returns [] for null, undefined and empty metadata', () => {
    expect(droppedMetadataKeys(null, 'issue')).toEqual([]);
    expect(droppedMetadataKeys(undefined, 'issue')).toEqual([]);
    expect(droppedMetadataKeys({}, 'issue')).toEqual([]);
  });

  it('lists keys the target type does not keep, in object order', () => {
    const md = { workStart: '08:00', weather: 'sunny', severity: 'minor', workEnd: '09:00' };
    expect(droppedMetadataKeys(md, 'delivery')).toEqual([
      'workStart',
      'weather',
      'severity',
      'workEnd',
    ]);
  });

  it('keeps keys shared between the types', () => {
    const md = { workStart: '08:00', signatures: [], weather: 'sunny' };
    expect(droppedMetadataKeys(md, 'site_visit')).toEqual(['weather']);
  });

  it('skips null and undefined values but keeps falsy non-null ones', () => {
    const md = { weather: null, temperatureCelsius: undefined, workersOnSite: 0, vendorId: '' };
    expect(droppedMetadataKeys(md, 'issue')).toEqual(['workersOnSite', 'vendorId']);
  });

  it('never reports vendorName', () => {
    expect(droppedMetadataKeys({ vendorName: 'Acme', weather: 'x' }, 'issue')).toEqual(['weather']);
  });

  it('general_note drops every populated key', () => {
    const md = { severity: 'major', vendor: 'A', signatures: [{}] };
    expect(droppedMetadataKeys(md, 'general_note')).toEqual(['severity', 'vendor', 'signatures']);
  });

  it('returns [] when everything is kept', () => {
    expect(droppedMetadataKeys({ severity: 'major', resolutionStatus: 'open' }, 'issue')).toEqual(
      [],
    );
  });
});
