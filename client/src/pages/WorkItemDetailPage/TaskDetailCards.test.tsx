/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { UserResponse, WorkItemPageDetail } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { makeTaskPage } from '../../test/taskPageFixtures.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';
import type { UseAreasResult } from '../../hooks/useAreas.js';
import type { SectionCardController } from '../../components/SectionCard/SectionCard.js';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as SearchApiTypes from '../../lib/searchApi.js';
import type * as CardsModule from './TaskDetailCards.js';
import type * as ScopeModule from '../../components/SectionCard/SectionCardScope.js';

const mockUpdateWorkItem = jest.fn<typeof WorkItemsApiTypes.updateWorkItem>();
const mockSearchCompanies = jest.fn<typeof VendorsApiTypes.searchCompanies>();
const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();
const mockSearchEverywhere = jest.fn<typeof SearchApiTypes.searchEverywhere>();
const mockUseAreas = jest.fn<() => UseAreasResult>();

jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  updateWorkItem: mockUpdateWorkItem,
  listWorkItems: jest.fn(),
}));
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  searchCompanies: mockSearchCompanies,
  fetchVendor: mockFetchVendor,
}));
jest.unstable_mockModule('../../lib/searchApi.js', () => ({
  searchEverywhere: mockSearchEverywhere,
}));
jest.unstable_mockModule('../../hooks/useAreas.js', () => ({ useAreas: mockUseAreas }));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let Cards: typeof CardsModule;
let Scope: typeof ScopeModule;

const onSaved = jest.fn<() => Promise<void>>();
const onRetryUsers = jest.fn<() => void>();

const USERS = [
  { id: 'u-1', displayName: 'Pat Sample', email: 'pat@example.test' } as UserResponse,
  { id: 'u-2', displayName: 'Alex Example', email: 'alex@example.test' } as UserResponse,
];
const AREA = { id: 'a-1', name: 'Kitchen', color: null, ancestors: [] };

function renderCards(
  task: WorkItemPageDetail,
  extras: { usersFailure?: FetchFailure | null; refs?: boolean } = {},
) {
  const detailsRef = createRef<SectionCardController>();
  const whoWhereRef = createRef<SectionCardController>();
  const view = render(
    <MemoryRouter>
      <Scope.SectionCardScope>
        <Cards.TaskDetailCards
          task={task}
          users={USERS}
          usersFailure={extras.usersFailure ?? null}
          onRetryUsers={onRetryUsers}
          onSaved={onSaved}
          detailsCardRef={detailsRef}
          whoWhereCardRef={whoWhereRef}
        />
      </Scope.SectionCardScope>
    </MemoryRouter>,
  );
  return { ...view, detailsRef, whoWhereRef };
}

const TASK = makeTaskPage({ title: 'Pour slab', description: 'Use the fast mix.' });

async function edit(testId: string) {
  const user = userEvent.setup();
  await user.click(screen.getByTestId(`${testId}-edit`));
  return user;
}

