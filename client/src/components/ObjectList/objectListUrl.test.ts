import { describe, it, expect } from '@jest/globals';
import {
  ALL_CHIP,
  NO_GROUP,
  chipParamOf,
  effectiveQuery,
  normaliseListParams,
  queryKey,
  readListState,
  writeListParams,
} from './objectListUrl.js';
import type { ObjectListConfig } from './types.js';

const group = { value: 'area', label: 'Area', groupOf: () => ({ key: 'a', label: 'A' }) };

function makeConfig(over: Partial<ObjectListConfig<unknown>> = {}): ObjectListConfig<unknown> {
  return {
    listKey: 'tasks',
    testIdPrefix: 'tasks',
    chips: {
      options: [
        { value: 'open', label: 'Open' },
        { value: 'done', label: 'Done' },
      ],
      defaultValue: 'open',
    },
    groupBy: { options: [group] },
    sort: {
      options: [
        { value: 'title', label: 'Title' },
        { value: 'due', label: 'Due' },
      ],
      defaultValue: 'title',
      defaultOrder: 'asc',
    },
    filters: [
      { param: 'vendorId', label: 'Vendor', render: () => null },
      { param: 'minAmount', label: 'Amount', render: () => null },
    ],
    ...over,
  };
}

const p = (s: string) => new URLSearchParams(s);

