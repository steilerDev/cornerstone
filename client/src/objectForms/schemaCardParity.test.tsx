/**
 * @jest-environment jsdom
 *
 * AC4.1 (#2254): a field shared by a create dialog and a page card is the same schema field, so
 * the dialog and the card show the same accessible name and the same error text. Each case
 * renders both surfaces for one field and compares them, and also pins both against the en
 * locale values (never only against each other).
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createRef } from 'react';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import enCommon from '../i18n/en/common.json';
import enWorkItems from '../i18n/en/workItems.json';
import enHouseholdItems from '../i18n/en/householdItems.json';
import enSchedule from '../i18n/en/schedule.json';
import { installMatchMedia } from '../test/matchMediaControl.js';
import { makeLocaleContextMock } from '../test/photoSpotFixtures.js';
import { makeTaskPage } from '../test/taskPageFixtures.js';
import { makePurchasePage } from '../test/purchasePageFixtures.js';
import { makeMilestoneDetail } from '../test/milestonePageFixtures.js';
import { makeSearchCompanies } from '../test/companySearchMock.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import type { UseAreasResult } from '../hooks/useAreas.js';
import type { SectionCardController } from '../components/SectionCard/SectionCard.js';
import type { ObjectFormSchema } from '../components/ObjectForm/types.js';
import type * as ObjectFormTypes from '../components/ObjectForm/ObjectForm.js';
import type * as ScopeTypes from '../components/SectionCard/SectionCardScope.js';
import type * as TaskFormTypes from './taskForm.js';
import type * as PurchaseFormTypes from './purchaseForm.js';
import type * as MilestoneFormTypes from './milestoneForm.js';
import type * as TaskCardsTypes from '../pages/WorkItemDetailPage/TaskDetailCards.js';
import type * as DeliveryCardTypes from '../pages/HouseholdItemDetailPage/PurchaseDeliveryCard.js';
import type * as MilestonePanelTypes from '../pages/MilestoneDetailPage/MilestoneOverviewPanel.js';

const mockUseAreas = jest.fn<() => UseAreasResult>();
const mockFetchVendors = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.unstable_mockModule('../contexts/LocaleContext.js', () => makeLocaleContextMock());
jest.unstable_mockModule('../hooks/useAreas.js', () => ({ useAreas: mockUseAreas }));
jest.unstable_mockModule('../hooks/useTrades.js', () => ({
  useTrades: () => ({ trades: [], isLoading: false, isInitialLoading: false, error: null }),
}));
jest.unstable_mockModule('../lib/workItemsApi.js', () => ({
  createWorkItem: jest.fn(),
  listWorkItems: jest.fn(),
  updateWorkItem: jest.fn(),
}));
jest.unstable_mockModule('../lib/usersApi.js', () => ({
  listUsers: jest.fn<() => Promise<unknown>>().mockResolvedValue({ users: [] }),
}));
jest.unstable_mockModule('../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  fetchVendor: jest.fn(),
  searchCompanies: makeSearchCompanies(mockFetchVendors as never),
  createVendor: jest.fn(),
}));
jest.unstable_mockModule('../lib/searchApi.js', () => ({
  searchEverywhere: jest.fn<() => Promise<unknown>>().mockResolvedValue({ query: '', groups: [] }),
}));
jest.unstable_mockModule('../lib/householdItemsApi.js', () => ({
  createHouseholdItem: jest.fn(),
  updateHouseholdItem: jest.fn(),
}));
jest.unstable_mockModule('../lib/householdItemCategoriesApi.js', () => ({
  fetchHouseholdItemCategories: jest.fn<() => Promise<unknown>>().mockResolvedValue({
    categories: [{ id: 'hic-furniture', name: 'Furniture', translationKey: null }],
  }),
}));
jest.unstable_mockModule('../lib/milestonesApi.js', () => ({
  createMilestone: jest.fn(),
  updateMilestone: jest.fn(),
  listMilestones: jest.fn<() => Promise<unknown>>().mockResolvedValue([]),
}));

let ObjectFormModule: typeof ObjectFormTypes;
let Scope: typeof ScopeTypes;
let TaskForm: typeof TaskFormTypes;
let PurchaseForm: typeof PurchaseFormTypes;
let MilestoneForm: typeof MilestoneFormTypes;
let TaskCards: typeof TaskCardsTypes;
let DeliveryCard: typeof DeliveryCardTypes;
let MilestonePanel: typeof MilestonePanelTypes;
let media: MatchMediaControl;

const REQUIRED = enCommon.objectForm.required;

interface Observed {
  readonly name: string;
  readonly error: string;
}

/** The accessible name of the control and the text of the error wired to it. */
function observe(control: HTMLElement): Observed {
  expect(control).toHaveAttribute('aria-invalid', 'true');
  const label = (control as HTMLInputElement).labels?.[0];
  expect(label).toBeDefined();
  const name = label!.textContent ?? '';
  expect(control).toHaveAccessibleName(name);
  const errorId = control
    .getAttribute('aria-describedby')
    ?.split(' ')
    .find((id) => id.endsWith('-error'));
  expect(errorId).toBeDefined();
  return { name, error: document.getElementById(errorId!)?.textContent ?? '' };
}