describe('TaskDetailCards', () => {
  beforeEach(async () => {
    for (const mock of [
      mockUpdateWorkItem,
      mockSearchCompanies,
      mockFetchVendor,
      mockSearchEverywhere,
      onSaved,
      onRetryUsers,
    ]) {
      mock.mockReset();
    }
    mockUpdateWorkItem.mockResolvedValue({} as never);
    mockSearchCompanies.mockResolvedValue([] as never);
    mockFetchVendor.mockResolvedValue({ id: 'v-1', name: 'Acme Roofing' } as never);
    mockSearchEverywhere.mockResolvedValue({ query: '', groups: [] });
    mockUseAreas.mockReturnValue({
      areas: [
        { id: 'a-1', name: 'Kitchen', parentId: null, sortOrder: 0 },
        { id: 'a-2', name: 'Garden', parentId: null, sortOrder: 1 },
      ],
      isLoading: false,
      error: null,
    } as unknown as UseAreasResult);
    onSaved.mockResolvedValue(undefined);
    if (!Cards) {
      Cards = await import('./TaskDetailCards.js');
      Scope = await import('../../components/SectionCard/SectionCardScope.js');
    }
  });

  describe('Details (read)', () => {
    it('shows the description text', () => {
      renderCards(TASK);
      expect(screen.getByTestId('task-detail-description')).toHaveTextContent('Use the fast mix.');
    });

    it('says there is no description yet when empty', () => {
      renderCards(makeTaskPage({ description: null }));
      expect(screen.getByTestId('task-detail-description')).toHaveTextContent('No description yet');
    });
  });

  describe('Details (edit)', () => {
    it('opens with the title and description and focuses the title', async () => {
      renderCards(TASK);
      await edit('section-task-details');
      expect(screen.getByTestId('task-field-title')).toHaveValue('Pour slab');
      expect(screen.getByTestId('task-field-description')).toHaveValue('Use the fast mix.');
      expect(screen.getByTestId('task-field-title')).toHaveFocus();
    });

    it('opens through the controller ref (the e shortcut)', async () => {
      const { detailsRef } = renderCards(TASK);
      act(() => detailsRef.current!.startEdit());
      expect(await screen.findByTestId('task-field-title')).toBeInTheDocument();
    });

    it('saves only the changed title, trimmed, and refreshes the page', async () => {
      renderCards(TASK);
      const user = await edit('section-task-details');
      await user.clear(screen.getByTestId('task-field-title'));
      await user.type(screen.getByTestId('task-field-title'), '  Pour the slab  ');
      await user.click(screen.getByTestId('section-task-details-save'));
      await waitFor(() =>
        expect(mockUpdateWorkItem).toHaveBeenCalledWith('wi-1', { title: 'Pour the slab' }),
      );
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    it('saves only the changed description, and an emptied one as null', async () => {
      renderCards(TASK);
      const user = await edit('section-task-details');
      await user.clear(screen.getByTestId('task-field-description'));
      await user.click(screen.getByTestId('section-task-details-save'));
      await waitFor(() =>
        expect(mockUpdateWorkItem).toHaveBeenCalledWith('wi-1', { description: null }),
      );
    });

    it('saves a new description trimmed', async () => {
      renderCards(makeTaskPage({ description: null }));
      const user = await edit('section-task-details');
      await user.type(screen.getByTestId('task-field-description'), ' Cure for 7 days ');
      await user.click(screen.getByTestId('section-task-details-save'));
      await waitFor(() =>
        expect(mockUpdateWorkItem).toHaveBeenCalledWith('wi-1', {
          description: 'Cure for 7 days',
        }),
      );
    });

    it('requires a title and sends nothing', async () => {
      renderCards(TASK);
      const user = await edit('section-task-details');
      await user.clear(screen.getByTestId('task-field-title'));
      await user.click(screen.getByTestId('section-task-details-save'));
      expect(await screen.findByText('Enter a title.')).toBeInTheDocument();
      expect(screen.getByTestId('task-field-title')).toHaveAttribute('aria-invalid', 'true');
      expect(mockUpdateWorkItem).not.toHaveBeenCalled();
    });

    it('shows the translated server error and keeps the editor open', async () => {
      mockUpdateWorkItem.mockRejectedValueOnce(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
      );
      renderCards(TASK);
      const user = await edit('section-task-details');
      await user.type(screen.getByTestId('task-field-title'), '!');
      await user.click(screen.getByTestId('section-task-details-save'));
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByTestId('task-field-title')).toBeInTheDocument();
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('shows the fallback message for a network failure', async () => {
      mockUpdateWorkItem.mockRejectedValueOnce(new Error('down'));
      renderCards(TASK);
      const user = await edit('section-task-details');
      await user.type(screen.getByTestId('task-field-title'), '!');
      await user.click(screen.getByTestId('section-task-details-save'));
      expect(await screen.findByRole('alert')).toHaveTextContent(/.+/);
    });

    it('discarding resets the draft and the error', async () => {
      mockUpdateWorkItem.mockRejectedValueOnce(new Error('down'));
      renderCards(TASK);
      const user = await edit('section-task-details');
      await user.type(screen.getByTestId('task-field-title'), '!');
      await user.click(screen.getByTestId('section-task-details-save'));
      await screen.findByRole('alert');
      await user.click(screen.getByTestId('section-task-details-cancel'));
      await user.click(await screen.findByTestId('section-task-details-discard-confirm'));
      await user.click(screen.getByTestId('section-task-details-edit'));
      expect(screen.getByTestId('task-field-title')).toHaveValue('Pour slab');
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('Who and where (read)', () => {
    it('shows Not set for both without a company or area', () => {
      renderCards(TASK);
      expect(screen.getByTestId('task-detail-who')).toHaveTextContent('Not set');
      expect(screen.getByTestId('task-detail-area')).toHaveTextContent('Not set');
    });

    it('shows the company with a Call button when it has a phone, and the area', () => {
      renderCards(
        makeTaskPage({
          assignedVendor: { id: 'v-1', name: 'Acme Roofing', trade: null, phone: '+49 30 123' },
          area: AREA,
        } as Partial<WorkItemPageDetail>),
      );
      expect(screen.getByTestId('task-detail-who')).toHaveTextContent('Acme Roofing');
      expect(screen.getByRole('link', { name: /Call/ })).toHaveAttribute('href', 'tel:+4930123');
      expect(screen.getByTestId('task-detail-area')).toHaveTextContent('Kitchen');
    });

    it('shows a company without a phone and a member without a Call button', () => {
      const { unmount } = renderCards(
        makeTaskPage({
          assignedVendor: { id: 'v-1', name: 'Acme Roofing', trade: null, phone: null },
        }),
      );
      expect(screen.getByTestId('task-detail-who')).toHaveTextContent('Acme Roofing');
      expect(screen.queryByRole('link', { name: /Call/ })).toBeNull();
      unmount();
      renderCards(
        makeTaskPage({
          assignedUser: { id: 'u-1', displayName: 'Pat Sample', email: 'pat@example.test' },
        }),
      );
      expect(screen.getByTestId('task-detail-who')).toHaveTextContent('Pat Sample');
      expect(screen.queryByRole('link', { name: /Call/ })).toBeNull();
    });
  });

  describe('Who and where (edit)', () => {
    it('opens through the controller ref (the strip Who fact)', async () => {
      const { whoWhereRef } = renderCards(TASK);
      act(() => whoWhereRef.current!.startEdit());
      expect(await screen.findByLabelText('Who')).toBeInTheDocument();
    });

    it('assigns a member: sends the user and clears the company', async () => {
      renderCards(TASK);
      const user = await edit('section-task-who-where');
      await user.click(screen.getByLabelText('Who'));
      await user.click(await screen.findByRole('option', { name: /Pat Sample/ }));
      await user.click(screen.getByTestId('section-task-who-where-save'));
      await waitFor(() =>
        expect(mockUpdateWorkItem).toHaveBeenCalledWith('wi-1', {
          assignedUserId: 'u-1',
          assignedVendorId: null,
        }),
      );
      expect(onSaved).toHaveBeenCalled();
    });

    it('assigns a company: sends the vendor and clears the member', async () => {
      mockSearchCompanies.mockResolvedValue([
        { id: 'v-7', name: 'Birch Tiling', trade: null },
      ] as never);
      renderCards(TASK);
      const user = await edit('section-task-who-where');
      await user.click(screen.getByLabelText('Who'));
      await user.click(await screen.findByRole('option', { name: /Birch Tiling/ }));
      await user.click(screen.getByTestId('section-task-who-where-save'));
      await waitFor(() =>
        expect(mockUpdateWorkItem).toHaveBeenCalledWith('wi-1', {
          assignedUserId: null,
          assignedVendorId: 'v-7',
        }),
      );
    });

    it('picks an area and sends only the area', async () => {
      renderCards(TASK);
      const user = await edit('section-task-who-where');
      await user.click(screen.getByLabelText('Area'));
      await user.click(await screen.findByRole('option', { name: /Garden/ }));
      await user.click(screen.getByTestId('section-task-who-where-save'));
      await waitFor(() =>
        expect(mockUpdateWorkItem).toHaveBeenCalledWith('wi-1', { areaId: 'a-2' }),
      );
    });

    it('clears the area by choosing "No area" and sends null', async () => {
      renderCards(makeTaskPage({ area: AREA } as Partial<WorkItemPageDetail>));
      const user = await edit('section-task-who-where');
      await user.click(screen.getByRole('button', { name: /Clear selection/ }));
      await user.click(screen.getByLabelText('Area'));
      await user.click(await screen.findByRole('option', { name: /No area/ }));
      await user.click(screen.getByTestId('section-task-who-where-save'));
      await waitFor(() =>
        expect(mockUpdateWorkItem).toHaveBeenCalledWith('wi-1', { areaId: null }),
      );
    });

    it('shows the translated server error', async () => {
      mockUpdateWorkItem.mockRejectedValueOnce(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
      );
      renderCards(TASK);
      const user = await edit('section-task-who-where');
      await user.click(screen.getByLabelText('Area'));
      await user.click(await screen.findByRole('option', { name: /Garden/ }));
      await user.click(screen.getByTestId('section-task-who-where-save'));
      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    it('shows no users error when the members loaded', async () => {
      renderCards(TASK);
      await edit('section-task-who-where');
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    });

    it('shows a members load failure with Retry that asks the page to load them again', async () => {
      renderCards(TASK, { usersFailure: { kind: 'other' } });
      await edit('section-task-who-where');
      expect(screen.getByRole('alert')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Retry|Try again/ }));
      expect(onRetryUsers).toHaveBeenCalledTimes(1);
    });

    it('translates an API failure of the members load', async () => {
      renderCards(TASK, { usersFailure: { kind: 'api', code: 'NOT_FOUND', notFound: false } });
      await edit('section-task-who-where');
      expect(screen.getByRole('alert')).toHaveTextContent(/.+/);
    });
  });
});
