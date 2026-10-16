import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import type {
  BudgetCategory,
  HouseholdItemCategoryEntity,
  OrientationResponse,
} from '@cornerstone/shared';
import type * as AdapterTypes from './referenceListAdapters.js';

const budgetApi = {
  fetchBudgetCategories: jest.fn<() => Promise<{ categories: BudgetCategory[] }>>(),
  createBudgetCategory: jest.fn<(data: unknown) => Promise<BudgetCategory>>(),
  updateBudgetCategory: jest.fn<(id: string, data: unknown) => Promise<BudgetCategory>>(),
  deleteBudgetCategory: jest.fn<(id: string) => Promise<void>>(),
  reorderBudgetCategories: jest.fn<(ids: string[]) => Promise<BudgetCategory[]>>(),
};
jest.unstable_mockModule('../../lib/budgetCategoriesApi.js', () => budgetApi);

const householdApi = {
  fetchHouseholdItemCategories:
    jest.fn<() => Promise<{ categories: HouseholdItemCategoryEntity[] }>>(),
  createHouseholdItemCategory: jest.fn<(data: unknown) => Promise<HouseholdItemCategoryEntity>>(),
  updateHouseholdItemCategory:
    jest.fn<(id: string, data: unknown) => Promise<HouseholdItemCategoryEntity>>(),
  deleteHouseholdItemCategory: jest.fn<(id: string) => Promise<void>>(),
  reorderHouseholdItemCategories:
    jest.fn<(ids: string[]) => Promise<HouseholdItemCategoryEntity[]>>(),
};
jest.unstable_mockModule('../../lib/householdItemCategoriesApi.js', () => householdApi);

const orientationApi = {
  fetchOrientations: jest.fn<() => Promise<{ orientations: OrientationResponse[] }>>(),
  createOrientation: jest.fn<(data: unknown) => Promise<OrientationResponse>>(),
  updateOrientation: jest.fn<(id: string, data: unknown) => Promise<OrientationResponse>>(),
  deleteOrientation: jest.fn<(id: string) => Promise<void>>(),
  reorderOrientations: jest.fn<(ids: string[]) => Promise<OrientationResponse[]>>(),
};
jest.unstable_mockModule('../../lib/orientationApi.js', () => orientationApi);

let adapters: typeof AdapterTypes;

beforeAll(async () => {
  adapters = await import('./referenceListAdapters.js');
});

const STAMP = '2026-01-01T00:00:00.000Z';
const budgetRow = (over: Partial<BudgetCategory> = {}): BudgetCategory => ({
  id: 'bc-1',
  name: 'Tiles',
  description: 'Floor and wall',
  color: '#112233',
  translationKey: null,
  sortOrder: 0,
  createdAt: STAMP,
  updatedAt: STAMP,
  ...over,
});
const householdRow = (
  over: Partial<HouseholdItemCategoryEntity> = {},
): HouseholdItemCategoryEntity => ({
  id: 'hc-1',
  name: 'Lamps',
  color: '#445566',
  translationKey: null,
  sortOrder: 0,
  createdAt: STAMP,
  updatedAt: STAMP,
  ...over,
});
const orientationRow = (over: Partial<OrientationResponse> = {}): OrientationResponse => ({
  id: 'or-1',
  name: 'North view',
  description: 'Faces the street',
  sortOrder: 0,
  createdAt: STAMP,
  updatedAt: STAMP,
  ...over,
});

beforeEach(() => {
  for (const api of [budgetApi, householdApi, orientationApi]) {
    for (const fn of Object.values(api)) fn.mockReset();
  }
});

describe('costCategoryAdapter', () => {
  it('lists the categories array from the response', async () => {
    budgetApi.fetchBudgetCategories.mockResolvedValue({ categories: [budgetRow()] });

    await expect(adapters.costCategoryAdapter.list()).resolves.toEqual([budgetRow()]);
  });

  it('passes name, description and colour through to create', async () => {
    budgetApi.createBudgetCategory.mockResolvedValue(budgetRow());
    const values = { name: 'Tiles', description: 'x', color: null };

    await adapters.costCategoryAdapter.create(values);

    expect(budgetApi.createBudgetCategory).toHaveBeenCalledWith(values);
  });

  it('passes the changes through to update', async () => {
    budgetApi.updateBudgetCategory.mockResolvedValue(budgetRow());

    await adapters.costCategoryAdapter.update('bc-1', { description: null });

    expect(budgetApi.updateBudgetCategory).toHaveBeenCalledWith('bc-1', { description: null });
  });

  it('deletes and reorders through the budget category API', async () => {
    budgetApi.deleteBudgetCategory.mockResolvedValue(undefined);
    budgetApi.reorderBudgetCategories.mockResolvedValue([budgetRow()]);

    await adapters.costCategoryAdapter.remove('bc-1');
    const rows = await adapters.costCategoryAdapter.reorder(['bc-1']);

    expect(budgetApi.deleteBudgetCategory).toHaveBeenCalledWith('bc-1');
    expect(budgetApi.reorderBudgetCategories).toHaveBeenCalledWith(['bc-1']);
    expect(rows).toEqual([budgetRow()]);
  });
});

