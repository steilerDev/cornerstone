/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ObjectListFilterDef } from '../../components/ObjectList/types.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { makeSearchCompanies } from '../../test/companySearchMock.js';
import type * as UsersApiTypes from '../../lib/usersApi.js';
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as FiltersModule from './TaskListFilters.js';

const mockListUsers = jest.fn<typeof UsersApiTypes.listUsers>();
const mockListMilestones = jest.fn<typeof MilestonesApiTypes.listMilestones>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();
let areasError: string | null = null;

jest.unstable_mockModule('../../lib/usersApi.js', () => ({ listUsers: mockListUsers }));
jest.unstable_mockModule('../../lib/milestonesApi.js', () => ({
  listMilestones: mockListMilestones,
}));
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  searchCompanies: makeSearchCompanies(mockFetchVendors),
  fetchVendor: mockFetchVendor,
}));
jest.unstable_mockModule('../../lib/searchApi.js', () => ({
  searchEverywhere: jest.fn(() => Promise.resolve({ results: [] })),
}));
jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: () => ({
    areas: [
      { id: 'a-1', name: 'Ground floor', parentId: null, sortOrder: 0 },
      { id: 'a-3', name: 'Kitchen', parentId: 'a-1', sortOrder: 0 },
    ],
    isLoading: false,
    error: areasError,
    refetch: jest.fn(),
  }),
}));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    vatRate: 0.19,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

let useTaskListFilters: typeof FiltersModule.useTaskListFilters;

type Writes = Array<[string, string | null]>;

function Panel({ initial, writes }: { initial: Record<string, string>; writes: Writes }) {
  const defs: readonly ObjectListFilterDef[] = useTaskListFilters();
  const [values, setValues] = useState(initial);
  return (
    <div>
      {defs.map((def) => (
        <fieldset key={def.param} data-testid={`def-${def.param}`}>
          {def.render({
            id: `f-${def.param}`,
            value: values[def.param] ?? null,
            onChange: (value) => {
              writes.push([def.param, value]);
              setValues((v) => {
                const next = { ...v };
                if (value === null) delete next[def.param];
                else next[def.param] = value;
                return next;
              });
            },
          })}
        </fieldset>
      ))}
    </div>
  );
}

function renderPanel(initial: Record<string, string> = {}) {
  const writes: Writes = [];
  render(<Panel initial={initial} writes={writes} />);
  return writes;
}

const user = (id: string, displayName: string, deactivatedAt: string | null = null) =>
  ({ id, displayName, deactivatedAt }) as never;

beforeEach(async () => {
  if (!useTaskListFilters) ({ useTaskListFilters } = await import('./TaskListFilters.js'));
  areasError = null;
  mockListUsers.mockReset();
  mockListUsers.mockResolvedValue({
    users: [user('u-1', 'Sam Example'), user('u-2', 'Old Timer', '2025-01-01T00:00:00Z')],
  } as never);
  mockListMilestones.mockReset();
  mockListMilestones.mockResolvedValue([
    { id: 7, title: 'Roof closed' },
    { id: 9, title: 'Move in' },
  ] as never);
  mockFetchVendors.mockReset();
  mockFetchVendors.mockResolvedValue({
    vendors: [],
    pagination: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0 },
  });
  mockFetchVendor.mockReset();
  mockFetchVendor.mockRejectedValue(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }));
});

describe('the defs', () => {
  it('are Area, Company, Household member, Milestone, two date ranges and Cost lines, in panel order', async () => {
    const writes: Writes = [];
    function Probe() {
      const defs = useTaskListFilters();
      writes.push(...defs.map((d) => [d.param, d.label] as [string, string]));
      return null;
    }
    render(<Probe />);
    expect(writes.slice(0, 7)).toEqual([
      ['areaId', 'Area'],
      ['assignedVendorId', 'Company'],
      ['assignedUserId', 'Household member'],
      ['milestoneId', 'Milestone'],
      ['startDate', 'Start date'],
      ['endDate', 'End date'],
      ['budgetLines', 'Cost lines'],
    ]);
  });

  it('Company and Household member share the Who fieldset', () => {
    function Probe() {
      const defs = useTaskListFilters();
      const who = defs.filter((d) => d.fieldset);
      expect(who.map((d) => d.param)).toEqual(['assignedVendorId', 'assignedUserId']);
      expect(who[0]!.fieldset).toEqual(who[1]!.fieldset);
      expect(who[0]!.fieldset!.legend).toBe('Who');
      return null;
    }
    render(<Probe />);
  });
});

