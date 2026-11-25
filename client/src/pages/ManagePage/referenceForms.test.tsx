/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { ReferenceListFormRequest } from '../../components/ReferenceList/ReferenceList.js';
import type { ReferenceListItem } from '../../components/ReferenceList/ReferenceList.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import type * as HostTypes from './referenceForms.js';

// The hosts get `create` / `update` from the list, so the API clients must stay untouched.
const mockApi = jest.fn();
jest.unstable_mockModule('../../lib/budgetCategoriesApi.js', () => ({
  createBudgetCategory: mockApi,
  updateBudgetCategory: mockApi,
}));
jest.unstable_mockModule('../../lib/householdItemCategoriesApi.js', () => ({
  createHouseholdItemCategory: mockApi,
  updateHouseholdItemCategory: mockApi,
}));
jest.unstable_mockModule('../../lib/orientationApi.js', () => ({
  createOrientation: mockApi,
  updateOrientation: mockApi,
}));
jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useEntriesLanguage: () => 'en',
  useHouseName: () => ({ houseName: null, entriesLanguage: 'en' }),
}));

let Hosts: typeof HostTypes;

beforeAll(async () => {
  Hosts = await import('./referenceForms.js');
});

const ITEM: ReferenceListItem = {
  id: 'r-1',
  name: 'Test Category A',
  description: 'Notes',
  color: null,
};

describe('Project setup reference form hosts', () => {
  let media: MatchMediaControl;
  const create = jest.fn<ReferenceListFormRequest['create']>();
  const update = jest.fn<ReferenceListFormRequest['update']>();
  const onDone = jest.fn<ReferenceListFormRequest['onDone']>();
  const onCancel = jest.fn<ReferenceListFormRequest['onCancel']>();

  beforeEach(() => {
    media = installMatchMedia({ '(min-width: 768px)': true });
    mockApi.mockReset();
    create.mockReset();
    create.mockResolvedValue({ id: 'new-1' });
    update.mockReset();
    update.mockResolvedValue(undefined);
    onDone.mockReset();
    onCancel.mockReset();
  });

  afterEach(() => {
    media.restore();
  });

  const request = (over: Partial<ReferenceListFormRequest> = {}): ReferenceListFormRequest => ({
    mode: 'new',
    create,
    update,
    onDone,
    onCancel,
    returnFocusRef: createRef<HTMLElement>(),
    testId: 'list',
    ...over,
  });

  const renderHost = (Host: typeof HostTypes.CostCategoryForm, req: ReferenceListFormRequest) =>
    render(
      <MemoryRouter>
        <Host request={req} />
      </MemoryRouter>,
    );

  describe('CostCategoryForm', () => {
    it('creates through request.create with name, description and colour, and reports done', async () => {
      const user = userEvent.setup();
      renderHost(Hosts.CostCategoryForm, request());

      expect(screen.getByRole('dialog', { name: 'New cost category' })).toBeInTheDocument();
      await user.type(screen.getByTestId('cost-category-name-input'), 'Test Category A');
      await user.click(screen.getByTestId('list-save'));

      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
      expect(create.mock.calls[0]?.[0]).toEqual({
        name: 'Test Category A',
        description: null,
        color: null,
      });
      expect(onDone.mock.calls[0]?.[0]).toMatchObject({ id: 'new-1', label: 'Test Category A' });
      expect(mockApi).not.toHaveBeenCalled();
    });

    it('edit opens prefilled and an unchanged save calls neither update nor the API', async () => {
      const user = userEvent.setup();
      renderHost(Hosts.CostCategoryForm, request({ mode: 'edit', item: ITEM }));

      expect(screen.getByRole('dialog', { name: 'Edit cost category' })).toBeInTheDocument();
      expect(screen.getByTestId('cost-category-name-input')).toHaveValue('Test Category A');
      await user.click(screen.getByTestId('list-save'));

      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
      expect(update).not.toHaveBeenCalled();
      expect(mockApi).not.toHaveBeenCalled();
    });

    it('edit sends only the changed field through request.update', async () => {
      const user = userEvent.setup();
      renderHost(Hosts.CostCategoryForm, request({ mode: 'edit', item: ITEM }));

      await user.clear(screen.getByTestId('cost-category-description-input'));
      await user.type(screen.getByTestId('cost-category-description-input'), 'Other');
      await user.click(screen.getByTestId('list-save'));

      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      expect(update.mock.calls[0]).toEqual(['r-1', { description: 'Other' }]);
    });

    it('Cancel reports onCancel', async () => {
      const user = userEvent.setup();
      renderHost(Hosts.CostCategoryForm, request());

      await user.click(screen.getByTestId('list-cancel'));

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('PurchaseCategoryForm', () => {
    it('creates through request.create with name and colour only', async () => {
      const user = userEvent.setup();
      renderHost(Hosts.PurchaseCategoryForm, request());

      expect(screen.getByRole('dialog', { name: 'New purchase category' })).toBeInTheDocument();
      expect(screen.queryByTestId('purchase-category-description-input')).toBeNull();
      await user.type(screen.getByTestId('purchase-category-name-input'), 'Test Category A');
      await user.click(screen.getByTestId('list-save'));

      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
      expect(create.mock.calls[0]?.[0]).toEqual({ name: 'Test Category A', color: null });
    });

    it('edit sends only the changed name through request.update', async () => {
      const user = userEvent.setup();
      renderHost(Hosts.PurchaseCategoryForm, request({ mode: 'edit', item: ITEM }));

      expect(screen.getByRole('dialog', { name: 'Edit purchase category' })).toBeInTheDocument();
      await user.clear(screen.getByTestId('purchase-category-name-input'));
      await user.type(screen.getByTestId('purchase-category-name-input'), 'Test Category B');
      await user.click(screen.getByTestId('list-save'));

      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      expect(update.mock.calls[0]).toEqual(['r-1', { name: 'Test Category B' }]);
    });
  });

  describe('OrientationForm', () => {
    it('creates through request.create with name and description', async () => {
      const user = userEvent.setup();
      renderHost(Hosts.OrientationForm, request());

      expect(screen.getByRole('dialog', { name: 'New orientation' })).toBeInTheDocument();
      await user.type(screen.getByTestId('orientation-name-input'), 'Test Category A');
      await user.type(screen.getByTestId('orientation-description-input'), 'Faces the street');
      await user.click(screen.getByTestId('list-save'));

      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
      expect(create.mock.calls[0]?.[0]).toEqual({
        name: 'Test Category A',
        description: 'Faces the street',
      });
    });

    it('edit with no change sends nothing', async () => {
      const user = userEvent.setup();
      renderHost(Hosts.OrientationForm, request({ mode: 'edit', item: ITEM }));

      expect(screen.getByRole('dialog', { name: 'Edit orientation' })).toBeInTheDocument();
      await user.click(screen.getByTestId('list-save'));

      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
      expect(update).not.toHaveBeenCalled();
    });
  });
});