describe('purchaseCategoryAdapter', () => {
  it('lists the categories array from the response', async () => {
    householdApi.fetchHouseholdItemCategories.mockResolvedValue({ categories: [householdRow()] });

    await expect(adapters.purchaseCategoryAdapter.list()).resolves.toEqual([householdRow()]);
  });

  it('creates with name and colour only (no description)', async () => {
    householdApi.createHouseholdItemCategory.mockResolvedValue(householdRow());

    await adapters.purchaseCategoryAdapter.create({
      name: 'Lamps',
      color: '#445566',
      description: 'ignored',
    });

    expect(householdApi.createHouseholdItemCategory).toHaveBeenCalledWith({
      name: 'Lamps',
      color: '#445566',
    });
  });

  it('updates only the fields present in the changes', async () => {
    householdApi.updateHouseholdItemCategory.mockResolvedValue(householdRow());

    await adapters.purchaseCategoryAdapter.update('hc-1', { name: 'Lights' });
    await adapters.purchaseCategoryAdapter.update('hc-1', { color: null });
    await adapters.purchaseCategoryAdapter.update('hc-1', { description: 'ignored' });

    expect(householdApi.updateHouseholdItemCategory.mock.calls).toEqual([
      ['hc-1', { name: 'Lights' }],
      ['hc-1', { color: null }],
      ['hc-1', {}],
    ]);
  });

  it('deletes and reorders through the household category API', async () => {
    householdApi.deleteHouseholdItemCategory.mockResolvedValue(undefined);
    householdApi.reorderHouseholdItemCategories.mockResolvedValue([householdRow()]);

    await adapters.purchaseCategoryAdapter.remove('hc-1');
    await adapters.purchaseCategoryAdapter.reorder(['hc-1']);

    expect(householdApi.deleteHouseholdItemCategory).toHaveBeenCalledWith('hc-1');
    expect(householdApi.reorderHouseholdItemCategories).toHaveBeenCalledWith(['hc-1']);
  });
});

describe('orientationAdapter', () => {
  it('lists the orientations array from the response', async () => {
    orientationApi.fetchOrientations.mockResolvedValue({ orientations: [orientationRow()] });

    await expect(adapters.orientationAdapter.list()).resolves.toEqual([orientationRow()]);
  });

  it('creates with name and description only (no colour)', async () => {
    orientationApi.createOrientation.mockResolvedValue(orientationRow());

    await adapters.orientationAdapter.create({
      name: 'North view',
      description: 'Faces the street',
      color: '#fff',
    });

    expect(orientationApi.createOrientation).toHaveBeenCalledWith({
      name: 'North view',
      description: 'Faces the street',
    });
  });

  it('updates only the fields present in the changes', async () => {
    orientationApi.updateOrientation.mockResolvedValue(orientationRow());

    await adapters.orientationAdapter.update('or-1', { description: null });
    await adapters.orientationAdapter.update('or-1', { name: 'East' });
    await adapters.orientationAdapter.update('or-1', { color: '#fff' });

    expect(orientationApi.updateOrientation.mock.calls).toEqual([
      ['or-1', { description: null }],
      ['or-1', { name: 'East' }],
      ['or-1', {}],
    ]);
  });

  it('deletes and reorders through the orientation API', async () => {
    orientationApi.deleteOrientation.mockResolvedValue(undefined);
    orientationApi.reorderOrientations.mockResolvedValue([orientationRow()]);

    await adapters.orientationAdapter.remove('or-1');
    await adapters.orientationAdapter.reorder(['or-1']);

    expect(orientationApi.deleteOrientation).toHaveBeenCalledWith('or-1');
    expect(orientationApi.reorderOrientations).toHaveBeenCalledWith(['or-1']);
  });
});

describe('row to item mapping', () => {
  const t = (key: string, options?: { defaultValue: string }) =>
    key === 'categories.materials' ? 'Materialien' : (options?.defaultValue ?? key);

  it('shows a user cost category as typed and not translated', () => {
    expect(adapters.toCostCategoryItem(budgetRow(), t)).toEqual({
      id: 'bc-1',
      name: 'Tiles',
      translated: false,
      description: 'Floor and wall',
      color: '#112233',
    });
  });

  it('translates a built-in cost category and flags it translated', () => {
    const item = adapters.toCostCategoryItem(
      budgetRow({ name: 'Materials', translationKey: 'categories.materials' }),
      t,
    );

    expect(item.name).toBe('Materialien');
    expect(item.translated).toBe(true);
  });

  it('keeps the stored name when a translation key has no translation', () => {
    const item = adapters.toCostCategoryItem(
      budgetRow({ name: 'Stored', translationKey: 'categories.unknown' }),
      t,
    );

    expect(item.name).toBe('Stored');
    expect(item.translated).toBe(true);
  });

  it('maps a purchase category without a description', () => {
    expect(adapters.toPurchaseCategoryItem(householdRow(), t)).toEqual({
      id: 'hc-1',
      name: 'Lamps',
      translated: false,
      color: '#445566',
    });
  });

  it('translates a built-in purchase category', () => {
    const item = adapters.toPurchaseCategoryItem(
      householdRow({ name: 'Materials', translationKey: 'categories.materials' }),
      t,
    );

    expect(item.name).toBe('Materialien');
    expect(item.translated).toBe(true);
  });

  it('maps an orientation with name and description and never translated', () => {
    expect(adapters.toOrientationItem(orientationRow())).toEqual({
      id: 'or-1',
      name: 'North view',
      description: 'Faces the street',
    });
  });
});
