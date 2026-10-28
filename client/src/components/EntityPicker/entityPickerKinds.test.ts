/**
 * @jest-environment node
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type {
  AreaResponse,
  SearchGroup,
  SearchResponse,
  SearchResultItem,
  UserResponse,
  VendorListItem,
  WorkItemSummary,
} from '@cornerstone/shared';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as SearchApiTypes from '../../lib/searchApi.js';
import type * as OrientationApiTypes from '../../lib/orientationApi.js';
import type * as TradesApiTypes from '../../lib/tradesApi.js';
import type * as CategoriesApiTypes from '../../lib/householdItemCategoriesApi.js';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as PaperlessApiTypes from '../../lib/paperlessApi.js';
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import type * as SubsidyApiTypes from '../../lib/subsidyProgramsApi.js';
import type * as Kinds from './entityPickerKinds.js';
import type { EntityOption } from './types.js';

const mockSearchCompanies = jest.fn<typeof VendorsApiTypes.searchCompanies>();
const mockSearchEverywhere = jest.fn<typeof SearchApiTypes.searchEverywhere>();
const mockFetchOrientations = jest.fn<typeof OrientationApiTypes.fetchOrientations>();
const mockFetchTrades = jest.fn<typeof TradesApiTypes.fetchTrades>();
const mockFetchCategories = jest.fn<typeof CategoriesApiTypes.fetchHouseholdItemCategories>();
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();
const mockListPaperlessDocuments = jest.fn<typeof PaperlessApiTypes.listPaperlessDocuments>();
const mockListMilestones = jest.fn<typeof MilestonesApiTypes.listMilestones>();
const mockFetchSubsidyPrograms = jest.fn<typeof SubsidyApiTypes.fetchSubsidyPrograms>();

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  searchCompanies: mockSearchCompanies,
}));
jest.unstable_mockModule('../../lib/searchApi.js', () => ({
  searchEverywhere: mockSearchEverywhere,
}));
jest.unstable_mockModule('../../lib/orientationApi.js', () => ({
  fetchOrientations: mockFetchOrientations,
}));
jest.unstable_mockModule('../../lib/tradesApi.js', () => ({ fetchTrades: mockFetchTrades }));
jest.unstable_mockModule('../../lib/householdItemCategoriesApi.js', () => ({
  fetchHouseholdItemCategories: mockFetchCategories,
}));
jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  listWorkItems: mockListWorkItems,
}));
jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  listPaperlessDocuments: mockListPaperlessDocuments,
}));
jest.unstable_mockModule('../../lib/milestonesApi.js', () => ({
  listMilestones: mockListMilestones,
}));
jest.unstable_mockModule('../../lib/subsidyProgramsApi.js', () => ({
  fetchSubsidyPrograms: mockFetchSubsidyPrograms,
}));

const signal = new AbortController().signal;
// Translates a stored key to "T:<key>" so the tests can tell a translated name from the raw one.
const translate = (key: string, options?: { defaultValue: string }) =>
  key.startsWith('trades.') ? `T:${options?.defaultValue ?? key}` : key;

function area(id: string, name: string, parentId: string | null = null): AreaResponse {
  return { id, name, parentId, sortOrder: 0 } as AreaResponse;
}

function user(id: string, displayName: string, deactivatedAt?: string): UserResponse {
  return {
    id,
    displayName,
    email: `${id}@example.com`,
    ...(deactivatedAt ? { deactivatedAt } : {}),
  } as UserResponse;
}

function company(id: string, name: string, trade: VendorListItem['trade'] = null): VendorListItem {
  return { id, name, trade } as VendorListItem;
}

function searchItem(
  id: string,
  label: string | null,
  areaPath: { id: string; name: string }[] | null = null,
): SearchResultItem {
  return {
    id,
    label,
    sublabel: null,
    matchedField: 'name',
    status: null,
    kind: null,
    date: null,
    phone: null,
    areaPath,
    parent: null,
  };
}

function response(groups: Partial<SearchGroup>[]): SearchResponse {
  return {
    query: 'q',
    groups: groups.map((g) => ({ total: 0, status: 'ok', items: [], ...g }) as SearchGroup),
  };
}

describe('entityPickerKinds', () => {
  let K: typeof Kinds;

  beforeEach(async () => {
    mockSearchCompanies.mockReset();
    mockSearchEverywhere.mockReset();
    mockFetchOrientations.mockReset();
    mockFetchTrades.mockReset();
    mockFetchCategories.mockReset();
    mockListWorkItems.mockReset();
    if (!K) K = await import('./entityPickerKinds.js');
  });

  describe('Who values', () => {
    it('encodes a member, a company or nothing', () => {
      expect(K.encodeWho({ userId: 'u-1' })).toBe('member:u-1');
      expect(K.encodeWho({ vendorId: 'v-1' })).toBe('company:v-1');
      expect(K.encodeWho({})).toBe('');
      expect(K.encodeWho({ userId: null, vendorId: null })).toBe('');
    });

    it('encodes the member when both are given, so a value never holds two ids', () => {
      expect(K.encodeWho({ userId: 'u-1', vendorId: 'v-1' })).toBe('member:u-1');
    });

    it('decodes each form back and treats anything else as nobody', () => {
      expect(K.decodeWho('member:u-1')).toEqual({ userId: 'u-1', vendorId: undefined });
      expect(K.decodeWho('company:v-1')).toEqual({ userId: undefined, vendorId: 'v-1' });
      expect(K.decodeWho('')).toEqual({ userId: undefined, vendorId: undefined });
      expect(K.decodeWho('garbage')).toEqual({ userId: undefined, vendorId: undefined });
      expect(K.decodeWho('user:u-1')).toEqual({ userId: undefined, vendorId: undefined });
    });

    it('names the group of a value', () => {
      expect(K.whoKindOf('member:u-1')).toBe('member');
      expect(K.whoKindOf('company:v-1')).toBe('company');
      expect(K.whoKindOf('')).toBeUndefined();
      expect(K.whoKindOf('nonsense')).toBeUndefined();
    });

    it('lists the two groups in display order', () => {
      expect([...K.WHO_KINDS]).toEqual(['company', 'member']);
    });
  });

  describe('itemValue and notExcluded', () => {
    it('builds the task-or-purchase value from the kind and the id', () => {
      expect(K.itemValue({ type: 'household_item', id: 'x' })).toBe('household_item:x');
      expect(K.itemValue({ type: 'work_item', id: 'y' })).toBe('work_item:y');
    });

    it('keeps an option unless its value is excluded', () => {
      const option: EntityOption = { id: 'a', label: 'A' };
      expect(K.notExcluded(option, [])).toBe(true);
      expect(K.notExcluded(option, ['b'])).toBe(true);
      expect(K.notExcluded(option, ['b', 'a'])).toBe(false);
    });
  });

  describe('company', () => {
    it('maps a company to an option with its translated trade as the secondary line', () => {
      const trade = { id: 't-1', name: 'Roofing', translationKey: 'trades.roofing', color: null };

      expect(K.companyOption(company('v-1', 'Acme', trade as never), translate, false)).toEqual({
        id: 'v-1',
        label: 'Acme',
        secondary: 'T:Roofing',
        group: undefined,
        entityId: 'v-1',
      });
    });

    it('uses the stored trade name when the trade has no translation key', () => {
      const trade = { id: 't-1', name: 'Custom trade', translationKey: null, color: null };

      expect(
        K.companyOption(company('v-1', 'Acme', trade as never), translate, false).secondary,
      ).toBe('Custom trade');
    });

    it('has no secondary line without a trade', () => {
      expect(K.companyOption(company('v-2', 'Birch'), translate, false).secondary).toBeUndefined();
    });

    it('encodes the id and sets the company group when it stands in a Who picker', () => {
      expect(K.companyOption(company('v-1', 'Acme'), translate, true)).toMatchObject({
        id: 'company:v-1',
        group: 'company',
        entityId: 'v-1',
      });
    });

    it('searches companies on the server with the query and the signal', async () => {
      mockSearchCompanies.mockResolvedValue([company('v-1', 'Acme'), company('v-2', 'Birch')]);

      const options = await K.searchCompanyOptions('ac', signal, translate, false);

      expect(mockSearchCompanies).toHaveBeenCalledWith('ac', signal);
      expect(options.map((o) => o.id)).toEqual(['v-1', 'v-2']);
    });
  });

  describe('who', () => {
    const USERS = [
      user('u-1', 'Zoë Keller'),
      user('u-2', 'Ben Albrecht'),
      user('u-3', 'Old Timer', '2024-06-01T00:00:00Z'),
    ];

    it('lists companies first, then the members', async () => {
      mockSearchCompanies.mockResolvedValue([company('v-1', 'Acme Roofing')]);

      const options = await K.searchWhoOptions('', signal, USERS, translate);

      expect(options.map((o) => [o.id, o.group])).toEqual([
        ['company:v-1', 'company'],
        ['member:u-1', 'member'],
        ['member:u-2', 'member'],
      ]);
      expect(options.at(1)?.entityId).toBe('u-1');
    });

    it('never lists a deactivated member', async () => {
      mockSearchCompanies.mockResolvedValue([]);

      const options = await K.searchWhoOptions('', signal, USERS, translate);

      expect(options.map((o) => o.label)).not.toContain('Old Timer');
    });

    it('filters members with folding (case and umlauts) and sends the query to the company search', async () => {
      mockSearchCompanies.mockResolvedValue([]);

      const options = await K.searchWhoOptions('zoe', signal, USERS, translate);

      expect(mockSearchCompanies).toHaveBeenCalledWith('zoe', signal);
      expect(options.map((o) => o.label)).toEqual(['Zoë Keller']);
    });

    it('returns no members when nobody matches', async () => {
      mockSearchCompanies.mockResolvedValue([]);

      expect(await K.searchWhoOptions('zzz', signal, USERS, translate)).toEqual([]);
    });
  });

  describe('area', () => {
    const AREAS = [
      area('a-1', 'Ground floor'),
      area('a-2', 'Hallway', 'a-1'),
      area('a-3', 'Closet', 'a-2'),
      area('a-4', 'Garden'),
    ];

    it('joins a path with the › separator', () => {
      expect(K.AREA_PATH_SEPARATOR).toBe(' › ');
      expect(
        K.pathText([
          { id: 'a-1', name: 'Ground floor' },
          { id: 'a-2', name: 'Hallway' },
        ]),
      ).toBe('Ground floor › Hallway');
      expect(K.pathText([])).toBe('');
    });

    it('builds the root-first path of an area, the area itself included', () => {
      expect(K.areaPathSegments(AREAS, 'a-3')).toEqual([
        { id: 'a-1', name: 'Ground floor' },
        { id: 'a-2', name: 'Hallway' },
        { id: 'a-3', name: 'Closet' },
      ]);
      expect(K.areaPathSegments(AREAS, 'a-4')).toEqual([{ id: 'a-4', name: 'Garden' }]);
    });

    it('gives an empty path for an unknown area and ends the walk at a missing parent', () => {
      expect(K.areaPathSegments(AREAS, 'nope')).toEqual([]);
      expect(K.areaPathSegments([area('o', 'Orphan', 'gone')], 'o')).toEqual([
        { id: 'o', name: 'Orphan' },
      ]);
    });

    it('ends the walk at a cyclic parent chain instead of looping', () => {
      const cyclic = [area('x', 'X', 'y'), area('y', 'Y', 'x')];

      expect(K.areaPathSegments(cyclic, 'x')).toEqual([
        { id: 'y', name: 'Y' },
        { id: 'x', name: 'X' },
      ]);
    });

    it('searches the server from two letters and keeps the full path (ancestors then the area)', async () => {
      mockSearchEverywhere.mockResolvedValue(
        response([
          {
            type: 'area',
            items: [
              searchItem('a-2', 'Hallway', [
                { id: 'a-1', name: 'Ground floor' },
                { id: 'a-2', name: 'Hallway' },
              ]),
            ],
          },
        ]),
      );

      const options = await K.searchAreaOptions('  hall ', signal, AREAS);

      expect(mockSearchEverywhere).toHaveBeenCalledWith(
        { q: 'hall', types: ['area'], limit: 20 },
        signal,
      );
      expect(options).toEqual([
        {
          id: 'a-2',
          label: 'Hallway',
          path: [
            { id: 'a-1', name: 'Ground floor' },
            { id: 'a-2', name: 'Hallway' },
          ],
        },
        {
          id: 'a-3',
          label: 'Closet',
          path: [
            { id: 'a-1', name: 'Ground floor' },
            { id: 'a-2', name: 'Hallway' },
            { id: 'a-3', name: 'Closet' },
          ],
        },
      ]);
    });

    it('lists every nested descendant of a match in tree order', async () => {
      mockSearchEverywhere.mockResolvedValue(
        response([
          {
            type: 'area',
            items: [searchItem('a-1', 'Ground floor', [{ id: 'a-1', name: 'Ground floor' }])],
          },
        ]),
      );

      const options = await K.searchAreaOptions('ground', signal, AREAS);

      expect(options.map((option) => option.id)).toEqual(['a-1', 'a-2', 'a-3']);
      expect(options[2]?.path).toEqual([
        { id: 'a-1', name: 'Ground floor' },
        { id: 'a-2', name: 'Hallway' },
        { id: 'a-3', name: 'Closet' },
      ]);
    });

    it('lists a descendant once when the server also matched it, at its first position', async () => {
      mockSearchEverywhere.mockResolvedValue(
        response([
          {
            type: 'area',
            items: [
              searchItem('a-1', 'Ground floor', [{ id: 'a-1', name: 'Ground floor' }]),
              searchItem('a-3', 'Closet', [
                { id: 'a-1', name: 'Ground floor' },
                { id: 'a-2', name: 'Hallway' },
                { id: 'a-3', name: 'Closet' },
              ]),
              searchItem('a-4', 'Garden', [{ id: 'a-4', name: 'Garden' }]),
            ],
          },
        ]),
      );

      const options = await K.searchAreaOptions('floor', signal, AREAS);

      expect(options.map((option) => option.id)).toEqual(['a-1', 'a-2', 'a-3', 'a-4']);
    });

    it('adds nothing for a match without children or one missing from the loaded tree', async () => {
      mockSearchEverywhere.mockResolvedValue(
        response([
          {
            type: 'area',
            items: [
              searchItem('a-4', 'Garden', [{ id: 'a-4', name: 'Garden' }]),
              searchItem('zz', 'Unloaded', [{ id: 'zz', name: 'Unloaded' }]),
            ],
          },
        ]),
      );

      const options = await K.searchAreaOptions('ga', signal, AREAS);

      expect(options.map((option) => option.id)).toEqual(['a-4', 'zz']);
    });

    it('appends the area itself when the server path lists only its ancestors', async () => {
      mockSearchEverywhere.mockResolvedValue(
        response([
          {
            type: 'area',
            items: [searchItem('a-3', 'Closet', [{ id: 'a-1', name: 'Ground floor' }])],
          },
        ]),
      );

      const [option] = await K.searchAreaOptions('closet', signal, AREAS);

      expect(option?.path).toEqual([
        { id: 'a-1', name: 'Ground floor' },
        { id: 'a-3', name: 'Closet' },
      ]);
    });

    it('treats a top-level hit without a path, or without a label, as the area alone', async () => {
      mockSearchEverywhere.mockResolvedValue(
        response([{ type: 'area', items: [searchItem('a-4', 'Garden'), searchItem('a-5', null)] }]),
      );

      const options = await K.searchAreaOptions('ga', signal, AREAS);

      expect(options).toEqual([
        { id: 'a-4', label: 'Garden', path: [{ id: 'a-4', name: 'Garden' }] },
        { id: 'a-5', label: '', path: [{ id: 'a-5', name: '' }] },
      ]);
    });

    it('ignores groups of other types in the server answer', async () => {
      mockSearchEverywhere.mockResolvedValue(
        response([
          { type: 'work_item', items: [searchItem('w-1', 'Paint')] },
          { type: 'area', items: [searchItem('a-4', 'Garden')] },
        ]),
      );

      const options = await K.searchAreaOptions('ga', signal, AREAS);

      expect(options.map((o) => o.id)).toEqual(['a-4']);
    });

    it('filters the loaded tree on the client below the server minimum (one letter)', async () => {
      const options = await K.searchAreaOptions('g', signal, AREAS);

      expect(mockSearchEverywhere).not.toHaveBeenCalled();
      expect(options.map((o) => o.label)).toEqual(['Garden', 'Ground floor']);
      expect(options[1]?.path).toEqual([{ id: 'a-1', name: 'Ground floor' }]);
    });

    it('lists the whole tree depth-first (by sort order, then name) for an empty query, with root-first paths', async () => {
      const options = await K.searchAreaOptions('   ', signal, AREAS);

      expect(mockSearchEverywhere).not.toHaveBeenCalled();
      expect(options.map((o) => K.pathText(o.path ?? []))).toEqual([
        'Garden',
        'Ground floor',
        'Ground floor › Hallway',
        'Ground floor › Hallway › Closet',
      ]);
    });

    it('lets the client filter match a nested area and show its path', async () => {
      const options = await K.searchAreaOptions('Ü', signal, [
        area('p', 'Büro'),
        area('c', 'Küche', 'p'),
      ]);

      expect(options.map((o) => K.pathText(o.path ?? []))).toEqual(['Büro', 'Büro › Küche']);
    });
  });

  describe('orientation', () => {
    it('fetches all orientations without a search for an empty query', async () => {
      mockFetchOrientations.mockResolvedValue({
        orientations: [{ id: 'o-1', name: 'North', description: 'Faces the street' }],
      } as never);

      const options = await K.searchOrientationOptions('   ');

      expect(mockFetchOrientations).toHaveBeenCalledWith(undefined);
      expect(options).toEqual([{ id: 'o-1', label: 'North', secondary: 'Faces the street' }]);
    });

    it('sends the trimmed query as the search parameter', async () => {
      mockFetchOrientations.mockResolvedValue({
        orientations: [{ id: 'o-2', name: 'South', description: null }],
      } as never);

      const options = await K.searchOrientationOptions('  sou ');

      expect(mockFetchOrientations).toHaveBeenCalledWith({ search: 'sou' });
      expect(options).toEqual([{ id: 'o-2', label: 'South', secondary: undefined }]);
    });
  });

  describe('trade and category (filtered on the client)', () => {
    it('loads trades with the translated name as the label and the stored name kept', async () => {
      mockFetchTrades.mockResolvedValue({
        trades: [
          { id: 't-1', name: 'Roofing', translationKey: 'trades.roofing' },
          { id: 't-2', name: 'Custom', translationKey: null },
        ],
      } as never);

      const entries = await K.loadTradeEntries(translate);

      expect(entries).toEqual([
        { option: { id: 't-1', label: 'T:Roofing' }, rawName: 'Roofing' },
        { option: { id: 't-2', label: 'Custom' }, rawName: 'Custom' },
      ]);
    });

    it('loads purchase categories the same way', async () => {
      mockFetchCategories.mockResolvedValue({
        categories: [{ id: 'c-1', name: 'Furniture', translationKey: 'trades.furniture' }],
      } as never);

      const entries = await K.loadCategoryEntries(translate);

      expect(entries).toEqual([
        { option: { id: 'c-1', label: 'T:Furniture' }, rawName: 'Furniture' },
      ]);
    });

    const ENTRIES: Kinds.NamedEntry[] = [
      { option: { id: 't-1', label: 'Dachdecker' }, rawName: 'Roofing' },
      { option: { id: 't-2', label: 'Fliesenleger' }, rawName: 'Tiling' },
      { option: { id: 't-3', label: 'Elektro Müller' }, rawName: 'Electrical' },
    ];

    it('matches the translated name', () => {
      expect(K.filterNamedEntries(ENTRIES, 'dach').map((o) => o.id)).toEqual(['t-1']);
    });

    it('matches the stored name too, so English text finds a translated default', () => {
      expect(K.filterNamedEntries(ENTRIES, 'roof').map((o) => o.id)).toEqual(['t-1']);
    });

    it('folds case and umlauts', () => {
      expect(K.filterNamedEntries(ENTRIES, 'MULLER').map((o) => o.id)).toEqual(['t-3']);
    });

    it('returns everything for an empty query and nothing for no match', () => {
      expect(K.filterNamedEntries(ENTRIES, '')).toHaveLength(3);
      expect(K.filterNamedEntries(ENTRIES, 'zzz')).toEqual([]);
    });
  });

  describe('task', () => {
    const item = (over: Partial<WorkItemSummary>): WorkItemSummary =>
      ({ id: 'w-1', title: 'Lay floors', status: 'in_progress', area: null, ...over }) as never;

    it('lists tasks with the status word as the trailing text and the area path as the secondary path', async () => {
      mockListWorkItems.mockResolvedValue({
        items: [
          item({
            area: {
              id: 'a-3',
              name: 'Kitchen',
              ancestors: [{ id: 'a-1', name: 'House' }],
            } as never,
          }),
          item({ id: 'w-2', title: 'Paint', status: 'not_started' }),
        ],
      } as never);

      const options = await K.searchTaskOptions('  fl ', (status) => `S:${status}`);

      expect(mockListWorkItems).toHaveBeenCalledWith({ q: 'fl', pageSize: 15 });
      expect(options).toEqual([
        {
          id: 'w-1',
          label: 'Lay floors',
          secondaryPath: [
            { id: 'a-1', name: 'House' },
            { id: 'a-3', name: 'Kitchen' },
          ],
          trailing: 'S:in_progress',
        },
        { id: 'w-2', label: 'Paint', secondaryPath: undefined, trailing: 'S:not_started' },
      ]);
    });

    it('sends no q for an empty query', async () => {
      mockListWorkItems.mockResolvedValue({ items: [] } as never);

      await K.searchTaskOptions('  ', (s) => s);

      expect(mockListWorkItems).toHaveBeenCalledWith({ q: undefined, pageSize: 15 });
    });
  });

  describe('taskOrPurchase', () => {
    const WORDS = { task: 'Task', purchase: 'Purchase' };

    it('offers nothing and does not search below the minimum length', async () => {
      expect(await K.searchTaskOrPurchaseOptions('f', signal, WORDS)).toEqual([]);
      expect(await K.searchTaskOrPurchaseOptions('  f  ', signal, WORDS)).toEqual([]);
      expect(mockSearchEverywhere).not.toHaveBeenCalled();
    });

    it('lists tasks and purchases with encoded values, kind words and area paths, skipping other kinds', async () => {
      mockSearchEverywhere.mockResolvedValue(
        response([
          {
            type: 'work_item',
            items: [
              searchItem('wi-1', 'Lay floors', [
                { id: 'a1', name: 'House' },
                { id: 'a2', name: 'Kitchen' },
              ]),
              searchItem('wi-2', null),
            ],
          },
          { type: 'household_item', items: [searchItem('hi-1', 'Floor lamp')] },
          { type: 'invoice', items: [searchItem('inv-1', 'Ignored invoice')] },
        ]),
      );

      const options = await K.searchTaskOrPurchaseOptions(' fl ', signal, WORDS);

      expect(mockSearchEverywhere).toHaveBeenCalledWith(
        { q: 'fl', types: ['work_item', 'household_item'], limit: 10 },
        signal,
      );
      expect(options).toEqual([
        {
          id: 'work_item:wi-1',
          label: 'Lay floors',
          itemType: 'work_item',
          entityId: 'wi-1',
          kindWord: 'Task',
          secondaryPath: [
            { id: 'a1', name: 'House' },
            { id: 'a2', name: 'Kitchen' },
          ],
        },
        {
          id: 'work_item:wi-2',
          label: '',
          itemType: 'work_item',
          entityId: 'wi-2',
          kindWord: 'Task',
          secondaryPath: undefined,
        },
        {
          id: 'household_item:hi-1',
          label: 'Floor lamp',
          itemType: 'household_item',
          entityId: 'hi-1',
          kindWord: 'Purchase',
          secondaryPath: undefined,
        },
      ]);
    });
  });

  describe('parseItemValue', () => {
    it.each([
      ['work_item:wi-1', { type: 'work_item', id: 'wi-1' }],
      ['household_item:hi-1', { type: 'household_item', id: 'hi-1' }],
      ['work_item:a:b', { type: 'work_item', id: 'a:b' }],
    ])('reads %s', (value, expected) => {
      expect(K.parseItemValue(value)).toEqual(expected);
    });

    it.each(['', 'work_item:', 'household_item:', 'vendor:v-1', 'wi-1', 'work_item'])(
      'returns null for %p',
      (value) => {
        expect(K.parseItemValue(value)).toBeNull();
      },
    );

    it('is the inverse of itemValue', () => {
      const target = { type: 'household_item', id: 'hi-9' } as const;
      expect(K.parseItemValue(K.itemValue(target))).toEqual(target);
    });
  });

  describe('searchDocumentOptions', () => {
    const doc = (id: number, correspondent: string | null, created: string | null) => ({
      id,
      title: `Doc ${id}`,
      correspondent,
      created,
    });
    const respond = (...documents: ReturnType<typeof doc>[]) =>
      mockListPaperlessDocuments.mockResolvedValue({ documents } as never);
    const dateText = (iso: string) => `D(${iso})`;

    beforeEach(() => {
      mockListPaperlessDocuments.mockReset();
    });

    it('asks for the newest documents when the query is empty', async () => {
      respond();
      await K.searchDocumentOptions('', new Set(), dateText);
      expect(mockListPaperlessDocuments).toHaveBeenCalledWith({
        pageSize: 25,
        sortBy: 'created',
        sortOrder: 'desc',
      });
    });

    it('treats a blank query as empty', async () => {
      respond();
      await K.searchDocumentOptions('   ', new Set(), dateText);
      expect(mockListPaperlessDocuments).toHaveBeenCalledWith({
        pageSize: 25,
        sortBy: 'created',
        sortOrder: 'desc',
      });
    });

    it('sends a trimmed query and no sort', async () => {
      respond();
      await K.searchDocumentOptions('  roof ', new Set(), dateText);
      expect(mockListPaperlessDocuments).toHaveBeenCalledWith({ query: 'roof', pageSize: 25 });
    });

    it('filters out linked ids and maps the rest', async () => {
      respond(doc(1, 'Acme', '2026-04-02'), doc(2, null, null), doc(3, 'Birch', null));
      const result = await K.searchDocumentOptions('', new Set([2]), dateText);
      expect(result.map((o) => o.id)).toEqual(['1', '3']);
      expect(result[0]).toEqual({
        id: '1',
        label: 'Doc 1',
        entityId: '1',
        secondary: 'Acme · D(2026-04-02)',
        document: { title: 'Doc 1', correspondent: 'Acme', created: '2026-04-02' },
      });
    });

    it.each([
      ['both', 'Acme', '2026-04-02', 'Acme · D(2026-04-02)'],
      ['the correspondent only', 'Acme', null, 'Acme'],
      ['the date only', null, '2026-04-02', 'D(2026-04-02)'],
      ['neither', null, null, undefined],
    ])('builds the second line from %s', async (_name, correspondent, created, expected) => {
      respond(doc(1, correspondent, created));
      const [option] = await K.searchDocumentOptions('', new Set(), dateText);
      expect(option?.secondary).toBe(expected);
    });
  });

  describe('milestone and grant options (#2248)', () => {
    it('maps every milestone to an option with its formatted target date as the second line', async () => {
      mockListMilestones.mockResolvedValue([
        { id: 4, title: 'Roof closed', targetDate: '2026-05-01' },
        { id: 9, title: 'Shell finished', targetDate: '2026-07-15' },
      ] as never);
      const formatDate = jest.fn((iso: string) => `D:${iso}`);

      const options = await K.loadMilestoneOptions(formatDate);

      expect(options).toEqual([
        { id: '4', label: 'Roof closed', secondary: 'D:2026-05-01' },
        { id: '9', label: 'Shell finished', secondary: 'D:2026-07-15' },
      ]);
    });

    it('maps every grant (subsidy program) to an option named by the grant', async () => {
      mockFetchSubsidyPrograms.mockResolvedValue({
        subsidyPrograms: [
          { id: 'sp-1', name: 'Energy grant' },
          { id: 'sp-2', name: 'Heat pump grant' },
        ],
      } as never);

      expect(await K.loadGrantOptions()).toEqual([
        { id: 'sp-1', label: 'Energy grant' },
        { id: 'sp-2', label: 'Heat pump grant' },
      ]);
    });

    it('lets a failed load reject, so the caller can retry', async () => {
      mockFetchSubsidyPrograms.mockRejectedValue(new Error('down'));
      await expect(K.loadGrantOptions()).rejects.toThrow('down');
      mockListMilestones.mockRejectedValue(new Error('down'));
      await expect(K.loadMilestoneOptions((iso) => iso)).rejects.toThrow('down');
    });

    describe('filterOptionsByLabel', () => {
      const options: EntityOption[] = [
        { id: '1', label: 'Förderung Dach' },
        { id: '2', label: 'Heat pump grant' },
        { id: '3', label: 'Energy grant' },
      ];

      it('keeps the options whose label contains the query, in order', () => {
        expect(K.filterOptionsByLabel(options, 'grant').map((o) => o.id)).toEqual(['2', '3']);
      });

      it('folds case and diacritics on both sides', () => {
        expect(K.filterOptionsByLabel(options, 'FORDERUNG').map((o) => o.id)).toEqual(['1']);
        expect(K.filterOptionsByLabel(options, 'förderung dach').map((o) => o.id)).toEqual(['1']);
        expect(K.filterOptionsByLabel(options, 'HEAT').map((o) => o.id)).toEqual(['2']);
      });

      it('returns every option for an empty query and none when nothing matches', () => {
        expect(K.filterOptionsByLabel(options, '')).toHaveLength(3);
        expect(K.filterOptionsByLabel(options, 'zzz')).toEqual([]);
      });
    });
  });

  describe('kinds', () => {
    it('lists the eleven kinds', () => {
      expect([...K.ENTITY_PICKER_KINDS]).toEqual([
        'company',
        'who',
        'area',
        'orientation',
        'trade',
        'category',
        'task',
        'taskOrPurchase',
        'document',
        'milestone',
        'grant',
      ]);
    });

    it('creates in place only the four tag kinds', () => {
      expect([...K.ENTITY_CREATE_KINDS]).toEqual(['area', 'orientation', 'trade', 'category']);
    });
  });
});
