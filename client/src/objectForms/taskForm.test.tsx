/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { WORK_ITEM_STATUSES } from '@cornerstone/shared';
import type { UserResponse } from '@cornerstone/shared';
import enCommon from '../i18n/en/common.json';
import { installMatchMedia } from '../test/matchMediaControl.js';
import { makeSearchCompanies } from '../test/companySearchMock.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import type { ObjectFormResult } from '../components/ObjectForm/types.js';
import type * as WorkItemsApiTypes from '../lib/workItemsApi.js';
import type * as UsersApiTypes from '../lib/usersApi.js';
import type * as DependenciesApiTypes from '../lib/dependenciesApi.js';
import type * as VendorsApiTypes from '../lib/vendorsApi.js';
import type { UseAreasResult } from '../hooks/useAreas.js';
import type * as FormTypes from './taskForm.js';
import type * as ObjectFormTypes from '../components/ObjectForm/ObjectForm.js';
import type * as StateTypes from '../components/ObjectForm/objectFormState.js';

const mockCreateWorkItem = jest.fn<typeof WorkItemsApiTypes.createWorkItem>();
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();
const mockListUsers = jest.fn<typeof UsersApiTypes.listUsers>();
const mockCreateDependency = jest.fn<typeof DependenciesApiTypes.createDependency>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();
const mockCreateVendor = jest.fn<typeof VendorsApiTypes.createVendor>();

jest.unstable_mockModule('../lib/workItemsApi.js', () => ({
  createWorkItem: mockCreateWorkItem,
  listWorkItems: mockListWorkItems,
}));
jest.unstable_mockModule('../lib/usersApi.js', () => ({ listUsers: mockListUsers }));
jest.unstable_mockModule('../lib/dependenciesApi.js', () => ({
  createDependency: mockCreateDependency,
}));
jest.unstable_mockModule('../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  fetchVendor: mockFetchVendor,
  searchCompanies: makeSearchCompanies(mockFetchVendors),
  createVendor: mockCreateVendor,
}));
jest.unstable_mockModule('../hooks/useTrades.js', () => ({
  useTrades: () => ({ trades: [], isLoading: false, isInitialLoading: false, error: null }),
}));

type AreaRow = {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
};
const mockUseAreas = jest.fn<() => UseAreasResult>();
jest.unstable_mockModule('../hooks/useAreas.js', () => ({ useAreas: mockUseAreas }));

// The area field is replaced by a plain select (the Ghost option models an id the area list
// does not know); the EntityPicker kinds themselves are covered in EntityPicker.test.tsx.
const { AreaBreadcrumb: RealBreadcrumb } = await import('../components/AreaBreadcrumb/index.js');
type MockArea = { id: string; name: string; parentId: string | null; color: string | null };
function trailOf(areaId: string, list: MockArea[]) {
  const found = list.find((a) => a.id === areaId);
  if (!found) return null;
  const ancestors: MockArea[] = [];
  let current = list.find((a) => a.id === found.parentId);
  while (current) {
    ancestors.unshift(current);
    const parentId: string | null = current.parentId;
    current = list.find((a) => a.id === parentId);
  }
  return { id: found.id, name: found.name, color: found.color, ancestors };
}
jest.unstable_mockModule('./AreaField.js', () => ({
  AreaField: ({
    ctx,
    areas,
    preview,
  }: {
    ctx: {
      id: string;
      value: unknown;
      setValue: (value: string) => void;
      busy: boolean;
    };
    areas: MockArea[];
    preview?: boolean;
  }) => (
    <>
      <select
        id={ctx.id}
        data-testid="area-picker-mock"
        value={typeof ctx.value === 'string' ? ctx.value : ''}
        disabled={ctx.busy}
        onChange={(e) => ctx.setValue(e.target.value)}
      >
        <option value="">— None —</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
        <option value="does-not-exist">Ghost</option>
      </select>
      {preview && typeof ctx.value === 'string' && ctx.value !== '' && (
        <RealBreadcrumb area={trailOf(ctx.value, areas) as never} variant="default" />
      )}
    </>
  ),
}));

const area = (id: string, name: string, parentId: string | null = null): AreaRow => ({
  id,
  name,
  parentId,
  color: null,
});

function setAreas(rows: AreaRow[], isLoading = false) {
  mockUseAreas.mockReturnValue({
    areas: rows,
    isLoading,
    error: null,
    refetch: jest.fn(),
  } as unknown as UseAreasResult);
}