describe('objectListUrl', () => {
  it('chipParamOf defaults to status and honours a custom param', () => {
    expect(chipParamOf(makeConfig())).toBe('status');
    expect(chipParamOf(makeConfig({ chips: { param: 'tradeId', options: [] } }))).toBe('tradeId');
    expect(chipParamOf(makeConfig({ chips: undefined }))).toBe('status');
  });

  describe('readListState', () => {
    it('O1 applies defaults when params are absent', () => {
      expect(readListState(p(''), makeConfig())).toEqual({
        q: '',
        explicitChip: null,
        group: NO_GROUP,
        sortBy: 'title',
        sortOrder: 'asc',
        isDefaultSort: true,
        filters: {},
      });
    });

    it('uses the group default value when configured', () => {
      const cfg = makeConfig({ groupBy: { options: [group], defaultValue: 'area' } });
      expect(readListState(p(''), cfg).group).toBe('area');
      expect(readListState(p('group=none'), cfg).group).toBe('none');
    });

    it('falls back to none without a groupBy config or a default value; the URL wins', () => {
      expect(readListState(p(''), makeConfig({ groupBy: undefined })).group).toBe(NO_GROUP);
      expect(readListState(p(''), makeConfig({ groupBy: { options: [group] } })).group).toBe(
        NO_GROUP,
      );
      const cfg = makeConfig({ groupBy: { options: [group], defaultValue: 'area' } });
      expect(readListState(p('group=other'), cfg).group).toBe('other');
    });

    it('treats empty q and empty chip parameters as absent', () => {
      const s = readListState(p('q=&status='), makeConfig());
      expect(s.q).toBe('');
      expect(s.explicitChip).toBeNull();
    });

    it('O2 sortBy without sortOrder is ascending; reads explicit order and filters', () => {
      const s = readListState(
        p('sortBy=due&q=tile&status=done&vendorId=v1&minAmount='),
        makeConfig(),
      );
      expect(s.sortBy).toBe('due');
      expect(s.sortOrder).toBe('asc');
      expect(s.isDefaultSort).toBe(false);
      expect(s.q).toBe('tile');
      expect(s.explicitChip).toBe('done');
      expect(s.filters).toEqual({ vendorId: 'v1' });
      expect(readListState(p('sortBy=due&sortOrder=desc'), makeConfig()).sortOrder).toBe('desc');
      expect(readListState(p('sortBy=due&sortOrder=bogus'), makeConfig()).sortOrder).toBe('asc');
    });

    it('treats the default sort key in desc as non-default and ignores chips without config', () => {
      expect(readListState(p('sortBy=title&sortOrder=desc'), makeConfig()).isDefaultSort).toBe(
        false,
      );
      const noChips = readListState(
        p('status=done'),
        makeConfig({ chips: undefined, filters: undefined }),
      );
      expect(noChips.explicitChip).toBeNull();
      expect(readListState(p('status='), makeConfig()).explicitChip).toBeNull();
    });
  });

  describe('normaliseListParams', () => {
    it('O3 removes unknown chip/group/sort values and page/pageSize, keeps others', () => {
      const next = normaliseListParams(
        p('status=zzz&group=zzz&sortBy=zzz&sortOrder=desc&page=2&pageSize=50&create=1&trades=1'),
        makeConfig(),
      );
      expect(next?.toString()).toBe('create=1&trades=1');
    });

    it('drops an invalid sortOrder alone', () => {
      expect(normaliseListParams(p('sortBy=due&sortOrder=up'), makeConfig())?.toString()).toBe(
        'sortBy=due',
      );
    });

    it('O4 returns null for a clean URL (no loop)', () => {
      expect(
        normaliseListParams(
          p('status=done&group=area&sortBy=due&sortOrder=desc&q=x&create=1'),
          makeConfig(),
        ),
      ).toBeNull();
      expect(normaliseListParams(p('status=all&group=none'), makeConfig())).toBeNull();
      expect(normaliseListParams(p(''), makeConfig())).toBeNull();
    });

    it('keeps a chip value that is only in the overflow menu, and drops other unknown values', () => {
      const cfg = makeConfig({
        chips: {
          options: [{ value: 'open', label: 'Open' }],
          overflow: { label: 'More', options: [{ value: 'tiling', label: 'Tiling' }] },
        },
      });

      expect(normaliseListParams(p('status=tiling'), cfg)).toBeNull();
      expect(normaliseListParams(p('status=gone'), cfg)?.toString()).toBe('');
    });

    it('drops an overflow value when the config has no overflow', () => {
      expect(normaliseListParams(p('status=tiling'), makeConfig())?.toString()).toBe('');
    });

    it('works without chips or group config', () => {
      const cfg = makeConfig({ chips: undefined, groupBy: undefined });
      expect(normaliseListParams(p('group=area'), cfg)?.toString()).toBe('');
      expect(normaliseListParams(p('status=whatever'), cfg)).toBeNull();
    });
  });

  describe('writeListParams', () => {
    it('writes and clears q', () => {
      expect(writeListParams(p(''), { q: 'tile' }, makeConfig()).get('q')).toBe('tile');
      expect(writeListParams(p('q=tile'), { q: '' }, makeConfig()).has('q')).toBe(false);
    });

    it('O6 writes the default chip and all explicitly; null removes; no chips config is a no-op', () => {
      expect(writeListParams(p(''), { chip: 'open' }, makeConfig()).get('status')).toBe('open');
      expect(writeListParams(p(''), { chip: ALL_CHIP }, makeConfig()).get('status')).toBe('all');
      expect(writeListParams(p('status=done'), { chip: null }, makeConfig()).has('status')).toBe(
        false,
      );
      expect(
        writeListParams(p(''), { chip: 'open' }, makeConfig({ chips: undefined })).toString(),
      ).toBe('');
    });

    it('O5 group: default removes the param, none is written when default is not none', () => {
      expect(writeListParams(p('group=area'), { group: 'none' }, makeConfig()).has('group')).toBe(
        false,
      );
      expect(writeListParams(p(''), { group: 'area' }, makeConfig()).get('group')).toBe('area');
      const cfg = makeConfig({ groupBy: { options: [group], defaultValue: 'area' } });
      expect(writeListParams(p(''), { group: 'none' }, cfg).get('group')).toBe('none');
      expect(writeListParams(p('group=none'), { group: 'area' }, cfg).has('group')).toBe(false);
      expect(
        writeListParams(p(''), { group: 'none' }, makeConfig({ groupBy: undefined })).has('group'),
      ).toBe(false);
    });

    it('O5 sort: default (or null) removes both params, others write both', () => {
      const cfg = makeConfig();
      const set = writeListParams(p(''), { sort: { value: 'due', order: 'desc' } }, cfg);
      expect(set.get('sortBy')).toBe('due');
      expect(set.get('sortOrder')).toBe('desc');
      expect(writeListParams(set, { sort: { value: 'title', order: 'asc' } }, cfg).toString()).toBe(
        '',
      );
      expect(writeListParams(set, { sort: null }, cfg).toString()).toBe('');
      expect(
        writeListParams(p(''), { sort: { value: 'title', order: 'desc' } }, cfg).get('sortOrder'),
      ).toBe('desc');
    });

    it('sets and removes filters, leaves unrelated params, does not mutate input', () => {
      const prev = p('vendorId=v1&create=1');
      const next = writeListParams(
        prev,
        { filters: { vendorId: null, minAmount: '5' } },
        makeConfig(),
      );
      expect(next.toString()).toBe('create=1&minAmount=5');
      expect(
        writeListParams(next, { filters: { minAmount: '' } }, makeConfig()).has('minAmount'),
      ).toBe(false);
      expect(prev.toString()).toBe('vendorId=v1&create=1');
    });
  });

  describe('effectiveQuery', () => {
    const base = readListState(p(''), makeConfig());

    it('O7 searching all only with a default chip, no explicit chip and q set', () => {
      const cfg = makeConfig();
      const q = effectiveQuery({ ...base, q: 'tile' }, cfg, null);
      expect(q.searchingAll).toBe(true);
      expect(q.chip).toBe('all');
      expect(effectiveQuery({ ...base, q: 'tile', explicitChip: 'done' }, cfg, null)).toMatchObject(
        { searchingAll: false, chip: 'done' },
      );
      expect(effectiveQuery(base, cfg, null)).toMatchObject({ searchingAll: false, chip: 'open' });
      const noDefault = makeConfig({ chips: { options: [{ value: 'a', label: 'A' }] } });
      expect(effectiveQuery({ ...base, q: 'x' }, noDefault, null)).toMatchObject({
        searchingAll: false,
        chip: 'all',
      });
      expect(
        effectiveQuery({ ...base, q: 'x' }, makeConfig({ chips: undefined }), 'area'),
      ).toMatchObject({ searchingAll: false, chip: 'all', serverGroup: 'area' });
    });
  });

  describe('queryKey', () => {
    it('O8 is stable under filter key order and differs when values differ', () => {
      const cfg = makeConfig();
      const s = readListState(p(''), cfg);
      const a = effectiveQuery({ ...s, filters: { vendorId: '1', minAmount: '2' } }, cfg, null);
      const b = effectiveQuery({ ...s, filters: { minAmount: '2', vendorId: '1' } }, cfg, null);
      expect(queryKey(a)).toBe(queryKey(b));
      expect(queryKey(effectiveQuery({ ...s, q: 'x' }, cfg, null))).not.toBe(queryKey(a));
      expect(queryKey(effectiveQuery(s, cfg, 'area'))).not.toBe(
        queryKey(effectiveQuery(s, cfg, null)),
      );
      expect(queryKey(effectiveQuery({ ...s, q: 'x' }, cfg, null))).not.toBe(
        queryKey(effectiveQuery({ ...s, q: 'x', explicitChip: 'all' }, cfg, null)),
      );
    });
  });
});
