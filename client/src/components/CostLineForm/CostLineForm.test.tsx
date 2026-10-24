/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ApiClientError } from '../../lib/apiClient.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { makeCostLineRow, makeLinkedRow } from '../../test/costLineFixtures.js';
import { makeSearchCompanies } from '../../test/companySearchMock.js';
import type * as SearchApiTypes from '../../lib/searchApi.js';
import type * as CategoriesApiTypes from '../../lib/budgetCategoriesApi.js';
import type * as SourcesApiTypes from '../../lib/budgetSourcesApi.js';
import type * as WorkBudgetsTypes from '../../lib/workItemBudgetsApi.js';
import type * as HouseholdBudgetsTypes from '../../lib/householdItemBudgetsApi.js';
import type * as InvoiceLinesTypes from '../../lib/invoiceBudgetLinesApi.js';
import type * as AssignTypes from '../../lib/budgetLineAssignApi.js';
import type * as BatchTypes from '../../lib/budgetLinesBatchApi.js';
import type * as VendorsTypes from '../../lib/vendorsApi.js';
import type * as FormTypes from './CostLineForm.js';
import type { CostLineHost } from '../CostLineTable/types.js';
import type { CostLineFormProps } from './types.js';

const mockSearch = jest.fn<typeof SearchApiTypes.searchEverywhere>();
jest.unstable_mockModule('../../lib/searchApi.js', () => ({ searchEverywhere: mockSearch }));

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: () => ({
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  }),
  RESOLVED_LOCALES: ['en', 'de'],
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockFetchCategories = jest.fn<typeof CategoriesApiTypes.fetchBudgetCategories>();
jest.unstable_mockModule('../../lib/budgetCategoriesApi.js', () => ({
  fetchBudgetCategories: mockFetchCategories,
}));
const mockFetchSources = jest.fn<typeof SourcesApiTypes.fetchBudgetSources>();
jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSources: mockFetchSources,
}));

const mockCreateWork = jest.fn<typeof WorkBudgetsTypes.createWorkItemBudget>();
const mockUpdateWork = jest.fn<typeof WorkBudgetsTypes.updateWorkItemBudget>();
const mockFetchWork = jest.fn<typeof WorkBudgetsTypes.fetchWorkItemBudgets>();
jest.unstable_mockModule('../../lib/workItemBudgetsApi.js', () => ({
  deleteWorkItemBudget: jest.fn(),
  createWorkItemBudget: mockCreateWork,
  updateWorkItemBudget: mockUpdateWork,
  fetchWorkItemBudgets: mockFetchWork,
}));
const mockCreateHousehold = jest.fn<typeof HouseholdBudgetsTypes.createHouseholdItemBudget>();
const mockUpdateHousehold = jest.fn<typeof HouseholdBudgetsTypes.updateHouseholdItemBudget>();
const mockFetchHousehold = jest.fn<typeof HouseholdBudgetsTypes.fetchHouseholdItemBudgets>();
jest.unstable_mockModule('../../lib/householdItemBudgetsApi.js', () => ({
  deleteHouseholdItemBudget: jest.fn(),
  createHouseholdItemBudget: mockCreateHousehold,
  updateHouseholdItemBudget: mockUpdateHousehold,
  fetchHouseholdItemBudgets: mockFetchHousehold,
}));

const mockFetchInvoiceLines = jest.fn<typeof InvoiceLinesTypes.fetchInvoiceBudgetLines>();
const mockCreateInvoiceLine = jest.fn<typeof InvoiceLinesTypes.createInvoiceBudgetLine>();
const mockEditAndMove = jest.fn<typeof InvoiceLinesTypes.editAndMoveBudgetLine>();
jest.unstable_mockModule('../../lib/invoiceBudgetLinesApi.js', () => ({
  deleteInvoiceBudgetLine: jest.fn(),
  fetchInvoiceBudgetLines: mockFetchInvoiceLines,
  createInvoiceBudgetLine: mockCreateInvoiceLine,
  editAndMoveBudgetLine: mockEditAndMove,
}));
const mockAssign = jest.fn<typeof AssignTypes.assignBudgetLine>();
jest.unstable_mockModule('../../lib/budgetLineAssignApi.js', () => ({
  assignBudgetLine: mockAssign,
}));
const mockBatch = jest.fn<typeof BatchTypes.createBudgetLinesBatch>();
jest.unstable_mockModule('../../lib/budgetLinesBatchApi.js', () => ({
  createBudgetLinesBatch: mockBatch,
}));

const mockFetchVendors = jest.fn<typeof VendorsTypes.fetchVendors>();
const mockFetchVendor = jest.fn<typeof VendorsTypes.fetchVendor>();
const mockCreateVendor = jest.fn<typeof VendorsTypes.createVendor>();
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  searchCompanies: makeSearchCompanies(mockFetchVendors),
  fetchVendor: mockFetchVendor,
  createVendor: mockCreateVendor,
}));
jest.unstable_mockModule('../../hooks/useTrades.js', () => ({
  useTrades: () => ({ trades: [], isLoading: false, isInitialLoading: false, error: null }),
}));

const TASK: CostLineHost = { kind: 'work_item', id: 'wi-1', label: 'Lay floors' };
const PURCHASE: CostLineHost = { kind: 'household_item', id: 'hi-1', label: 'Sofa' };
const INVOICE: CostLineHost = {
  kind: 'invoice',
  id: 'inv-1',
  label: 'Acme Supply · 17',
  status: 'pending',
  amount: 1000,
  vendorId: 'v1',
};
const OFFER: CostLineHost = { ...INVOICE, status: 'quotation' };