describe('household member', () => {
  it('lists the active members, writes the pick and clears with Anyone', async () => {
    const writes = renderPanel();
    const select = (await screen.findByTestId('tasks-filter-member')) as HTMLSelectElement;
    await waitFor(() =>
      expect(within(select).getByRole('option', { name: 'Sam Example' })).toBeInTheDocument(),
    );
    expect(within(select).queryByRole('option', { name: 'Old Timer' })).toBeNull();
    expect(within(select).getByRole('option', { name: 'Anyone' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'u-1' } });
    expect(writes.at(-1)).toEqual(['assignedUserId', 'u-1']);
    await waitFor(() => expect(select.value).toBe('u-1'));
    fireEvent.change(select, { target: { value: '' } });
    expect(writes.at(-1)).toEqual(['assignedUserId', null]);
  });

  it('shows a field error when the members cannot be loaded', async () => {
    mockListUsers.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
    );
    renderPanel();
    const field = (await screen.findByTestId('tasks-filter-member')).parentElement!;
    expect(
      await within(field).findByText('An unexpected error occurred. Please try again.'),
    ).toBeInTheDocument();
  });

  it('uses the generic text for a failure that is not an API error', async () => {
    mockListUsers.mockRejectedValue(new Error('offline'));
    renderPanel();
    const field = (await screen.findByTestId('tasks-filter-member')).parentElement!;
    expect(await within(field).findByText("Couldn't load the choices.")).toBeInTheDocument();
  });
});

describe('milestone', () => {
  it('lists the milestones, writes the id and clears with Any milestone', async () => {
    const writes = renderPanel({ milestoneId: '9' });
    const select = (await screen.findByTestId('tasks-filter-milestone')) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('9'));
    expect(within(select).getByRole('option', { name: 'Roof closed' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: '7' } });
    expect(writes.at(-1)).toEqual(['milestoneId', '7']);
    fireEvent.change(select, { target: { value: '' } });
    expect(writes.at(-1)).toEqual(['milestoneId', null]);
  });

  it('shows a field error when the milestones cannot be loaded', async () => {
    mockListMilestones.mockRejectedValue(new Error('offline'));
    renderPanel();
    const field = (await screen.findByTestId('tasks-filter-milestone')).parentElement!;
    expect(await within(field).findByText("Couldn't load the choices.")).toBeInTheDocument();
  });

  it('does not set state after unmount', async () => {
    let release: (v: never) => void = () => undefined;
    mockListUsers.mockReturnValue(new Promise((resolve) => (release = resolve as never)));
    const view = render(<Panel initial={{}} writes={[]} />);
    view.unmount();
    release({ users: [] } as never);
    await Promise.resolve();
  });
});

describe('area', () => {
  it('shows the first id of a legacy multi-value CSV as its path', () => {
    renderPanel({ areaId: 'a-3,a-1' });
    expect(
      within(screen.getByTestId('def-areaId')).getByText('Ground floor › Kitchen'),
    ).toBeInTheDocument();
  });

  it('shows the "No area" sentinel by its label and clears to null', async () => {
    const writes = renderPanel({ areaId: '__none__' });
    const field = screen.getByTestId('def-areaId');
    expect(within(field).getByText('No area')).toBeInTheDocument();
    await userEvent.click(within(field).getByRole('button', { name: /clear/i }));
    expect(writes.at(-1)).toEqual(['areaId', null]);
  });

  it('picking the "No area" row writes the sentinel', async () => {
    const writes = renderPanel();
    await userEvent.click(within(screen.getByTestId('def-areaId')).getByRole('textbox'));
    await userEvent.click(await screen.findByRole('option', { name: 'No area' }));
    expect(writes.at(-1)).toEqual(['areaId', '__none__']);
  });

  it('shows an areas load error under the picker', () => {
    areasError = 'Areas failed to load';
    renderPanel();
    expect(
      within(screen.getByTestId('def-areaId')).getByText('Areas failed to load'),
    ).toBeInTheDocument();
  });
});

describe('company', () => {
  it('drops a company id that no longer exists', async () => {
    const writes = renderPanel({ assignedVendorId: 'v-gone' });
    await waitFor(() => expect(writes).toContainEqual(['assignedVendorId', null]));
  });

  it('searches the server and writes the picked id; clearing writes null', async () => {
    mockFetchVendors.mockResolvedValue({
      vendors: [{ id: 'v-250', name: 'Example Tiling Co' } as never],
      pagination: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
    });
    const writes = renderPanel();
    await userEvent.click(within(screen.getByTestId('def-assignedVendorId')).getByRole('textbox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Example Tiling Co' }));
    await waitFor(() => expect(writes).toContainEqual(['assignedVendorId', 'v-250']));
    await userEvent.click(
      within(screen.getByTestId('def-assignedVendorId')).getByRole('button', { name: /clear/i }),
    );
    await waitFor(() => expect(writes.at(-1)).toEqual(['assignedVendorId', null]));
  });
});

describe('ranges', () => {
  it('Start date and End date write from:…,to:… and Cost lines write min:…,max:…', () => {
    const writes = renderPanel();
    fireEvent.change(screen.getByTestId('tasks-filter-startDate-from'), {
      target: { value: '2026-01-01' },
    });
    expect(writes.at(-1)).toEqual(['startDate', 'from:2026-01-01']);
    fireEvent.change(screen.getByTestId('tasks-filter-endDate-to'), {
      target: { value: '2026-02-01' },
    });
    expect(writes.at(-1)).toEqual(['endDate', 'to:2026-02-01']);
    const min = screen.getByTestId('tasks-filter-budgetLines-min');
    expect(min).toHaveAttribute('step', '1');
    fireEvent.change(min, { target: { value: '2' } });
    fireEvent.blur(min);
    expect(writes.at(-1)).toEqual(['budgetLines', 'min:2']);
  });
});