function DialogHost({ useSchema }: { useSchema: () => ObjectFormSchema }) {
  const schema = useSchema();
  return <ObjectFormModule.ObjectForm schema={schema} onCreated={() => {}} onCancel={() => {}} />;
}

const renderDialog = (useSchema: () => ObjectFormSchema) =>
  render(
    <MemoryRouter>
      <DialogHost useSchema={useSchema} />
    </MemoryRouter>,
  );

describe('dialog and card share the same field (AC4.1)', () => {
  beforeEach(async () => {
    media = installMatchMedia({ '(min-width: 768px)': true });
    mockFetchVendors.mockResolvedValue({
      vendors: [],
      pagination: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0 },
    });
    mockUseAreas.mockReturnValue({
      areas: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    } as unknown as UseAreasResult);
    if (!ObjectFormModule) {
      ObjectFormModule = await import('../components/ObjectForm/ObjectForm.js');
      Scope = await import('../components/SectionCard/SectionCardScope.js');
      TaskForm = await import('./taskForm.js');
      PurchaseForm = await import('./purchaseForm.js');
      MilestoneForm = await import('./milestoneForm.js');
      TaskCards = await import('../pages/WorkItemDetailPage/TaskDetailCards.js');
      DeliveryCard = await import('../pages/HouseholdItemDetailPage/PurchaseDeliveryCard.js');
      MilestonePanel = await import('../pages/MilestoneDetailPage/MilestoneOverviewPanel.js');
    }
  });

  afterEach(() => {
    cleanup();
    media.restore();
  });

  it('task Title: same accessible name and the same "Title is required" error', async () => {
    const user = userEvent.setup();

    renderDialog(() => TaskForm.useTaskFormSchema());
    await screen.findByLabelText(/^title/i);
    await user.click(screen.getByTestId('object-form-save'));
    await screen.findByText('Title is required');
    const dialog = observe(screen.getByLabelText(/^title/i));
    cleanup();

    render(
      <MemoryRouter>
        <Scope.SectionCardScope>
          <TaskCards.TaskDetailCards
            task={makeTaskPage({ title: 'Pour slab' })}
            users={[]}
            usersFailure={null}
            onRetryUsers={() => {}}
            onSaved={() => Promise.resolve()}
            detailsCardRef={createRef<SectionCardController>()}
            whoWhereCardRef={createRef<SectionCardController>()}
          />
        </Scope.SectionCardScope>
      </MemoryRouter>,
    );
    await user.click(screen.getByTestId('section-task-details-edit'));
    await user.clear(screen.getByTestId('task-field-title'));
    await user.click(screen.getByTestId('section-task-details-save'));
    await screen.findByText('Title is required');
    const card = observe(screen.getByTestId('task-field-title'));

    expect(card).toEqual(dialog);
    expect(dialog.name).toBe(`${enWorkItems.create.fields.title} ${REQUIRED}`);
    expect(dialog.error).toBe(enWorkItems.create.fields.titleRequiredError);
    expect(dialog.error).toBe('Title is required');
  });

  it('purchase Latest delivery: same name and the same window error', async () => {
    const user = userEvent.setup();

    renderDialog(() => PurchaseForm.usePurchaseFormSchema());
    await screen.findByLabelText(/^name/i);
    await user.type(screen.getByLabelText(/^name/i), 'Sofa');
    // The first category is preselected once the categories have loaded.
    await screen.findByText('Furniture');
    fireEvent.change(screen.getByLabelText('Earliest delivery'), {
      target: { value: '2026-03-10' },
    });
    fireEvent.change(screen.getByLabelText('Latest delivery'), {
      target: { value: '2026-03-01' },
    });
    await user.click(screen.getByTestId('object-form-save'));
    await screen.findByText(enHouseholdItems.create.form.deliveryWindow.error);
    const dialog = observe(screen.getByLabelText('Latest delivery'));
    cleanup();

    render(
      <MemoryRouter>
        <DeliveryCard.PurchaseDeliveryCard
          purchase={makePurchasePage({
            earliestDeliveryDate: '2026-03-10',
            latestDeliveryDate: '2026-03-20',
          })}
          refresh={() => Promise.resolve()}
        />
      </MemoryRouter>,
    );
    await user.click(screen.getByTestId('section-purchase-delivery-edit'));
    const latest = screen.getByTestId('purchase-latest-input');
    fireEvent.change(latest, { target: { value: '2026-03-01' } });
    await user.click(screen.getByTestId('section-purchase-delivery-save'));
    await screen.findByText(enHouseholdItems.create.form.deliveryWindow.error);
    const card = observe(latest);

    expect(card).toEqual(dialog);
    expect(dialog.name).toBe(enHouseholdItems.create.form.latestDelivery.label);
    expect(dialog.error).toBe("Latest delivery can't be before earliest delivery.");
  });

  it('milestone Target date: same name and the same "Target date is required." error', async () => {
    const user = userEvent.setup();

    renderDialog(() => MilestoneForm.useMilestoneFormSchema());
    await user.type(screen.getByTestId('milestone-title-input'), 'Roof Complete');
    await user.click(screen.getByTestId('object-form-save'));
    await screen.findByText('Target date is required.');
    const dialog = observe(screen.getByTestId('milestone-target-date-input'));
    cleanup();

    render(
      <MemoryRouter>
        <MilestonePanel.MilestoneOverviewPanel
          milestone={makeMilestoneDetail({ targetDate: '2026-06-01' })}
          revision={0}
          refresh={() => Promise.resolve()}
          originState={{ origin: { to: '/project/milestones/1', name: 'Sample' } }}
          headingRef={{ current: null }}
          detailsCardRef={createRef<SectionCardController>()}
          targetDateInputId="target-date-input"
        />
      </MemoryRouter>,
    );
    await user.click(screen.getByTestId('section-milestone-details-edit'));
    fireEvent.change(screen.getByTestId('milestone-field-target-date'), { target: { value: '' } });
    await user.click(screen.getByTestId('section-milestone-details-save'));
    await waitFor(() => expect(screen.getByText('Target date is required.')).toBeInTheDocument());
    const card = observe(screen.getByTestId('milestone-field-target-date'));

    expect(card).toEqual(dialog);
    expect(dialog.name).toBe(`${enSchedule.milestones.create.form.targetDate.label} ${REQUIRED}`);
    expect(dialog.error).toBe(enSchedule.milestones.create.form.targetDate.error);
  });
});