const item = (id: string, label: string, areaPath: { id: string; name: string }[] | null = null) =>
  ({
    id,
    label,
    sublabel: null,
    matchedField: 'title',
    status: null,
    kind: null,
    date: null,
    phone: null,
    areaPath,
    parent: null,
  }) as never;

const SEARCH_RESPONSE = {
  query: 'fl',
  groups: [
    {
      type: 'work_item',
      total: 1,
      status: 'ok',
      items: [item('wi-9', 'Lay floors upstairs', [{ id: 'a', name: 'House' }])],
    },
    {
      type: 'household_item',
      total: 1,
      status: 'ok',
      items: [item('hi-9', 'Floor lamp')],
    },
    { type: 'invoice', total: 0, status: 'ok', items: [] },
  ],
} as unknown as Awaited<ReturnType<typeof SearchApiTypes.searchEverywhere>>;

const budgetLine = (id: string, description: string | null, planned: number, linked = false) =>
  ({
    id,
    description,
    plannedAmount: planned,
    includesVat: false,
    quantity: null,
    unit: null,
    unitPrice: null,
    invoiceLink: linked ? { invoiceId: 'x' } : null,
  }) as never;

describe('CostLineForm', () => {
  let Form: typeof FormTypes;
  let media: MatchMediaControl;
  const onSaved = jest.fn<() => void>();
  const onClose = jest.fn<() => void>();

  beforeEach(async () => {
    for (const mock of [
      mockSearch,
      mockFetchCategories,
      mockFetchSources,
      mockCreateWork,
      mockUpdateWork,
      mockFetchWork,
      mockCreateHousehold,
      mockUpdateHousehold,
      mockFetchHousehold,
      mockFetchInvoiceLines,
      mockCreateInvoiceLine,
      mockEditAndMove,
      mockAssign,
      mockBatch,
      mockFetchVendors,
      mockFetchVendor,
      mockCreateVendor,
      onSaved,
      onClose,
    ]) {
      (mock as jest.Mock).mockReset();
    }
    mockFetchCategories.mockResolvedValue({
      categories: [
        { id: 'cat-1', name: 'Materials', translationKey: null },
        { id: 'cat-2', name: 'Labor', translationKey: null },
      ],
    } as never);
    mockFetchSources.mockResolvedValue({
      budgetSources: [
        { id: 'src-1', name: 'Savings', isDiscretionary: false },
        { id: 'src-d', name: 'Discretionary', isDiscretionary: true },
      ],
    } as never);
    mockSearch.mockResolvedValue(SEARCH_RESPONSE);
    mockFetchVendors.mockResolvedValue({
      vendors: [{ id: 'v1', name: 'Acme Supply' }],
    } as never);
    mockFetchVendor.mockRejectedValue(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }));
    mockCreateWork.mockResolvedValue({ id: 'bl-new' } as never);
    mockCreateHousehold.mockResolvedValue({ id: 'bl-new-h' } as never);
    mockUpdateWork.mockResolvedValue({ id: 'bl-1' } as never);
    mockUpdateHousehold.mockResolvedValue({ id: 'bl-1' } as never);
    mockFetchWork.mockResolvedValue([] as never);
    mockFetchHousehold.mockResolvedValue([] as never);
    mockEditAndMove.mockResolvedValue({} as never);
    mockAssign.mockResolvedValue({} as never);
    mockCreateInvoiceLine.mockResolvedValue({ budgetLine: { id: 'ibl-new' } } as never);
    mockBatch.mockResolvedValue({
      lines: [{ index: 0, budgetLineId: 'bl-batch', budgetLineType: 'work_item' }],
      remainingAmount: 0,
    } as never);
    media = installMatchMedia({ '(min-width: 768px)': true });
    if (!Form) Form = await import('./CostLineForm.js');
  });

  afterEach(() => {
    media.restore();
    delete document.documentElement.dataset.scrollLocked;
  });

  async function renderForm(props: Partial<CostLineFormProps> & { host?: CostLineHost } = {}) {
    render(
      <MemoryRouter>
        <Form.CostLineForm
          host={TASK}
          mode={{ kind: 'create' }}
          onSaved={onSaved}
          onClose={onClose}
          {...props}
        />
      </MemoryRouter>,
    );
    await screen.findByRole('dialog');
    // The option lists load once; the funding source defaults from them.
    await waitFor(() => expect(mockFetchSources).toHaveBeenCalled());
  }

  const save = () => screen.getByTestId('cost-line-form-save');
  const more = () => screen.getByTestId('cost-line-form-more');
  const description = () => screen.getByLabelText(/^Description/) as HTMLInputElement;
  const openMore = async (user: ReturnType<typeof userEvent.setup>) => {
    if (more().getAttribute('aria-expanded') !== 'true') await user.click(more());
  };

  async function pickTarget(user: ReturnType<typeof userEvent.setup>, optionName: RegExp) {
    await user.type(screen.getByLabelText(/^Belongs to/), 'fl');
    await user.click(await screen.findByRole('option', { name: optionName }));
  }

  describe('create on a task', () => {
    it('starts with unit pricing and Net selected and shows the gross with VAT', async () => {
      const user = userEvent.setup();
      await renderForm();

      expect(screen.getByRole('dialog', { name: 'New cost line' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Net' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Gross' })).not.toBeChecked();
      // Visible-text naming; the toggle carries no pressed state.
      expect(screen.getByRole('radio', { name: 'Net' })).not.toHaveAttribute('aria-pressed');
      expect(screen.getByText('VAT at 19% is added to net prices.')).toBeInTheDocument();
      expect(screen.queryByTestId('cost-line-amount')).toBeNull();

      await user.type(screen.getByLabelText('Quantity'), '10');
      await user.type(screen.getByLabelText('Unit price'), '50');
      expect(screen.getByTestId('cost-line-result')).toHaveTextContent(
        'Gross €595.00 (net €500.00 + VAT 19%)',
      );
    });

    it('describes a gross entry and drops the net hint', async () => {
      const user = userEvent.setup();
      await renderForm();
      await user.type(screen.getByLabelText('Quantity'), '1');
      await user.type(screen.getByLabelText('Unit price'), '119');
      await user.click(screen.getByRole('radio', { name: 'Gross' }));

      expect(screen.getByRole('radio', { name: 'Gross' })).toBeChecked();
      expect(screen.queryByText('VAT at 19% is added to net prices.')).toBeNull();
      expect(screen.getByTestId('cost-line-result')).toHaveTextContent(
        'Gross €119.00 (includes VAT 19%, net €100.00)',
      );
    });

    it('shows an empty result while the price is incomplete', async () => {
      await renderForm();
      expect(screen.getByTestId('cost-line-result')).toBeEmptyDOMElement();
    });

    it('saves a net unit-priced line on the task with the discretionary source', async () => {
      const user = userEvent.setup();
      await renderForm();
      await user.type(description(), ' Oak flooring ');
      await user.type(screen.getByLabelText('Quantity'), '10');
      await user.type(screen.getByLabelText('Unit'), 'm2');
      await user.type(screen.getByLabelText('Unit price'), '50');
      await user.click(save());

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(mockCreateWork).toHaveBeenCalledWith('wi-1', {
        description: 'Oak flooring',
        plannedAmount: 500,
        quantity: 10,
        unit: 'm2',
        unitPrice: 50,
        includesVat: false,
        confidence: 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: 'src-d',
        vendorId: null,
      });
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    it('creates the line on a purchase through the household endpoint', async () => {
      const user = userEvent.setup();
      await renderForm({ host: PURCHASE });
      expect(screen.getByRole('dialog', { name: 'New cost line' })).toBeInTheDocument();
      await user.type(description(), 'Cushions');
      await user.type(screen.getByLabelText('Quantity'), '2');
      await user.type(screen.getByLabelText('Unit price'), '30');
      await user.click(save());

      await waitFor(() => expect(mockCreateHousehold).toHaveBeenCalledTimes(1));
      expect(mockCreateHousehold.mock.calls[0]![0]).toBe('hi-1');
      expect(mockCreateWork).not.toHaveBeenCalled();
    });

    it('shows validation messages and sends nothing for an empty form', async () => {
      const user = userEvent.setup();
      await renderForm();
      await user.click(save());

      expect(await screen.findByText('Enter a description.')).toBeInTheDocument();
      expect(screen.getByText('Enter a quantity above 0.')).toBeInTheDocument();
      expect(screen.getByText('Enter a unit price of 0 or more.')).toBeInTheDocument();
      expect(mockCreateWork).not.toHaveBeenCalled();
      await waitFor(() => expect(description()).toHaveFocus());
    });

    it('prices a line as a direct amount from More details', async () => {
      const user = userEvent.setup();
      await renderForm();
      await user.type(description(), 'Skip hire');
      await openMore(user);
      await user.selectOptions(screen.getByLabelText('Pricing'), 'direct');

      expect(screen.queryByLabelText('Quantity')).toBeNull();
      await user.type(screen.getByTestId('cost-line-amount'), '80');
      expect(screen.getByTestId('cost-line-result')).toHaveTextContent('Gross €95.20');
      await user.click(save());

      await waitFor(() => expect(mockCreateWork).toHaveBeenCalledTimes(1));
      expect(mockCreateWork.mock.calls[0]![1]).toMatchObject({
        plannedAmount: 80,
        quantity: null,
        unitPrice: null,
        includesVat: false,
      });
    });

    it('rejects a direct amount that is not a number', async () => {
      const user = userEvent.setup();
      await renderForm();
      await user.type(description(), 'Skip hire');
      await openMore(user);
      await user.selectOptions(screen.getByLabelText('Pricing'), 'direct');
      await user.click(save());

      expect(await screen.findByText('Enter an amount of 0 or more.')).toBeInTheDocument();
      expect(mockCreateWork).not.toHaveBeenCalled();
    });

    it('sends the chosen category, funding source, Basis and company', async () => {
      const user = userEvent.setup();
      await renderForm();
      await user.type(description(), 'Paint');
      await user.type(screen.getByLabelText('Quantity'), '1');
      await user.type(screen.getByLabelText('Unit price'), '20');
      await openMore(user);
      await user.selectOptions(screen.getByLabelText('Cost category'), 'cat-2');
      await user.selectOptions(screen.getByLabelText('Funding source'), 'src-1');
      await user.selectOptions(screen.getByLabelText('Basis'), 'professional_estimate');
      await user.type(screen.getByLabelText('Company'), 'Acme');
      await user.click(await screen.findByRole('option', { name: 'Acme Supply' }));
      await user.click(save());

      await waitFor(() => expect(mockCreateWork).toHaveBeenCalledTimes(1));
      expect(mockCreateWork.mock.calls[0]![1]).toMatchObject({
        budgetCategoryId: 'cat-2',
        budgetSourceId: 'src-1',
        confidence: 'professional_estimate',
        vendorId: 'v1',
      });
    });

    it('lists the funding sources with the discretionary one first and the categories named', async () => {
      const user = userEvent.setup();
      await renderForm();
      await openMore(user);
      const sources = within(screen.getByLabelText('Funding source')).getAllByRole('option');
      expect(sources.map((o) => o.textContent)).toEqual(['Discretionary', 'Savings']);
      const categories = within(screen.getByLabelText('Cost category')).getAllByRole('option');
      expect(categories.map((o) => o.textContent)).toEqual(['None', 'Materials', 'Labor']);
    });

    it('opens a New company child step from the company picker and returns with it set', async () => {
      const user = userEvent.setup();
      mockCreateVendor.mockResolvedValue({ id: 'v-new', name: 'Brand New Co' } as never);
      // The vendor lookup stays at its 404 default: the created company is remembered by the
      // schema, so its name must survive the rebuild without a successful lookup.
      await renderForm();
      await user.type(description(), 'Paint');
      await user.type(screen.getByLabelText('Quantity'), '1');
      await user.type(screen.getByLabelText('Unit price'), '20');
      await openMore(user);
      await user.type(screen.getByLabelText('Company'), 'Brand New Co');
      await user.click(await screen.findByRole('option', { name: 'New company Brand New Co' }));

      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(await screen.findByTestId('company-name-input')).toHaveValue('Brand New Co');
      await user.click(save());

      await waitFor(() => expect(mockCreateVendor).toHaveBeenCalledTimes(1));
      expect(await screen.findByText('Brand New Co')).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'New cost line' })).toBeInTheDocument();
      expect(mockFetchVendor).not.toHaveBeenCalledWith('v-new');
      await user.click(save());
      await waitFor(() => expect(mockCreateWork).toHaveBeenCalledTimes(1));
      expect(mockCreateWork.mock.calls[0]![1]).toMatchObject({ vendorId: 'v-new' });
    });

    it('closes through Cancel without saving', async () => {
      const user = userEvent.setup();
      await renderForm();
      await user.click(screen.getByTestId('cost-line-form-cancel'));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('shows a notice under Cost category when the options cannot be loaded', async () => {
      const user = userEvent.setup();
      mockFetchCategories.mockRejectedValue(new Error('offline'));
      await renderForm();
      await openMore(user);
      expect(await screen.findByText('The cost lines could not be loaded.')).toBeInTheDocument();
    });
  });

  describe('Add another', () => {
    it('keeps the dialog open, clears the line fields, keeps the sticky ones and announces it', async () => {
      const user = userEvent.setup();
      await renderForm();
      await user.type(description(), 'Tile');
      await user.type(screen.getByLabelText('Quantity'), '4');
      await user.type(screen.getByLabelText('Unit'), 'm2');
      await user.type(screen.getByLabelText('Unit price'), '25');
      await user.click(screen.getByRole('radio', { name: 'Gross' }));
      await user.click(screen.getByTestId('cost-line-form-add-another'));
      await user.click(save());

      await waitFor(() => expect(mockCreateWork).toHaveBeenCalledTimes(1));
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
      expect(await screen.findByText(/Saved\. Add the next line\./)).toBeInTheDocument();
      expect(description()).toHaveValue('');
      expect(screen.getByLabelText('Quantity')).toHaveValue(null);
      expect(screen.getByLabelText('Unit price')).toHaveValue(null);
      expect(screen.getByRole('radio', { name: 'Gross' })).toBeChecked();
      await waitFor(() => expect(description()).toHaveFocus());
    });

    it('is not offered when editing', async () => {
      await renderForm({ mode: { kind: 'edit', row: makeCostLineRow() } });
      expect(screen.queryByTestId('cost-line-form-add-another')).toBeNull();
    });
  });

  describe('while saving', () => {
    it('ignores toggles and selects until the save settles', async () => {
      const user = userEvent.setup();
      let release: (value: never) => void = () => {};
      mockCreateWork.mockReturnValue(new Promise((resolve) => (release = resolve)) as never);
      await renderForm();
      await user.type(description(), 'Tile');
      await user.type(screen.getByLabelText('Quantity'), '1');
      await user.type(screen.getByLabelText('Unit price'), '10');
      await openMore(user);
      await user.click(save());
      await waitFor(() => expect(mockCreateWork).toHaveBeenCalled());

      await user.click(screen.getByRole('radio', { name: 'Gross' }));
      expect(screen.getByRole('radio', { name: 'Net' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Net' })).toHaveAttribute('aria-disabled', 'true');
      await user.selectOptions(screen.getByLabelText('Basis'), 'professional_estimate');
      expect(screen.getByLabelText('Basis')).toHaveValue('own_estimate');

      release({ id: 'bl-x' } as never);
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });
  });

  describe('create on an offer or invoice', () => {
    it('asks for the target before anything else and shows no Basis', async () => {
      const user = userEvent.setup();
      await renderForm({ host: INVOICE });
      expect(screen.getByLabelText(/^Belongs to/)).toBeInTheDocument();
      expect(screen.queryByLabelText('Line')).toBeNull();
      await openMore(user);
      expect(screen.queryByLabelText('Basis')).toBeNull();

      await user.type(description(), 'Tiles');
      await user.click(save());
      expect(await screen.findByText('Pick a task or purchase.')).toBeInTheDocument();
      expect(mockBatch).not.toHaveBeenCalled();
    });

    it('searches tasks and purchases together once two letters are typed', async () => {
      const user = userEvent.setup();
      await renderForm({ host: INVOICE });
      await user.type(screen.getByLabelText(/^Belongs to/), 'f');
      expect(mockSearch).not.toHaveBeenCalled();
      await user.type(screen.getByLabelText(/^Belongs to/), 'l');

      const task = await screen.findByRole('option', { name: /Lay floors upstairs/ });
      expect(task).toHaveTextContent('Task');
      expect(task).toHaveTextContent('House');
      expect(screen.getByRole('option', { name: /Floor lamp/ })).toHaveTextContent('Purchase');
      expect(mockSearch).toHaveBeenCalledWith(
        { q: 'fl', types: ['work_item', 'household_item'], limit: 10 },
        expect.anything(),
      );
    });

    it('saves a new line through the batch endpoint with the offer as Basis', async () => {
      const user = userEvent.setup();
      await renderForm({ host: OFFER });
      await user.type(description(), 'Tiles');
      await pickTarget(user, /Lay floors upstairs/);
      await user.type(screen.getByLabelText('Quantity'), '2');
      await user.type(screen.getByLabelText('Unit price'), '100');
      await user.click(save());

      await waitFor(() => expect(mockBatch).toHaveBeenCalledTimes(1));
      expect(mockBatch.mock.calls[0]![0]).toEqual({
        invoiceId: 'inv-1',
        lines: [
          {
            kind: 'create',
            targetType: 'work_item',
            targetId: 'wi-9',
            description: 'Tiles',
            plannedAmount: 200,
            quantity: 2,
            unit: null,
            unitPrice: 100,
            includesVat: false,
            confidence: 'quote',
            budgetCategoryId: null,
            budgetSourceId: 'src-d',
            vendorId: null,
          },
        ],
      });
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(onSaved).toHaveBeenCalled();
    });

    it('creates a purchase line with the invoice as Basis', async () => {
      const user = userEvent.setup();
      await renderForm({ host: INVOICE });
      await user.type(description(), 'Lamp shade');
      await pickTarget(user, /Floor lamp/);
      await user.type(screen.getByLabelText('Quantity'), '1');
      await user.type(screen.getByLabelText('Unit price'), '10');
      await user.click(save());

      await waitFor(() => expect(mockBatch).toHaveBeenCalledTimes(1));
      const line = (
        mockBatch.mock.calls[0]![0].lines as unknown as Array<Record<string, unknown>>
      )[0]!;
      expect(line).toMatchObject({ targetType: 'household_item', confidence: 'invoice' });
    });

    it("offers the target's unlinked lines and links a picked one without a price", async () => {
      const user = userEvent.setup();
      mockFetchWork.mockResolvedValue([
        budgetLine('bl-a', 'Old estimate', 200),
        budgetLine('bl-b', null, 50),
        budgetLine('bl-linked', 'Already linked', 10, true),
      ]);
      mockFetchInvoiceLines.mockResolvedValue({ remainingAmount: 100 } as never);
      await renderForm({ host: INVOICE });
      await user.type(description(), 'Tiles');
      expect(screen.queryByLabelText('Line')).toBeNull();
      await pickTarget(user, /Lay floors upstairs/);

      const select = await screen.findByTestId('cost-line-existing');
      const options = within(select)
        .getAllByRole('option')
        .map((o) => o.textContent);
      expect(options).toEqual([
        'New line',
        'Old estimate · €238.00',
        'Line without a description · €59.50',
      ]);
      await user.selectOptions(select, 'bl-a');

      // The price fields and the Entered as group give way to a single amount.
      expect(screen.queryByLabelText('Quantity')).toBeNull();
      expect(screen.queryByText('Entered as')).toBeNull();
      expect(screen.getByTestId('cost-line-amount')).toHaveAttribute('placeholder', '€238.00');
      await user.click(save());

      // Empty amount = the line's own gross, capped at what is left on the document.
      await waitFor(() => expect(mockCreateInvoiceLine).toHaveBeenCalledTimes(1));
      expect(mockCreateInvoiceLine).toHaveBeenCalledWith('inv-1', {
        invoiceId: 'inv-1',
        workItemBudgetId: 'bl-a',
        itemizedAmount: 100,
      });
      expect(mockBatch).not.toHaveBeenCalled();
    });

    it('uses the typed amount of a picked line without asking for the remaining amount', async () => {
      const user = userEvent.setup();
      mockFetchWork.mockResolvedValue([budgetLine('bl-a', 'Old estimate', 200)]);
      await renderForm({ host: INVOICE });
      await user.type(description(), 'Tiles');
      await pickTarget(user, /Lay floors upstairs/);
      await user.selectOptions(await screen.findByTestId('cost-line-existing'), 'bl-a');
      await user.type(screen.getByTestId('cost-line-amount'), '75');
      await user.click(save());

      await waitFor(() => expect(mockCreateInvoiceLine).toHaveBeenCalledTimes(1));
      expect(mockCreateInvoiceLine.mock.calls[0]![1]).toMatchObject({ itemizedAmount: 75 });
      expect(mockFetchInvoiceLines).not.toHaveBeenCalled();
    });

    it("uses the line's own gross when nothing is left on the document", async () => {
      const user = userEvent.setup();
      mockFetchWork.mockResolvedValue([budgetLine('bl-a', 'Old estimate', 200)]);
      mockFetchInvoiceLines.mockResolvedValue({ remainingAmount: 0 } as never);
      await renderForm({ host: INVOICE });
      await user.type(description(), 'Tiles');
      await pickTarget(user, /Lay floors upstairs/);
      await user.selectOptions(await screen.findByTestId('cost-line-existing'), 'bl-a');
      await user.click(save());

      await waitFor(() => expect(mockCreateInvoiceLine).toHaveBeenCalledTimes(1));
      expect(mockCreateInvoiceLine.mock.calls[0]![1]).toMatchObject({ itemizedAmount: 238 });
    });

    it('links a purchase line through householdItemBudgetId', async () => {
      const user = userEvent.setup();
      mockFetchHousehold.mockResolvedValue([budgetLine('bl-h', 'Cover', 100)]);
      mockFetchInvoiceLines.mockResolvedValue({ remainingAmount: 500 } as never);
      await renderForm({ host: INVOICE });
      await user.type(description(), 'Cover');
      await pickTarget(user, /Floor lamp/);
      await user.selectOptions(await screen.findByTestId('cost-line-existing'), 'bl-h');
      await user.click(save());

      await waitFor(() => expect(mockCreateInvoiceLine).toHaveBeenCalledTimes(1));
      expect(mockCreateInvoiceLine.mock.calls[0]![1]).toEqual({
        invoiceId: 'inv-1',
        householdItemBudgetId: 'bl-h',
        itemizedAmount: 119,
      });
    });

    it('rejects a zero amount for a picked line', async () => {
      const user = userEvent.setup();
      mockFetchWork.mockResolvedValue([budgetLine('bl-a', 'Old estimate', 200)]);
      await renderForm({ host: INVOICE });
      await user.type(description(), 'Tiles');
      await pickTarget(user, /Lay floors upstairs/);
      await user.selectOptions(await screen.findByTestId('cost-line-existing'), 'bl-a');
      await user.type(screen.getByTestId('cost-line-amount'), '0');
      await user.click(save());

      expect(await screen.findByText('Enter an amount above 0.')).toBeInTheDocument();
      expect(mockCreateInvoiceLine).not.toHaveBeenCalled();
    });

    it('drops a pick that belongs to the previous target when the target changes', async () => {
      const user = userEvent.setup();
      mockFetchWork.mockResolvedValue([budgetLine('bl-a', 'Old estimate', 200)]);
      mockFetchHousehold.mockResolvedValue([]);
      await renderForm({ host: INVOICE });
      await user.type(description(), 'Tiles');
      await pickTarget(user, /Lay floors upstairs/);
      await user.selectOptions(await screen.findByTestId('cost-line-existing'), 'bl-a');
      expect(screen.queryByLabelText('Quantity')).toBeNull();

      await user.click(screen.getByRole('button', { name: /clear/i }));
      await pickTarget(user, /Floor lamp/);
      await waitFor(() => expect(screen.getByTestId('cost-line-existing')).toHaveValue(''));
      expect(screen.getByLabelText('Quantity')).toBeInTheDocument();
    });

    it("shows a load error when the target's lines cannot be loaded", async () => {
      const user = userEvent.setup();
      mockFetchWork.mockRejectedValue(new Error('offline'));
      await renderForm({ host: INVOICE });
      await pickTarget(user, /Lay floors upstairs/);
      expect(await screen.findByText('The cost lines could not be loaded.')).toBeInTheDocument();
      expect(screen.queryByTestId('cost-line-existing')).toBeNull();
    });

    it('ignores the existing line select while saving', async () => {
      const user = userEvent.setup();
      mockFetchWork.mockResolvedValue([budgetLine('bl-a', 'Old estimate', 200)]);
      mockFetchInvoiceLines.mockResolvedValue({ remainingAmount: 100 } as never);
      let release: (value: never) => void = () => {};
      mockCreateInvoiceLine.mockReturnValue(new Promise((resolve) => (release = resolve)) as never);
      await renderForm({ host: INVOICE });
      await user.type(description(), 'Tiles');
      await pickTarget(user, /Lay floors upstairs/);
      const select = await screen.findByTestId('cost-line-existing');
      await user.selectOptions(select, 'bl-a');
      await user.click(save());
      await waitFor(() => expect(mockCreateInvoiceLine).toHaveBeenCalled());

      await user.selectOptions(select, '');
      expect(select).toHaveValue('bl-a');
      release({ budgetLine: { id: 'ibl' } } as never);
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('puts the over-invoice error under the unit price', async () => {
      const user = userEvent.setup();
      mockBatch.mockRejectedValue(
        new ApiClientError(400, {
          code: 'ITEMIZED_SUM_EXCEEDS_INVOICE',
          message: 'server text',
          details: { index: 0 },
        }),
      );
      await renderForm({ host: INVOICE });
      await user.type(description(), 'Tiles');
      await pickTarget(user, /Lay floors upstairs/);
      await user.type(screen.getByLabelText('Quantity'), '1');
      await user.type(screen.getByLabelText('Unit price'), '5000');
      await user.click(save());

      const message = 'The cost lines would be more than this offer or invoice is worth.';
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getByLabelText('Unit price')).toHaveAttribute('aria-invalid', 'true');
      expect(document.body.textContent).not.toContain('server text');
    });

    it('puts the over-invoice error under the amount for a direct line', async () => {
      const user = userEvent.setup();
      mockBatch.mockRejectedValue(
        new ApiClientError(400, { code: 'ITEMIZED_SUM_EXCEEDS_INVOICE', message: 'm' }),
      );
      await renderForm({ host: INVOICE });
      await user.type(description(), 'Tiles');
      await pickTarget(user, /Lay floors upstairs/);
      await openMore(user);
      await user.selectOptions(screen.getByLabelText('Pricing'), 'direct');
      await user.type(screen.getByTestId('cost-line-amount'), '5000');
      await user.click(save());

      await screen.findByText(/would be more than this offer or invoice/);
      expect(screen.getByTestId('cost-line-amount')).toHaveAttribute('aria-invalid', 'true');
    });

    it('puts the already-linked error under the existing line field', async () => {
      const user = userEvent.setup();
      mockFetchWork.mockResolvedValue([budgetLine('bl-a', 'Old estimate', 200)]);
      mockFetchInvoiceLines.mockResolvedValue({ remainingAmount: 100 } as never);
      mockCreateInvoiceLine.mockRejectedValue(
        new ApiClientError(409, { code: 'BUDGET_LINE_ALREADY_LINKED', message: 'm' }),
      );
      await renderForm({ host: INVOICE });
      await user.type(description(), 'Tiles');
      await pickTarget(user, /Lay floors upstairs/);
      await user.selectOptions(await screen.findByTestId('cost-line-existing'), 'bl-a');
      await user.click(save());

      expect(
        await screen.findByText('This line is already linked to an offer or invoice.'),
      ).toBeInTheDocument();
    });

    it('shows other server errors as the generic banner', async () => {
      const user = userEvent.setup();
      mockBatch.mockRejectedValue(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'm' }),
      );
      await renderForm({ host: INVOICE });
      await user.type(description(), 'Tiles');
      await pickTarget(user, /Lay floors upstairs/);
      await user.type(screen.getByLabelText('Quantity'), '1');
      await user.type(screen.getByLabelText('Unit price'), '5');
      await user.click(save());
      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });
  });

  describe('edit', () => {
    it('opens prefilled and sends only the changed field to the task', async () => {
      const user = userEvent.setup();
      await renderForm({ mode: { kind: 'edit', row: makeCostLineRow() } });

      expect(screen.getByRole('dialog', { name: 'Edit cost line' })).toBeInTheDocument();
      expect(description()).toHaveValue('Oak flooring');
      expect(screen.getByLabelText('Quantity')).toHaveValue(10);
      expect(screen.getByLabelText('Unit price')).toHaveValue(50);
      await user.clear(description());
      await user.type(description(), 'Oak parquet');
      await user.click(save());

      await waitFor(() => expect(mockUpdateWork).toHaveBeenCalledTimes(1));
      expect(mockUpdateWork).toHaveBeenCalledWith('wi-1', 'bl-1', { description: 'Oak parquet' });
      expect(onSaved).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('edits a purchase line through the household endpoint', async () => {
      const user = userEvent.setup();
      const row = makeCostLineRow({
        lineType: 'household_item',
        target: { type: 'household_item', id: 'hi-1', label: 'Sofa' },
      });
      await renderForm({ host: PURCHASE, mode: { kind: 'edit', row } });
      await user.type(description(), '!');
      await user.click(save());
      await waitFor(() => expect(mockUpdateHousehold).toHaveBeenCalledTimes(1));
      expect(mockUpdateHousehold.mock.calls[0]!.slice(0, 2)).toEqual(['hi-1', 'bl-1']);
    });

    it('falls back to the host when an unlinked line has no target', async () => {
      const user = userEvent.setup();
      const row = makeCostLineRow({ target: null });
      await renderForm({ mode: { kind: 'edit', row } });
      await user.type(description(), '!');
      await user.click(save());
      await waitFor(() => expect(mockUpdateWork).toHaveBeenCalledTimes(1));
      expect(mockUpdateWork.mock.calls[0]![0]).toBe('wi-1');
    });

    it('sends nothing when nothing changed but still tells the host and closes', async () => {
      const user = userEvent.setup();
      await renderForm({ mode: { kind: 'edit', row: makeCostLineRow() } });
      await user.click(save());
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(mockUpdateWork).not.toHaveBeenCalled();
      expect(mockEditAndMove).not.toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalled();
    });

    it('moves an unlinked line to another task through newWorkItemId', async () => {
      const user = userEvent.setup();
      await renderForm({ mode: { kind: 'edit', row: makeCostLineRow() } });
      await openMore(user);
      await user.click(within(screen.getByTestId('cost-line-target')).getByRole('button'));
      await user.type(screen.getByLabelText(/Belongs to/), 'fl');
      await user.click(await screen.findByRole('option', { name: /Lay floors upstairs/ }));
      await user.click(save());

      await waitFor(() => expect(mockUpdateWork).toHaveBeenCalledTimes(1));
      expect(mockUpdateWork).toHaveBeenCalledWith('wi-1', 'bl-1', { newWorkItemId: 'wi-9' });
    });

    it('refuses to move an unlinked line to a purchase', async () => {
      const user = userEvent.setup();
      await renderForm({ mode: { kind: 'edit', row: makeCostLineRow() } });
      await openMore(user);
      await user.click(within(screen.getByTestId('cost-line-target')).getByRole('button'));
      await user.type(screen.getByLabelText(/Belongs to/), 'fl');
      await user.click(await screen.findByRole('option', { name: /Floor lamp/ }));
      await user.click(save());

      expect(
        await screen.findByText(
          'A line without an offer or invoice can only move to the same kind of item.',
        ),
      ).toBeInTheDocument();
      expect(mockUpdateWork).not.toHaveBeenCalled();
    });

    it('edits a linked line through the invoice and carries the itemized gross, never the Basis', async () => {
      const user = userEvent.setup();
      const row = makeLinkedRow();
      await renderForm({ host: INVOICE, mode: { kind: 'edit', row } });
      await user.clear(screen.getByLabelText('Unit price'));
      await user.type(screen.getByLabelText('Unit price'), '100');
      await user.click(save());

      await waitFor(() => expect(mockEditAndMove).toHaveBeenCalledTimes(1));
      const [invoiceId, lineId, payload] = mockEditAndMove.mock.calls[0]!;
      expect([invoiceId, lineId]).toEqual(['inv-1', 'ibl-1']);
      expect(payload).toMatchObject({ unitPrice: 100, plannedAmount: 1000, itemizedAmount: 1190 });
      expect(payload).not.toHaveProperty('confidence');
    });

    it("shows a linked line's Basis as read-only text with the reason", async () => {
      const user = userEvent.setup();
      await renderForm({ host: INVOICE, mode: { kind: 'edit', row: makeLinkedRow() } });
      await openMore(user);
      const basis = screen.getByTestId('cost-line-basis-locked');
      expect(basis).toHaveValue('Invoice');
      expect(basis).toHaveAttribute('readonly');
      expect(basis).not.toBeDisabled();
      expect(screen.getByText('Set by the linked invoice')).toBeInTheDocument();
      expect(screen.queryByTestId('cost-line-basis')).toBeNull();
    });

    it('names the offer as the reason for a quoted line', async () => {
      const user = userEvent.setup();
      const row = makeLinkedRow({ invoiceStatus: 'quotation', basis: 'quote' });
      await renderForm({ host: OFFER, mode: { kind: 'edit', row } });
      await openMore(user);
      expect(screen.getByTestId('cost-line-basis-locked')).toHaveValue('Offer');
      expect(screen.getByText('Set by the linked offer')).toBeInTheDocument();
    });

    it('opens a linked line with a differing estimate as one gross direct amount', async () => {
      const user = userEvent.setup();
      const row = makeLinkedRow({ estimateDiffers: true, gross: 700 });
      await renderForm({ host: INVOICE, mode: { kind: 'edit', row } });
      expect(screen.getByTestId('cost-line-amount')).toHaveValue(700);
      expect(screen.getByRole('radio', { name: 'Gross' })).toBeChecked();
      await openMore(user);
      expect(screen.getByLabelText('Pricing')).toHaveValue('direct');
    });

    it('keeps a legacy Basis selectable on an unlinked line', async () => {
      const user = userEvent.setup();
      const row = makeCostLineRow({ basis: 'quote' });
      await renderForm({ mode: { kind: 'edit', row } });
      await openMore(user);
      const levels = within(screen.getByTestId('cost-line-basis'))
        .getAllByRole('option')
        .map((o) => o.textContent);
      expect(levels).toEqual(['Own estimate', 'Professional estimate', 'Offer']);
    });

    it('shows the saved company by name without looking it up', async () => {
      const user = userEvent.setup();
      const row = makeCostLineRow({ vendorId: 'v1', vendorName: 'Acme Supply' });
      await renderForm({ mode: { kind: 'edit', row } });
      await openMore(user);
      expect(await screen.findByText('Acme Supply')).toBeInTheDocument();
      expect(mockFetchVendor).not.toHaveBeenCalled();
    });

    it('drops a company that no longer exists', async () => {
      const user = userEvent.setup();
      const row = makeCostLineRow({ vendorId: 'v-gone', vendorName: null });
      await renderForm({ mode: { kind: 'edit', row } });
      await openMore(user);
      await waitFor(() => expect(mockFetchVendor).toHaveBeenCalledWith('v-gone'));
      await user.click(save());
      // The unknown company was cleared, which is a change from the saved id.
      await waitFor(() => expect(mockUpdateWork).toHaveBeenCalledTimes(1));
      expect(mockUpdateWork.mock.calls[0]![2]).toMatchObject({ vendorId: null });
    });
  });

  describe('assign', () => {
    const orphan = () => makeLinkedRow({ target: null });

    it('requires a target', async () => {
      const user = userEvent.setup();
      await renderForm({ host: INVOICE, mode: { kind: 'assign', row: orphan() } });
      expect(screen.getByRole('dialog', { name: 'Assign cost line' })).toBeInTheDocument();
      await user.click(save());
      expect(await screen.findByText('Pick a task or purchase.')).toBeInTheDocument();
      expect(mockAssign).not.toHaveBeenCalled();
    });

    it('assigns the line to the picked task with its category', async () => {
      const user = userEvent.setup();
      await renderForm({ host: INVOICE, mode: { kind: 'assign', row: orphan() } });
      await pickTarget(user, /Lay floors upstairs/);
      await user.click(save());

      await waitFor(() => expect(mockAssign).toHaveBeenCalledTimes(1));
      expect(mockAssign).toHaveBeenCalledWith('bl-1', {
        targetType: 'work_item',
        targetId: 'wi-9',
        budgetCategoryId: 'cat-1',
      });
      expect(mockEditAndMove).not.toHaveBeenCalled();
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('sends other changed fields in a follow-up edit without repeating the move', async () => {
      const user = userEvent.setup();
      await renderForm({ host: INVOICE, mode: { kind: 'assign', row: orphan() } });
      await pickTarget(user, /Floor lamp/);
      await user.type(description(), ' (hall)');
      await user.click(save());

      await waitFor(() => expect(mockEditAndMove).toHaveBeenCalledTimes(1));
      expect(mockAssign.mock.calls[0]![1]).toMatchObject({ targetType: 'household_item' });
      const payload = mockEditAndMove.mock.calls[0]![2];
      expect(payload).toEqual({ description: 'Oak flooring (hall)' });
    });
  });
});