const users: UserResponse[] = [
  {
    id: 'user-1',
    email: 'active@example.com',
    displayName: 'Active User',
    role: 'member',
    authProvider: 'local',
    oidcLinked: false,
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'user-2',
    email: 'deactivated@example.com',
    displayName: 'Deactivated User',
    role: 'member',
    authProvider: 'local',
    oidcLinked: false,
    createdAt: '2024-01-01T00:00:00Z',
    deactivatedAt: '2024-06-01T00:00:00Z',
  },
];

const FOUNDATION = {
  id: 'wi-1',
  title: 'Foundation',
  status: 'completed' as const,
  startDate: null,
  endDate: null,
  projectedStartDate: null,
  projectedEndDate: null,
  isLate: false,
  lateDays: null,
  isHeldUp: false,
  durationDays: null,
  actualStartDate: null,
  actualEndDate: null,
  assignedUser: null,
  assignedVendor: null,
  area: null,
  budgetLineCount: 0,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('taskForm (ObjectForm schema)', () => {
  let Form: typeof FormTypes;
  let FormComponent: typeof ObjectFormTypes;
  let State: typeof StateTypes;
  let media: MatchMediaControl;
  const onCreated = jest.fn<(r: ObjectFormResult) => void>();

  beforeEach(async () => {
    mockCreateWorkItem.mockReset();
    mockListWorkItems.mockReset();
    mockListUsers.mockReset();
    mockCreateDependency.mockReset();
    mockFetchVendors.mockReset();
    mockFetchVendor.mockReset();
    mockCreateVendor.mockReset();
    onCreated.mockReset();
    setAreas([]);
    mockListUsers.mockResolvedValue({ users });
    mockListWorkItems.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 15, totalItems: 0, totalPages: 0 },
    });
    mockFetchVendors.mockResolvedValue({
      vendors: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    } as unknown as Awaited<ReturnType<typeof VendorsApiTypes.fetchVendors>>);
    media = installMatchMedia({ '(min-width: 768px)': true });
    if (!Form) {
      Form = await import('./taskForm.js');
      FormComponent = await import('../components/ObjectForm/ObjectForm.js');
      State = await import('../components/ObjectForm/objectFormState.js');
    }
  });

  afterEach(() => {
    media.restore();
  });

  function Harness({ search = '' }: { search?: string }) {
    const schema = Form.useTaskFormSchema();
    const prefill = State.mapPrefill(
      schema,
      Object.fromEntries(new URLSearchParams(search)) as never,
    );
    return (
      <FormComponent.ObjectForm
        schema={schema}
        prefill={prefill}
        onCreated={onCreated}
        onCancel={() => {}}
      />
    );
  }

  const renderForm = (search?: string) =>
    render(
      <MemoryRouter>
        <Harness search={search} />
      </MemoryRouter>,
    );

  const ready = async () => {
    await screen.findByLabelText(/^title/i);
    await waitFor(() => expect(screen.getByLabelText(/assigned to/i)).toBeInTheDocument());
  };
  const save = () => screen.getByTestId('object-form-save');
  const openMore = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByTestId('object-form-more'));

  describe('initial render', () => {
    it('titles the dialog "New task" and keeps the essentials up front', async () => {
      renderForm();
      await ready();
      expect(screen.getByRole('dialog', { name: 'New task' })).toBeInTheDocument();
      expect(screen.getByLabelText(/^title/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/assigned to/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/duration/i)).toBeInTheDocument();
      expect(screen.getByTestId('area-picker-mock')).toBeInTheDocument();
    });

    it('keeps description, status, constraints and dependencies under More details', async () => {
      renderForm();
      await ready();
      const more = screen.getByTestId('object-form-more');
      const hidden = document.getElementById(more.getAttribute('aria-controls')!)!;
      expect(hidden).toHaveAttribute('hidden');
      for (const label of [
        'Description',
        'Status',
        'Start After',
        'Start Before',
        'Dependencies',
      ]) {
        expect(within(hidden).getByText(label)).toBeInTheDocument();
      }
    });

    it('does not offer start/end dates (computed by the scheduling engine)', async () => {
      renderForm();
      await ready();
      expect(screen.queryByLabelText(/^start date$/i)).toBeNull();
      expect(screen.queryByLabelText(/^end date$/i)).toBeNull();
      expect(screen.queryByText('Tags')).toBeNull();
    });

    it('duration and constraints are editable number/date inputs', async () => {
      const user = userEvent.setup();
      renderForm();
      await ready();
      await openMore(user);
      const duration = screen.getByLabelText(/duration/i) as HTMLInputElement;
      expect(duration.type).toBe('number');
      expect(duration).not.toBeDisabled();
      expect((screen.getByLabelText(/start after/i) as HTMLInputElement).type).toBe('date');
      expect((screen.getByLabelText(/start before/i) as HTMLInputElement).type).toBe('date');
    });

    it('Save and Cancel are present, with no header back button', async () => {
      renderForm();
      await ready();
      expect(save()).toBeInTheDocument();
      expect(screen.getByTestId('object-form-cancel')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /back to tasks/i })).toBeNull();
    });

    it('status select lists WORK_ITEM_STATUSES in order with translated labels', async () => {
      const user = userEvent.setup();
      renderForm();
      await ready();
      await openMore(user);
      const select = screen.getByLabelText(/^status/i) as HTMLSelectElement;
      expect(Array.from(select.options).map((o) => [o.value, o.textContent])).toEqual([
        ['not_started', enCommon.statusVocabulary.task.not_started],
        ['in_progress', enCommon.statusVocabulary.task.in_progress],
        ['completed', enCommon.statusVocabulary.task.completed],
      ]);
      expect(Array.from(select.options).map((o) => o.value)).toEqual([...WORK_ITEM_STATUSES]);
      expect(select.value).toBe('not_started');
    });

    it('lists active people and companies, never deactivated users, when the picker opens', async () => {
      const user = userEvent.setup();
      mockFetchVendors.mockResolvedValue({
        vendors: [{ id: 'v-1', name: 'Acme Roofing', trade: null }],
        pagination: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
      } as unknown as Awaited<ReturnType<typeof VendorsApiTypes.fetchVendors>>);
      renderForm();
      await ready();

      await user.click(screen.getByLabelText(/assigned to/i));

      const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
      expect(options).toContain('Active User');
      expect(options).toContain('Acme Roofing');
      expect(options).not.toContain('Deactivated User');
    });

    it('loads no companies when the form opens (the picker searches on focus)', async () => {
      renderForm();
      await ready();

      expect(mockFetchVendors).not.toHaveBeenCalled();
      expect(mockFetchVendor).not.toHaveBeenCalled();
    });

    it('shows the translated loadFailed message when the users fail to load (never the raw error)', async () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockListUsers.mockRejectedValue(new Error('SQLITE_BUSY: raw detail'));
      renderForm();
      expect(
        await screen.findByText('Failed to load form data. Please try again.'),
      ).toBeInTheDocument();
      expect(document.body.textContent).not.toContain('SQLITE_BUSY');
      spy.mockRestore();
    });
  });

  describe('pre-fill', () => {
    it('pre-selects an area from areaId and shows its trail', async () => {
      setAreas([area('a1', 'Kitchen')]);
      renderForm('?areaId=a1');
      await ready();
      expect((screen.getByTestId('area-picker-mock') as HTMLSelectElement).value).toBe('a1');
      expect(screen.getByRole('navigation', { name: /area path/i })).toBeInTheDocument();
    });
  });

  describe('unknown area id', () => {
    it('?areaId=unknown leaves the area empty and Save sends areaId: null', async () => {
      const user = userEvent.setup();
      setAreas([area('a1', 'Kitchen')]);
      mockCreateWorkItem.mockResolvedValue({ id: 'work-5' } as never);
      renderForm('?areaId=unknown');
      await ready();
      await waitFor(() =>
        expect((screen.getByTestId('area-picker-mock') as HTMLSelectElement).value).toBe(''),
      );
      expect(screen.queryByRole('navigation', { name: /area path/i })).toBeNull();
      await user.type(screen.getByLabelText(/^title/i), 'No area');
      await user.click(save());
      await waitFor(() => expect(mockCreateWorkItem).toHaveBeenCalledTimes(1));
      expect(mockCreateWorkItem).toHaveBeenCalledWith(expect.objectContaining({ areaId: null }));
    });

    it('an unknown area does not make the form dirty', async () => {
      const user = userEvent.setup();
      setAreas([area('a1', 'Kitchen')]);
      renderForm('?areaId=unknown');
      await ready();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
  });

  describe('validation', () => {
    it('requires a title', async () => {
      const user = userEvent.setup();
      renderForm();
      await ready();
      await user.click(save());
      expect(await screen.findByText('Title is required')).toBeInTheDocument();
      expect(mockCreateWorkItem).not.toHaveBeenCalled();
    });

    it('rejects start after later than start before', async () => {
      const user = userEvent.setup();
      renderForm();
      await ready();
      await user.type(screen.getByLabelText(/^title/i), 'Test Work Item');
      await openMore(user);
      fireEvent.change(screen.getByLabelText(/start after/i), { target: { value: '2024-12-31' } });
      fireEvent.change(screen.getByLabelText(/start before/i), { target: { value: '2024-01-01' } });
      await user.click(save());
      expect(
        await screen.findByText(/start after date must be before or equal to start before date/i),
      ).toBeInTheDocument();
      expect(mockCreateWorkItem).not.toHaveBeenCalled();
    });

    it('accepts equal start-after and start-before', async () => {
      const user = userEvent.setup();
      mockCreateWorkItem.mockResolvedValue({ id: 'w1' } as never);
      renderForm();
      await ready();
      await user.type(screen.getByLabelText(/^title/i), 'Same day');
      await openMore(user);
      fireEvent.change(screen.getByLabelText(/start after/i), { target: { value: '2024-05-05' } });
      fireEvent.change(screen.getByLabelText(/start before/i), { target: { value: '2024-05-05' } });
      await user.click(save());
      await waitFor(() => expect(mockCreateWorkItem).toHaveBeenCalledTimes(1));
    });

    it('rejects a negative duration', async () => {
      const user = userEvent.setup();
      renderForm();
      await ready();
      await user.type(screen.getByLabelText(/^title/i), 'Test Work Item');
      fireEvent.change(screen.getByLabelText(/duration/i), { target: { value: '-5' } });
      await user.click(save());
      expect(await screen.findByText('Duration must be a positive number')).toBeInTheDocument();
      expect(mockCreateWorkItem).not.toHaveBeenCalled();
    });
  });

  describe('submission', () => {
    it('creates the task with trimmed, null-normalised data and reports the new task', async () => {
      const user = userEvent.setup();
      mockCreateWorkItem.mockResolvedValue({ id: 'work-1' } as never);
      renderForm();
      await ready();
      await user.type(screen.getByLabelText(/^title/i), '  Pour slab  ');
      fireEvent.change(screen.getByLabelText(/duration/i), { target: { value: '3' } });
      await user.click(save());
      await waitFor(() => expect(mockCreateWorkItem).toHaveBeenCalledTimes(1));
      expect(mockCreateWorkItem).toHaveBeenCalledWith({
        title: 'Pour slab',
        description: null,
        status: 'not_started',
        durationDays: 3,
        startAfter: null,
        startBefore: null,
        areaId: null,
        assignedUserId: null,
        assignedVendorId: null,
      });
      await waitFor(() =>
        expect(onCreated).toHaveBeenCalledWith({
          id: 'work-1',
          href: '/project/work-items/work-1',
          label: 'Pour slab',
        }),
      );
    });

    it('sends the chosen area, assignee, status, description and constraints', async () => {
      const user = userEvent.setup();
      setAreas([area('a1', 'Kitchen')]);
      mockCreateWorkItem.mockResolvedValue({ id: 'work-2' } as never);
      renderForm();
      await ready();
      await user.type(screen.getByLabelText(/^title/i), 'Cabinets');
      fireEvent.change(screen.getByTestId('area-picker-mock'), { target: { value: 'a1' } });
      await user.click(screen.getByLabelText(/assigned to/i));
      await user.click(await screen.findByRole('option', { name: 'Active User' }));
      await openMore(user);
      await user.type(screen.getByLabelText(/description/i), 'Install all');
      await user.selectOptions(screen.getByLabelText(/^status/i), 'in_progress');
      fireEvent.change(screen.getByLabelText(/start after/i), { target: { value: '2024-03-01' } });
      await user.click(save());
      await waitFor(() => expect(mockCreateWorkItem).toHaveBeenCalledTimes(1));
      expect(mockCreateWorkItem).toHaveBeenCalledWith(
        expect.objectContaining({
          areaId: 'a1',
          assignedUserId: 'user-1',
          status: 'in_progress',
          description: 'Install all',
          startAfter: '2024-03-01',
        }),
      );
    });

    it('shows a banner when creation fails', async () => {
      const user = userEvent.setup();
      mockCreateWorkItem.mockRejectedValue(new Error('Network error'));
      renderForm();
      await ready();
      await user.type(screen.getByLabelText(/^title/i), 'Test Work Item');
      await user.click(save());
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(onCreated).not.toHaveBeenCalled();
    });

    it('announces the added task in the Add-another confirmation', async () => {
      const user = userEvent.setup();
      mockCreateWorkItem.mockResolvedValue({ id: 'work-3' } as never);
      renderForm();
      await ready();
      await user.click(screen.getByTestId('object-form-add-another'));
      await user.type(screen.getByLabelText(/^title/i), 'First task');
      await user.click(save());
      await waitFor(() =>
        expect(screen.getByTestId('object-form-added')).toHaveTextContent(
          'Task ‘First task’ added.',
        ),
      );
      expect(onCreated).not.toHaveBeenCalled();
    });

    it('Add another keeps the chosen area for the next task', async () => {
      const user = userEvent.setup();
      setAreas([area('a1', 'Kitchen')]);
      mockCreateWorkItem.mockResolvedValue({ id: 'work-4' } as never);
      renderForm();
      await ready();
      await user.click(screen.getByTestId('object-form-add-another'));
      fireEvent.change(screen.getByTestId('area-picker-mock'), { target: { value: 'a1' } });
      await user.type(screen.getByLabelText(/^title/i), 'First task');
      await user.click(save());
      await waitFor(() =>
        expect(screen.getByTestId('object-form-added')).not.toBeEmptyDOMElement(),
      );
      expect((screen.getByTestId('area-picker-mock') as HTMLSelectElement).value).toBe('a1');
      expect((screen.getByLabelText(/^title/i) as HTMLInputElement).value).toBe('');
    });
  });

  describe('dependencies', () => {
    async function addFoundationDependency(user: ReturnType<typeof userEvent.setup>) {
      mockListWorkItems.mockResolvedValue({
        items: [FOUNDATION],
        pagination: { page: 1, pageSize: 15, totalItems: 1, totalPages: 1 },
      });
      await ready();
      await openMore(user);
      // The first task picker of the builder (the Who picker above it has its own placeholder).
      const pickerInputs = screen.getAllByPlaceholderText('Search work items...');
      await user.click(pickerInputs[0]!);
      await waitFor(() => expect(screen.getByText('Foundation')).toBeInTheDocument());
      await user.click(screen.getByText('Foundation'));
      await user.click(screen.getByRole('button', { name: /^add$/i }));
      await waitFor(() =>
        expect(screen.getByRole('list', { name: /dependencies to add/i })).toBeInTheDocument(),
      );
    }

    it('renders the dependency sentence builder under More details', async () => {
      const user = userEvent.setup();
      renderForm();
      await ready();
      await openMore(user);
      expect(screen.getByRole('combobox', { name: /predecessor verb/i })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: /successor verb/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /this item depends on/i })).toBeNull();
    });

    it('adds a dependency where this task comes first and the other item second', async () => {
      const user = userEvent.setup();
      mockListWorkItems.mockResolvedValue({
        items: [FOUNDATION],
        pagination: { page: 1, pageSize: 15, totalItems: 1, totalPages: 1 },
      });
      renderForm();
      await ready();
      await openMore(user);
      // Slot 2 starts as "This item": clear it, make slot 1 "This item", then pick the other task.
      await user.click(screen.getByRole('button', { name: /clear selection/i }));
      await user.click(screen.getAllByPlaceholderText('Search work items...')[0]!);
      await user.click(await screen.findByRole('option', { name: 'This item' }));
      await user.click(await screen.findByPlaceholderText('Search work items...'));
      await user.click(await screen.findByRole('option', { name: /Foundation/ }));
      await user.click(screen.getByRole('button', { name: /^add$/i }));

      const list = await screen.findByRole('list', { name: /dependencies to add/i });
      expect(list).toHaveTextContent('Foundation');
      expect(
        screen.getByRole('button', { name: /remove dependency involving foundation/i }),
      ).toBeInTheDocument();
    });

    it('shows a pending dependency in sentence format and lets the user remove it', async () => {
      const user = userEvent.setup();
      renderForm();
      await addFoundationDependency(user);
      const list = screen.getByRole('list', { name: /dependencies to add/i });
      expect(list.textContent).toMatch(/must finish before|must start before/i);
      await user.click(
        screen.getByRole('button', { name: /remove dependency involving foundation/i }),
      );
      expect(screen.queryByRole('list', { name: /dependencies to add/i })).toBeNull();
    });

    it('creates each pending dependency against the new task id (sentinel replaced)', async () => {
      const user = userEvent.setup();
      mockCreateWorkItem.mockResolvedValue({ id: 'work-9' } as never);
      mockCreateDependency.mockResolvedValue({} as never);
      renderForm();
      await addFoundationDependency(user);
      await user.type(screen.getByLabelText(/^title/i), 'With dependency');
      await user.click(save());
      await waitFor(() => expect(mockCreateDependency).toHaveBeenCalledTimes(1));
      const [successorId, body] = mockCreateDependency.mock.calls[0]!;
      const ids = [successorId, (body as { predecessorId: string }).predecessorId];
      expect(ids).toContain('work-9');
      expect(ids).toContain('wi-1');
      await waitFor(() =>
        expect(onCreated).toHaveBeenCalledWith(
          expect.objectContaining({ href: '/project/work-items/work-9' }),
        ),
      );
    });

    it('still creates the task and reports the failed dependency in the URL (depError)', async () => {
      const user = userEvent.setup();
      mockCreateWorkItem.mockResolvedValue({ id: 'work-9' } as never);
      mockCreateDependency.mockRejectedValue(new Error('cycle'));
      renderForm();
      await addFoundationDependency(user);
      await user.type(screen.getByLabelText(/^title/i), 'With dependency');
      await user.click(save());
      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(onCreated.mock.calls[0]![0].href).toBe(
        '/project/work-items/work-9?depError=Foundation',
      );
    });
  });

  describe('schema (called directly)', () => {
    let THIS = '';
    beforeEach(async () => {
      ({ THIS_ITEM_ID: THIS } =
        await import('../components/DependencySentenceBuilder/dependencyVerbs.js'));
    });
    const schema = async () => {
      const view = renderHook(() => Form.useTaskFormSchema(), { wrapper: MemoryRouter });
      await waitFor(() => expect(mockListUsers).toHaveBeenCalled());
      return view.result;
    };
    const field = (result: Awaited<ReturnType<typeof schema>>, name: string) => {
      const found = result.current.fields.find((f) => f.name === name);
      if (found?.kind !== 'custom' || !found.render) {
        throw new Error(`${name} is not a custom field`);
      }
      return found as typeof found & { render: NonNullable<typeof found.render> };
    };
    const ctx = (value: unknown) => ({
      id: 'f',
      value,
      setValue: jest.fn(),
      busy: false,
      invalid: false,
      describedBy: undefined,
      createChild: jest.fn(),
      values: {},
    });

    it('requires only the title for an empty value set', async () => {
      const result = await schema();

      expect(result.current.validate({})).toEqual({ title: 'Title is required' });
    });

    it('submits the minimal value set with every optional field null', async () => {
      mockCreateWorkItem.mockResolvedValue({ id: 'work-3' } as never);
      const result = await schema();

      const outcome = await result.current.submit({ title: ' Plaster ', status: 'not_started' });

      expect(mockCreateWorkItem).toHaveBeenCalledWith({
        title: 'Plaster',
        description: null,
        status: 'not_started',
        durationDays: null,
        startAfter: null,
        startBefore: null,
        areaId: null,
        assignedUserId: null,
        assignedVendorId: null,
      });
      expect(outcome).toEqual({
        id: 'work-3',
        href: '/project/work-items/work-3',
        label: 'Plaster',
      });
      expect(mockCreateDependency).not.toHaveBeenCalled();
    });

    it('a member assignment sends only assignedUserId, a company only assignedVendorId (never both)', async () => {
      mockCreateWorkItem.mockResolvedValue({ id: 'work-3' } as never);
      const result = await schema();

      await result.current.submit({
        title: 'A',
        status: 'not_started',
        assignment: 'member:user-1',
      });
      await result.current.submit({ title: 'B', status: 'not_started', assignment: 'company:v-1' });

      const [first, second] = mockCreateWorkItem.mock.calls.map((c) => c[0]);
      expect(first).toMatchObject({ assignedUserId: 'user-1', assignedVendorId: null });
      expect(second).toMatchObject({ assignedUserId: null, assignedVendorId: 'v-1' });
    });

    it('replaces the sentinel on either side of a pending dependency with the new id', async () => {
      mockCreateWorkItem.mockResolvedValue({ id: 'work-3' } as never);
      mockCreateDependency.mockResolvedValue({} as never);
      const result = await schema();

      await result.current.submit({
        title: 'A',
        status: 'not_started',
        dependencies: [
          {
            predecessorId: 'wi-1',
            successorId: THIS,
            otherItemId: 'wi-1',
            otherItemTitle: 'Foundation',
            dependencyType: 'finish_to_start',
          },
          {
            predecessorId: THIS,
            successorId: 'wi-2',
            otherItemId: 'wi-2',
            otherItemTitle: 'Roof',
            dependencyType: 'finish_to_start',
          },
        ],
      });

      expect(mockCreateDependency.mock.calls).toEqual([
        ['work-3', { predecessorId: 'wi-1', dependencyType: 'finish_to_start' }],
        ['wi-2', { predecessorId: 'work-3', dependencyType: 'finish_to_start' }],
      ]);
    });

    it('renders the Who picker empty for a non-text value and the dependency list empty for a non-list value', async () => {
      const result = await schema();

      const who = render(
        <MemoryRouter>{field(result, 'assignment').render(ctx(undefined))}</MemoryRouter>,
      );
      expect(screen.getByRole('textbox')).toHaveValue('');
      who.unmount();

      render(<MemoryRouter>{field(result, 'dependencies').render(ctx('nope'))}</MemoryRouter>);
      expect(screen.queryByRole('list', { name: /dependencies to add/i })).toBeNull();
    });

    it('words a pending dependency by which side is "this item"', async () => {
      const result = await schema();
      const pending = (predecessorId: string, successorId: string, title: string) => ({
        predecessorId,
        successorId,
        otherItemId: title,
        otherItemTitle: title,
        dependencyType: 'finish_to_start',
      });

      render(
        <MemoryRouter>
          {field(result, 'dependencies').render(
            ctx([pending(THIS, 'x', 'Roof'), pending('y', THIS, 'Foundation')]),
          )}
        </MemoryRouter>,
      );

      const items = within(screen.getByRole('list', { name: /dependencies to add/i })).getAllByRole(
        'listitem',
      );
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent('Roof');
      expect(items[1]).toHaveTextContent('Foundation');
      expect(items[0]!.textContent).not.toBe(items[1]!.textContent);
    });

    it('does not add a dependency on an item that is already pending', async () => {
      const user = userEvent.setup();
      mockListWorkItems.mockResolvedValue({
        items: [FOUNDATION],
        pagination: { page: 1, pageSize: 15, totalItems: 1, totalPages: 1 },
      });
      const result = await schema();
      const first = ctx([]);
      const view = render(
        <MemoryRouter>{field(result, 'dependencies').render(first)}</MemoryRouter>,
      );
      await user.click(screen.getAllByPlaceholderText('Search work items...')[0]!);
      await user.click(await screen.findByText('Foundation'));

      // The host already holds a pending dependency on Foundation (e.g. added a moment ago).
      const second = ctx([
        {
          predecessorId: 'wi-1',
          successorId: THIS,
          otherItemId: 'wi-1',
          otherItemTitle: 'Foundation',
          dependencyType: 'finish_to_start',
        },
      ]);
      view.rerender(<MemoryRouter>{field(result, 'dependencies').render(second)}</MemoryRouter>);
      await user.click(screen.getByRole('button', { name: /^add$/i }));

      expect(second.setValue).not.toHaveBeenCalled();
      expect(first.setValue).not.toHaveBeenCalled();
    });
  });

  describe('unmounting while the options load', () => {
    it('ignores a late successful load (no state update after unmount)', async () => {
      let resolveUsers!: (r: Awaited<ReturnType<typeof UsersApiTypes.listUsers>>) => void;
      mockListUsers.mockReturnValue(
        new Promise((r) => {
          resolveUsers = r;
        }),
      );
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { unmount } = renderForm();
      unmount();
      await act(async () => {
        resolveUsers({ users });
      });
      expect(error).not.toHaveBeenCalled();
      error.mockRestore();
    });

    it('ignores a late failed load (nothing logged, no state update)', async () => {
      let rejectUsers!: (e: Error) => void;
      mockListUsers.mockReturnValue(
        new Promise((_r, reject) => {
          rejectUsers = reject;
        }),
      );
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { unmount } = renderForm();
      unmount();
      await act(async () => {
        rejectUsers(new Error('late'));
      });
      expect(error).not.toHaveBeenCalled();
      error.mockRestore();
    });
  });

  describe('area breadcrumb preview', () => {
    it('shows no trail before an area is selected', async () => {
      setAreas([area('a1', 'Kitchen')]);
      renderForm();
      await ready();
      expect(screen.queryByRole('navigation', { name: /area path/i })).toBeNull();
    });

    it('shows the area name once selected and hides it again when cleared', async () => {
      setAreas([area('a1', 'Kitchen')]);
      renderForm();
      await ready();
      fireEvent.change(screen.getByTestId('area-picker-mock'), { target: { value: 'a1' } });
      const nav = await screen.findByRole('navigation', { name: /area path/i });
      expect(within(nav).getByText('Kitchen')).toBeInTheDocument();
      fireEvent.change(screen.getByTestId('area-picker-mock'), { target: { value: '' } });
      expect(screen.queryByRole('navigation', { name: /area path/i })).toBeNull();
    });

    it('shows the ancestor chain root-first for a 3-level hierarchy (shuffled input)', async () => {
      setAreas([area('c', 'Kitchen', 'b'), area('b', 'Ground Floor', 'a'), area('a', 'House')]);
      renderForm();
      await ready();
      fireEvent.change(screen.getByTestId('area-picker-mock'), { target: { value: 'c' } });
      const nav = await screen.findByRole('navigation', { name: /area path/i });
      const segments = Array.from(nav.querySelectorAll('li'))
        .filter((li) => !li.getAttribute('aria-hidden'))
        .map((li) => li.textContent);
      expect(segments).toEqual(['House', 'Ground Floor', 'Kitchen']);
    });

    it('renders the "No area" fallback for an unknown area id', async () => {
      setAreas([area('a1', 'Known Area')]);
      renderForm();
      await ready();
      fireEvent.change(screen.getByTestId('area-picker-mock'), {
        target: { value: 'does-not-exist' },
      });
      await waitFor(() => expect(screen.getByText('No area')).toBeInTheDocument());
      expect(screen.queryByRole('navigation', { name: /area path/i })).toBeNull();
    });
  });

  describe('assignment: companies beyond the first page and creating one', () => {
    it('finds a company by typing and sends it as assignedVendorId', async () => {
      const user = userEvent.setup();
      mockFetchVendors.mockImplementation(async (params) => {
        const vendors =
          params?.q === 'zeta' ? [{ id: 'v-250', name: 'Zeta Tiling', trade: null }] : [];
        return {
          vendors,
          pagination: { page: 1, pageSize: 50, totalItems: vendors.length, totalPages: 1 },
        } as unknown as Awaited<ReturnType<typeof VendorsApiTypes.fetchVendors>>;
      });
      mockCreateWorkItem.mockResolvedValue({ id: 'work-9' } as never);
      renderForm();
      await ready();
      await user.type(screen.getByLabelText(/^title/i), 'Tiles');

      await user.type(screen.getByLabelText(/assigned to/i), 'zeta');
      await user.click(await screen.findByRole('option', { name: 'Zeta Tiling' }));
      await user.click(save());

      await waitFor(() => expect(mockCreateWorkItem).toHaveBeenCalledTimes(1));
      expect(mockFetchVendors).toHaveBeenCalledWith(
        { q: 'zeta', pageSize: 50 },
        { signal: expect.any(AbortSignal) },
      );
      expect(mockCreateWorkItem).toHaveBeenCalledWith(
        expect.objectContaining({ assignedVendorId: 'v-250', assignedUserId: null }),
      );
    });

    it('offers "New company ‹text›" that opens the company form prefilled with the typed name', async () => {
      const user = userEvent.setup();
      renderForm();
      await ready();

      await user.type(screen.getByLabelText(/assigned to/i), 'Fresh Co');
      await user.click(await screen.findByRole('option', { name: 'New company Fresh Co' }));

      expect(await screen.findByRole('dialog', { name: 'New company' })).toBeInTheDocument();
      expect((screen.getByTestId('company-name-input') as HTMLInputElement).value).toBe('Fresh Co');
    });

    it('sets the created company on the field, shows its name and sends it on Save', async () => {
      const user = userEvent.setup();
      mockCreateVendor.mockResolvedValue({
        id: 'v-new',
        name: 'Fresh Co',
      } as unknown as Awaited<ReturnType<typeof VendorsApiTypes.createVendor>>);
      mockCreateWorkItem.mockResolvedValue({ id: 'work-10' } as never);
      renderForm();
      await ready();
      await user.type(screen.getByLabelText(/^title/i), 'Fence');

      await user.type(screen.getByLabelText(/assigned to/i), 'Fresh Co');
      await user.click(await screen.findByRole('option', { name: 'New company Fresh Co' }));
      await screen.findByRole('dialog', { name: 'New company' });
      await user.click(save());

      expect(await screen.findByText('Fresh Co')).toBeInTheDocument();
      expect(mockFetchVendor).not.toHaveBeenCalled();
      await user.click(save());
      await waitFor(() => expect(mockCreateWorkItem).toHaveBeenCalledTimes(1));
      expect(mockCreateWorkItem).toHaveBeenCalledWith(
        expect.objectContaining({ assignedVendorId: 'v-new', title: 'Fence' }),
      );
    });
  });
});
