/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type React from 'react';
import type * as SubsidyProgramsApiTypes from '../../lib/subsidyProgramsApi.js';
import type * as BudgetCategoriesApiTypes from '../../lib/budgetCategoriesApi.js';
import type * as BudgetOverviewApiTypes from '../../lib/budgetOverviewApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import type {
  SubsidyProgram,
  SubsidyProgramListResponse,
  BudgetCategory,
  BudgetCategoryListResponse,
} from '@cornerstone/shared';

// Mock both API modules BEFORE importing the component
const mockFetchSubsidyPrograms = jest.fn<typeof SubsidyProgramsApiTypes.fetchSubsidyPrograms>();
const mockFetchSubsidyProgram = jest.fn<typeof SubsidyProgramsApiTypes.fetchSubsidyProgram>();
const mockCreateSubsidyProgram = jest.fn<typeof SubsidyProgramsApiTypes.createSubsidyProgram>();
const mockUpdateSubsidyProgram = jest.fn<typeof SubsidyProgramsApiTypes.updateSubsidyProgram>();
const mockDeleteSubsidyProgram = jest.fn<typeof SubsidyProgramsApiTypes.deleteSubsidyProgram>();

const mockFetchBudgetOverview = jest.fn<typeof BudgetOverviewApiTypes.fetchBudgetOverview>();

const mockFetchBudgetCategories = jest.fn<typeof BudgetCategoriesApiTypes.fetchBudgetCategories>();
const mockCreateBudgetCategory = jest.fn<typeof BudgetCategoriesApiTypes.createBudgetCategory>();
const mockUpdateBudgetCategory = jest.fn<typeof BudgetCategoriesApiTypes.updateBudgetCategory>();
const mockDeleteBudgetCategory = jest.fn<typeof BudgetCategoriesApiTypes.deleteBudgetCategory>();

jest.unstable_mockModule('../../lib/subsidyProgramsApi.js', () => ({
  fetchSubsidyPrograms: mockFetchSubsidyPrograms,
  fetchSubsidyProgram: mockFetchSubsidyProgram,
  createSubsidyProgram: mockCreateSubsidyProgram,
  updateSubsidyProgram: mockUpdateSubsidyProgram,
  deleteSubsidyProgram: mockDeleteSubsidyProgram,
}));

jest.unstable_mockModule('../../lib/budgetCategoriesApi.js', () => ({
  fetchBudgetCategories: mockFetchBudgetCategories,
  createBudgetCategory: mockCreateBudgetCategory,
  updateBudgetCategory: mockUpdateBudgetCategory,
  deleteBudgetCategory: mockDeleteBudgetCategory,
}));

jest.unstable_mockModule('../../lib/budgetOverviewApi.js', () => ({
  fetchBudgetOverview: mockFetchBudgetOverview,
  fetchBudgetBreakdown: jest.fn(),
}));

// ─── Mock: LinkedDocumentsSection — avoids deep dependency chain (Paperless hooks, etc.) ───

// Capture the last props passed to LinkedDocumentsSection so tests can assert them
// (prefixed with _ because assertions use DOM data-attributes, not this variable directly)
let _capturedLinkedDocsSectionProps: { entityType: string; entityId: string } | null = null;

jest.unstable_mockModule('../../components/documents/LinkedDocumentsSection.js', () => ({
  LinkedDocumentsSection: function MockLinkedDocumentsSection(props: {
    entityType: string;
    entityId: string;
  }) {
    _capturedLinkedDocsSectionProps = { entityType: props.entityType, entityId: props.entityId };
    return (
      <div
        data-testid="linked-documents-section"
        data-entity-type={props.entityType}
        data-entity-id={props.entityId}
      />
    );
  },
}));

// ─── Mock: formatters — provides useFormatters() hook ────────────────────────

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  const fmtDate = (d: string | null | undefined, fallback = '—') => {
    if (!d) return fallback;
    const [year, month, day] = d.slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return fallback;
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };
  const fmtTime = (ts: string | null | undefined, fallback = '—') => ts ?? fallback;
  const fmtDateTime = (ts: string | null | undefined, fallback = '—') => ts ?? fallback;
  return {
    formatCurrency: fmtCurrency,
    formatDate: fmtDate,
    formatTime: fmtTime,
    formatDateTime: fmtDateTime,
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
    computeActualDuration: () => null,
    useFormatters: () => ({
      formatCurrency: fmtCurrency,
      formatDate: fmtDate,
      formatTime: fmtTime,
      formatDateTime: fmtDateTime,
      formatPercent: (n: number) => `${n.toFixed(2)}%`,
    }),
  };
});

// ─── Mock: LocaleContext — prevents useLocale() from throwing outside LocaleProvider ───
// In CI, jest.unstable_mockModule intercepts; the LocaleProvider wrapper in
// renderPage is then redundant but harmless (passthrough stub).
// Locally, when mock doesn't intercept, the real LocaleProvider handles useLocale().

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ─── Mock: configApi and preferencesApi (real LocaleProvider needs them) ──────
// When jest.unstable_mockModule doesn't intercept LocaleContext locally, the real
// LocaleProvider makes network calls. These mocks stop that.

jest.unstable_mockModule('../../lib/configApi.js', () => ({
  fetchConfig: jest.fn(() => Promise.resolve({ currency: 'EUR' })),
}));

jest.unstable_mockModule('../../lib/preferencesApi.js', () => ({
  listPreferences: jest.fn(() => Promise.resolve([])),
  upsertPreference: jest.fn(() => Promise.resolve()),
}));

describe('SubsidyProgramsPage', () => {
  let SubsidyProgramsPage: React.ComponentType;
  let LocaleProvider: ({ children }: { children: React.ReactNode }) => React.ReactNode;

  // Sample budget categories
  const sampleCategory1: BudgetCategory = {
    id: 'cat-1',
    name: 'Materials',
    description: null,
    color: '#ff0000',
    translationKey: null,
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const sampleCategory2: BudgetCategory = {
    id: 'cat-2',
    name: 'Labor',
    description: null,
    color: '#0000ff',
    translationKey: null,
    sortOrder: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  // Sample subsidy programs
  const sampleProgram1: SubsidyProgram = {
    id: 'prog-1',
    name: 'Energy Rebate',
    description: 'Energy efficiency program',
    eligibility: 'Home owners',
    reductionType: 'percentage',
    reductionValue: 15,
    applicationStatus: 'eligible',
    applicationDeadline: '2027-12-31',
    notes: 'Apply early',
    maximumAmount: null,
    applicableCategories: [sampleCategory1],
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const sampleProgram2: SubsidyProgram = {
    id: 'prog-2',
    name: 'Fixed Grant',
    description: null,
    eligibility: null,
    reductionType: 'fixed',
    reductionValue: 5000,
    applicationStatus: 'applied',
    applicationDeadline: null,
    notes: null,
    maximumAmount: null,
    applicableCategories: [],
    createdBy: null,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };

  const sampleProgramWithCap: SubsidyProgram = {
    id: 'prog-3',
    name: 'Capped Subsidy',
    description: null,
    eligibility: null,
    reductionType: 'fixed',
    reductionValue: 3000,
    applicationStatus: 'eligible',
    applicationDeadline: null,
    notes: null,
    maximumAmount: 10000,
    applicableCategories: [],
    createdBy: null,
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
  };

  const emptyProgramsResponse: SubsidyProgramListResponse = { subsidyPrograms: [] };
  const listResponse: SubsidyProgramListResponse = {
    subsidyPrograms: [sampleProgram1, sampleProgram2],
  };
  const emptyCategoriesResponse: BudgetCategoryListResponse = { categories: [] };
  const categoriesResponse: BudgetCategoryListResponse = {
    categories: [sampleCategory1, sampleCategory2],
  };

  beforeEach(async () => {
    if (!SubsidyProgramsPage) {
      const module = await import('./SubsidyProgramsPage.js');
      SubsidyProgramsPage = module.default;
    }
    if (!LocaleProvider) {
      const localeMod = await import('../../contexts/LocaleContext.js');
      LocaleProvider = localeMod.LocaleProvider as ({
        children,
      }: {
        children: React.ReactNode;
      }) => React.ReactNode;
    }

    // Reset all mocks
    mockFetchSubsidyPrograms.mockReset();
    mockFetchSubsidyProgram.mockReset();
    mockCreateSubsidyProgram.mockReset();
    mockUpdateSubsidyProgram.mockReset();
    mockDeleteSubsidyProgram.mockReset();

    mockFetchBudgetCategories.mockReset();
    mockCreateBudgetCategory.mockReset();
    mockUpdateBudgetCategory.mockReset();
    mockDeleteBudgetCategory.mockReset();
    mockFetchBudgetOverview.mockReset();

    // Default: categories return empty list unless overridden
    mockFetchBudgetCategories.mockResolvedValue(emptyCategoriesResponse);

    _capturedLinkedDocsSectionProps = null;

    // Default: budget overview with empty oversubscribed subsidies
    mockFetchBudgetOverview.mockResolvedValue({
      availableFunds: 0,
      sourceCount: 0,
      minPlanned: 0,
      maxPlanned: 0,
      actualCost: 0,
      actualCostPaid: 0,
      actualCostClaimed: 0,
      remainingVsMinPlanned: 0,
      remainingVsMaxPlanned: 0,
      remainingVsActualCost: 0,
      remainingVsActualPaid: 0,
      remainingVsActualClaimed: 0,
      remainingVsMinPlannedWithPayback: 0,
      remainingVsMaxPlannedWithPayback: 0,
      subsidySummary: {
        totalReductions: 0,
        activeSubsidyCount: 0,
        minTotalPayback: 0,
        maxTotalPayback: 0,
        oversubscribedSubsidies: [],
      },
    });
  });

  function renderPage() {
    return render(
      // Wrap in LocaleProvider so useFormatters→useLocale works in both CI (mock
      // intercepts and this becomes a passthrough) and local (real provider used).
      <LocaleProvider>
        <MemoryRouter initialEntries={['/budget/subsidies']}>
          <SubsidyProgramsPage />
        </MemoryRouter>
      </LocaleProvider>,
    );
  }

  // ─── Loading state ─────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows loading indicator while fetching programs', () => {
      // Never resolves — stays in loading state
      mockFetchSubsidyPrograms.mockReturnValueOnce(new Promise(() => {}));
      mockFetchBudgetCategories.mockReturnValueOnce(new Promise(() => {}));

      renderPage();

      expect(screen.getByText(/loading subsidy programs/i)).toBeInTheDocument();
    });

    it('hides loading indicator after data loads', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.queryByText(/loading subsidy programs/i)).not.toBeInTheDocument();
      });
    });
  });

  // ─── Page structure ────────────────────────────────────────────────────────

  describe('page structure', () => {
    it('renders the page heading "Budget"', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^budget$/i, level: 1 })).toBeInTheDocument();
      });
    });

    it('renders "Add Program" button', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });
    });

    it('renders Programs count heading', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /programs \(0\)/i })).toBeInTheDocument();
      });
    });
  });

  // ─── Error state ───────────────────────────────────────────────────────────

  describe('error state', () => {
    it('shows error card when data fails to load with no existing programs', async () => {
      mockFetchSubsidyPrograms.mockRejectedValueOnce(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/failed to load subsidy programs/i)).toBeInTheDocument();
      });
    });

    it('shows generic error message for non-ApiClientError failures', async () => {
      mockFetchSubsidyPrograms.mockRejectedValueOnce(new Error('Unknown network error'));

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByText(/failed to load subsidy programs. please try again/i),
        ).toBeInTheDocument();
      });
    });

    it('shows ApiClientError message on load failure', async () => {
      mockFetchSubsidyPrograms.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Custom API error' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Custom API error')).toBeInTheDocument();
      });
    });

    it('shows Retry button in error state', async () => {
      mockFetchSubsidyPrograms.mockRejectedValueOnce(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });
    });
  });

  // ─── Empty state ───────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows empty state message when no programs exist', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/no subsidy programs yet/i)).toBeInTheDocument();
      });
    });

    it('shows count of 0 in section heading for empty state', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /programs \(0\)/i })).toBeInTheDocument();
      });
    });
  });

  // ─── Programs list display ─────────────────────────────────────────────────

  describe('programs list display', () => {
    it('displays program names in the list', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Energy Rebate')).toBeInTheDocument();
        expect(screen.getByText('Fixed Grant')).toBeInTheDocument();
      });
    });

    it('shows correct count in section heading', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /programs \(2\)/i })).toBeInTheDocument();
      });
    });

    it('renders status badges for each program', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        // sampleProgram1 has status 'eligible', sampleProgram2 has 'applied'
        expect(screen.getByText('Eligible')).toBeInTheDocument();
        expect(screen.getByText('Applied')).toBeInTheDocument();
      });
    });

    it('renders reduction badge for percentage type', async () => {
      const pctProgram: SubsidyProgram = {
        ...sampleProgram1,
        reductionType: 'percentage',
        reductionValue: 15,
      };
      mockFetchSubsidyPrograms.mockResolvedValueOnce({ subsidyPrograms: [pctProgram] });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('15%')).toBeInTheDocument();
      });
    });

    it('renders reduction badge for fixed type with currency format', async () => {
      const fixedProgram: SubsidyProgram = {
        ...sampleProgram1,
        id: 'prog-fixed',
        name: 'Fixed Amount',
        reductionType: 'fixed',
        reductionValue: 5000,
      };
      mockFetchSubsidyPrograms.mockResolvedValueOnce({ subsidyPrograms: [fixedProgram] });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('€5,000.00')).toBeInTheDocument();
      });
    });

    it('renders application deadline when present', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce({ subsidyPrograms: [sampleProgram1] });

      renderPage();

      await waitFor(() => {
        // applicationDeadline is '2027-12-31' — formatted to locale-specific date
        expect(screen.getByText(/deadline/i)).toBeInTheDocument();
      });
    });

    it('does not render deadline section when applicationDeadline is null', async () => {
      const noDeadline: SubsidyProgram = { ...sampleProgram1, applicationDeadline: null };
      mockFetchSubsidyPrograms.mockResolvedValueOnce({ subsidyPrograms: [noDeadline] });

      renderPage();

      await waitFor(() => {
        expect(screen.queryByText(/deadline:/i)).not.toBeInTheDocument();
      });
    });

    it('renders program description when present', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce({ subsidyPrograms: [sampleProgram1] });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Energy efficiency program')).toBeInTheDocument();
      });
    });

    it('does not render description when null', async () => {
      const noDesc: SubsidyProgram = { ...sampleProgram1, description: null };
      mockFetchSubsidyPrograms.mockResolvedValueOnce({ subsidyPrograms: [noDesc] });

      renderPage();

      await waitFor(() => {
        expect(screen.queryByText('Energy efficiency program')).not.toBeInTheDocument();
      });
    });

    it('renders category pills for programs with applicable categories', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce({ subsidyPrograms: [sampleProgram1] });

      renderPage();

      await waitFor(() => {
        // sampleProgram1 has sampleCategory1 (Materials)
        expect(screen.getByText('Materials')).toBeInTheDocument();
      });
    });

    it('does not render category pills when no applicable categories', async () => {
      const noCategories: SubsidyProgram = { ...sampleProgram2, applicableCategories: [] };
      mockFetchSubsidyPrograms.mockResolvedValueOnce({ subsidyPrograms: [noCategories] });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Fixed Grant')).toBeInTheDocument();
      });
    });

    it('renders Edit button for each program', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit energy rebate/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /edit fixed grant/i })).toBeInTheDocument();
      });
    });

    it('renders Delete button for each program', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete energy rebate/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /delete fixed grant/i })).toBeInTheDocument();
      });
    });

    it('renders all 5 application status types as label text', async () => {
      const programs: SubsidyProgram[] = [
        { ...sampleProgram1, id: 'p1', name: 'P1', applicationStatus: 'eligible' },
        { ...sampleProgram1, id: 'p2', name: 'P2', applicationStatus: 'applied' },
        { ...sampleProgram1, id: 'p3', name: 'P3', applicationStatus: 'approved' },
        { ...sampleProgram1, id: 'p4', name: 'P4', applicationStatus: 'received' },
        { ...sampleProgram1, id: 'p5', name: 'P5', applicationStatus: 'rejected' },
      ];
      mockFetchSubsidyPrograms.mockResolvedValueOnce({ subsidyPrograms: programs });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Eligible')).toBeInTheDocument();
        expect(screen.getByText('Applied')).toBeInTheDocument();
        expect(screen.getByText('Approved')).toBeInTheDocument();
        expect(screen.getByText('Received')).toBeInTheDocument();
        expect(screen.getByText('Rejected')).toBeInTheDocument();
      });
    });
  });

  // ─── Create form ───────────────────────────────────────────────────────────

  describe('create form', () => {
    it('shows create form after clicking "Add Program" button', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));

      expect(screen.getByRole('heading', { name: /new subsidy program/i })).toBeInTheDocument();
    });

    it('disables "Add Program" button when create form is open', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).not.toBeDisabled();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));

      expect(screen.getByRole('button', { name: /add program/i })).toBeDisabled();
    });

    it('hides create form after clicking Cancel', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));
      expect(screen.getByRole('heading', { name: /new subsidy program/i })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(
        screen.queryByRole('heading', { name: /new subsidy program/i }),
      ).not.toBeInTheDocument();
    });

    it('shows validation error when name is empty on submit', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));

      // Set a reduction value but leave name empty, then try to submit
      const reductionValueInput = screen.getByLabelText(/value \(%\)/i);
      fireEvent.change(reductionValueInput, { target: { value: '10' } });

      // Use fireEvent to bypass the disabled submit button state
      const form = document.querySelector('form');
      expect(form).not.toBeNull();
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText(/program name is required/i)).toBeInTheDocument();
      });
    });

    it('shows validation error when reduction value is not a number', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));

      // Fill name, set invalid reduction value
      await user.type(screen.getByLabelText(/name/i), 'Test Program');
      // Set reductionValue to non-numeric via fireEvent to bypass number input constraints
      const reductionValueInput = screen.getByLabelText(/value \(%\)/i);
      fireEvent.change(reductionValueInput, { target: { value: 'abc' } });

      const form = document.querySelector('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(
          screen.getByText(/reduction value must be a non-negative number/i),
        ).toBeInTheDocument();
      });
    });

    it('shows validation error when percentage exceeds 100', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));

      await user.type(screen.getByLabelText(/name/i), 'Pct Program');
      // reductionType defaults to 'percentage'
      const reductionValueInput = screen.getByLabelText(/value \(%\)/i);
      fireEvent.change(reductionValueInput, { target: { value: '101' } });

      const form = document.querySelector('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText(/percentage reduction cannot exceed 100%/i)).toBeInTheDocument();
      });
    });

    it('calls createSubsidyProgram and adds program on success', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      mockCreateSubsidyProgram.mockResolvedValueOnce(sampleProgram1);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));

      await user.type(screen.getByLabelText(/name/i), 'Energy Rebate');
      const reductionValueInput = screen.getByLabelText(/value \(%\)/i);
      fireEvent.change(reductionValueInput, { target: { value: '15' } });

      const createBtn = screen.getByRole('button', { name: /create program/i });
      await user.click(createBtn);

      await waitFor(() => {
        expect(mockCreateSubsidyProgram).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Energy Rebate',
            reductionType: 'percentage',
            reductionValue: 15,
          }),
        );
      });
    });

    it('shows success message after successful creation', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      mockCreateSubsidyProgram.mockResolvedValueOnce(sampleProgram1);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));

      await user.type(screen.getByLabelText(/name/i), 'Energy Rebate');
      const reductionValueInput = screen.getByLabelText(/value \(%\)/i);
      fireEvent.change(reductionValueInput, { target: { value: '15' } });

      await user.click(screen.getByRole('button', { name: /create program/i }));

      await waitFor(() => {
        expect(screen.getByText(/energy rebate.*created successfully/i)).toBeInTheDocument();
      });
    });

    it('hides create form after successful creation', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      mockCreateSubsidyProgram.mockResolvedValueOnce(sampleProgram1);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));

      await user.type(screen.getByLabelText(/name/i), 'Energy Rebate');
      const reductionValueInput = screen.getByLabelText(/value \(%\)/i);
      fireEvent.change(reductionValueInput, { target: { value: '15' } });

      await user.click(screen.getByRole('button', { name: /create program/i }));

      await waitFor(() => {
        expect(
          screen.queryByRole('heading', { name: /new subsidy program/i }),
        ).not.toBeInTheDocument();
      });
    });

    it('shows error when createSubsidyProgram API call fails', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      mockCreateSubsidyProgram.mockRejectedValueOnce(
        new ApiClientError(400, { code: 'VALIDATION_ERROR', message: 'Program already exists' }),
      );
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));
      await user.type(screen.getByLabelText(/name/i), 'Dup Program');
      const reductionValueInput = screen.getByLabelText(/value \(%\)/i);
      fireEvent.change(reductionValueInput, { target: { value: '10' } });
      await user.click(screen.getByRole('button', { name: /create program/i }));

      await waitFor(() => {
        expect(screen.getByText('Program already exists')).toBeInTheDocument();
      });
    });

    it('shows generic error for non-ApiClientError create failures', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      mockCreateSubsidyProgram.mockRejectedValueOnce(new Error('Network error'));
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));
      await user.type(screen.getByLabelText(/name/i), 'Program Name');
      const reductionValueInput = screen.getByLabelText(/value \(%\)/i);
      fireEvent.change(reductionValueInput, { target: { value: '10' } });
      await user.click(screen.getByRole('button', { name: /create program/i }));

      await waitFor(() => {
        expect(screen.getByText(/failed to create subsidy program/i)).toBeInTheDocument();
      });
    });

    it('disables submit button when name is empty', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));

      // Name is empty by default
      const submitButton = screen.getByRole('button', { name: /create program/i });
      expect(submitButton).toBeDisabled();
    });

    it('disables submit button when reductionValue is empty', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));
      await user.type(screen.getByLabelText(/name/i), 'Some Program');

      // reductionValue is empty
      const submitButton = screen.getByRole('button', { name: /create program/i });
      expect(submitButton).toBeDisabled();
    });

    it('enables submit button when name and reductionValue are filled', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));
      await user.type(screen.getByLabelText(/name/i), 'Some Program');
      const reductionValueInput = screen.getByLabelText(/value \(%\)/i);
      fireEvent.change(reductionValueInput, { target: { value: '10' } });

      const submitButton = screen.getByRole('button', { name: /create program/i });
      expect(submitButton).not.toBeDisabled();
    });

    it('shows category checkboxes when categories are available', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      mockFetchBudgetCategories.mockResolvedValueOnce(categoriesResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));

      await waitFor(() => {
        expect(screen.getByLabelText('Materials')).toBeInTheDocument();
        expect(screen.getByLabelText('Labor')).toBeInTheDocument();
      });
    });

    it('does not show category section when no categories available', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      // Default: emptyCategoriesResponse
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));

      await waitFor(() => {
        expect(screen.queryByText(/applicable budget categories/i)).not.toBeInTheDocument();
      });
    });

    it('toggles category checkbox when clicked', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      mockFetchBudgetCategories.mockResolvedValueOnce(categoriesResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));

      await waitFor(() => {
        expect(screen.getByLabelText('Materials')).toBeInTheDocument();
      });

      const materialsCheckbox = screen.getByLabelText('Materials') as HTMLInputElement;
      // All categories default to checked (#336: Select All by default)
      expect(materialsCheckbox.checked).toBe(true);

      await user.click(materialsCheckbox);
      expect(materialsCheckbox.checked).toBe(false);

      await user.click(materialsCheckbox);
      expect(materialsCheckbox.checked).toBe(true);
    });

    it('includes selected categoryIds in create request', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      mockFetchBudgetCategories.mockResolvedValueOnce(categoriesResponse);
      mockCreateSubsidyProgram.mockResolvedValueOnce(sampleProgram1);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));

      await waitFor(() => {
        expect(screen.getByLabelText('Materials')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/name/i), 'With Category');
      const reductionValueInput = screen.getByLabelText(/value \(%\)/i);
      fireEvent.change(reductionValueInput, { target: { value: '10' } });
      // All categories default to checked; uncheck Labor (cat-2) so only Materials (cat-1) is selected
      await user.click(screen.getByLabelText('Labor'));

      await user.click(screen.getByRole('button', { name: /create program/i }));

      await waitFor(() => {
        expect(mockCreateSubsidyProgram).toHaveBeenCalledWith(
          expect.objectContaining({
            categoryIds: ['cat-1'],
          }),
        );
      });
    });
  });

  // ─── Edit form ─────────────────────────────────────────────────────────────

  describe('edit form', () => {
    it('shows inline edit form when Edit button is clicked', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit energy rebate/i }));

      expect(screen.getByRole('form', { name: /edit energy rebate/i })).toBeInTheDocument();
    });

    it('pre-fills edit form with current program data', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit energy rebate/i }));

      const form = screen.getByRole('form', { name: /edit energy rebate/i });
      const nameInput = within(form).getByDisplayValue('Energy Rebate') as HTMLInputElement;
      expect(nameInput).toBeInTheDocument();
    });

    it('disables other Edit/Delete buttons while editing a program', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit energy rebate/i }));

      // The other program's edit/delete buttons should be disabled
      expect(screen.getByRole('button', { name: /edit fixed grant/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /delete fixed grant/i })).toBeDisabled();
    });

    it('cancels edit and hides edit form when Cancel is clicked', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit energy rebate/i }));
      expect(screen.getByRole('form', { name: /edit energy rebate/i })).toBeInTheDocument();

      const form = screen.getByRole('form', { name: /edit energy rebate/i });
      await user.click(within(form).getByRole('button', { name: /cancel/i }));

      expect(screen.queryByRole('form', { name: /edit energy rebate/i })).not.toBeInTheDocument();
    });

    it('calls updateSubsidyProgram and updates program in list on success', async () => {
      const updatedProgram: SubsidyProgram = {
        ...sampleProgram1,
        name: 'Updated Energy Rebate',
        reductionValue: 20,
      };
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      mockUpdateSubsidyProgram.mockResolvedValueOnce(updatedProgram);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit energy rebate/i }));

      const form = screen.getByRole('form', { name: /edit energy rebate/i });
      const nameInput = within(form).getByDisplayValue('Energy Rebate');
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Energy Rebate');

      await user.click(within(form).getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(mockUpdateSubsidyProgram).toHaveBeenCalledWith(
          'prog-1',
          expect.objectContaining({ name: 'Updated Energy Rebate' }),
        );
      });
    });

    it('shows success message after successful edit', async () => {
      const updatedProgram: SubsidyProgram = { ...sampleProgram1, name: 'Renamed Program' };
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      mockUpdateSubsidyProgram.mockResolvedValueOnce(updatedProgram);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit energy rebate/i }));

      const form = screen.getByRole('form', { name: /edit energy rebate/i });
      await user.click(within(form).getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(screen.getByText(/renamed program.*updated successfully/i)).toBeInTheDocument();
      });
    });

    it('shows update error when updateSubsidyProgram API call fails', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      mockUpdateSubsidyProgram.mockRejectedValueOnce(
        new ApiClientError(400, { code: 'VALIDATION_ERROR', message: 'Validation failed' }),
      );
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit energy rebate/i }));

      const form = screen.getByRole('form', { name: /edit energy rebate/i });
      await user.click(within(form).getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(within(form).getByRole('alert')).toBeInTheDocument();
        expect(within(form).getByText('Validation failed')).toBeInTheDocument();
      });
    });

    it('shows generic error for non-ApiClientError update failures', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      mockUpdateSubsidyProgram.mockRejectedValueOnce(new Error('Network error'));
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit energy rebate/i }));

      const form = screen.getByRole('form', { name: /edit energy rebate/i });
      await user.click(within(form).getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(within(form).getByText(/failed to update subsidy program/i)).toBeInTheDocument();
      });
    });

    it('shows validation error in edit form when name is empty', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit energy rebate/i }));

      const form = screen.getByRole('form', { name: /edit energy rebate/i });
      // Clear name using fireEvent to bypass editing restrictions in jsdom
      const nameInput = within(form).getByDisplayValue('Energy Rebate');
      fireEvent.change(nameInput, { target: { value: '' } });

      // Now submit with empty name
      fireEvent.submit(form);

      await waitFor(() => {
        expect(within(form).getByText(/program name is required/i)).toBeInTheDocument();
      });
    });

    it('shows category checkboxes in edit form when categories are available', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce({ subsidyPrograms: [sampleProgram1] });
      mockFetchBudgetCategories.mockResolvedValueOnce(categoriesResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit energy rebate/i }));

      const form = screen.getByRole('form', { name: /edit energy rebate/i });

      await waitFor(() => {
        // Categories section should be within the edit form
        expect(within(form).getByLabelText('Materials')).toBeInTheDocument();
      });
    });

    it('pre-checks categories that are already linked to the program', async () => {
      // sampleProgram1 has sampleCategory1 (Materials) as applicable category
      mockFetchSubsidyPrograms.mockResolvedValueOnce({ subsidyPrograms: [sampleProgram1] });
      mockFetchBudgetCategories.mockResolvedValueOnce(categoriesResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit energy rebate/i }));

      const form = screen.getByRole('form', { name: /edit energy rebate/i });

      await waitFor(() => {
        const materialsCheckbox = within(form).getByLabelText('Materials') as HTMLInputElement;
        expect(materialsCheckbox.checked).toBe(true);
        const laborCheckbox = within(form).getByLabelText('Labor') as HTMLInputElement;
        expect(laborCheckbox.checked).toBe(false);
      });
    });
  });

  // ─── Edit-form placeholders distinct from create-form placeholders (Issue #1812) ──
  // Regression guard: the edit form intentionally uses its own `subsidies.editForm.
  // placeholders.*` keys (shorter text) rather than reusing `subsidies.form.
  // placeholders.*` (longer text used by the create form), to keep visible text
  // unchanged from before the i18n sweep. If these keys were ever accidentally
  // unified, this test would catch the placeholder text changing.

  describe('editForm placeholders distinct from create form placeholders', () => {
    it('create form shows the longer form.placeholders text for description/eligibility/notes', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));

      expect(
        screen.getByPlaceholderText('Optional description of this program'),
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText('Optional eligibility criteria or requirements'),
      ).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Optional additional notes')).toBeInTheDocument();
    });

    it('edit form shows its own shorter editForm.placeholders text for description/eligibility/notes', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit energy rebate/i }));

      const form = screen.getByRole('form', { name: /edit energy rebate/i });
      expect(within(form).getByPlaceholderText('Optional description')).toBeInTheDocument();
      expect(
        within(form).getByPlaceholderText('Optional eligibility criteria'),
      ).toBeInTheDocument();
      expect(within(form).getByPlaceholderText('Optional notes')).toBeInTheDocument();

      // Guard: the edit form must NOT show the longer create-form placeholder text.
      expect(
        screen.queryByPlaceholderText('Optional description of this program'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByPlaceholderText('Optional eligibility criteria or requirements'),
      ).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Optional additional notes')).not.toBeInTheDocument();
    });
  });

  // ─── Delete modal ──────────────────────────────────────────────────────────

  describe('delete modal', () => {
    it('shows delete confirmation modal when Delete button is clicked', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete energy rebate/i }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /delete subsidy program/i })).toBeInTheDocument();
    });

    it('shows program name in delete modal', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete energy rebate/i }));

      const dialog = screen.getByRole('dialog');
      // The program name is now interpolated into a single translated sentence
      // (t('subsidies.modal.deleteConfirm', { name })) rather than wrapped in its
      // own <strong> text node, so assert on the full rendered sentence.
      expect(
        within(dialog).getByText('Are you sure you want to delete the program "Energy Rebate"?'),
      ).toBeInTheDocument();
    });

    it('shows "Delete Program" confirm button in modal', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete energy rebate/i }));

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
    });

    it('closes delete modal when Cancel is clicked', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete energy rebate/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('calls deleteSubsidyProgram and removes program from list on success', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      mockDeleteSubsidyProgram.mockResolvedValueOnce(undefined);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete energy rebate/i }));

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));

      await waitFor(() => {
        expect(mockDeleteSubsidyProgram).toHaveBeenCalledWith('prog-1');
      });

      await waitFor(() => {
        expect(screen.queryByText('Energy Rebate')).not.toBeInTheDocument();
      });
    });

    it('shows success message after successful deletion', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      mockDeleteSubsidyProgram.mockResolvedValueOnce(undefined);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete energy rebate/i }));

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));

      await waitFor(() => {
        expect(screen.getByText(/energy rebate.*deleted successfully/i)).toBeInTheDocument();
      });
    });

    it('shows error when delete fails with 409 in-use error', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      mockDeleteSubsidyProgram.mockRejectedValueOnce(
        new ApiClientError(409, {
          code: 'SUBSIDY_PROGRAM_IN_USE',
          message: 'Subsidy program is in use',
        }),
      );
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete energy rebate/i }));

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));

      await waitFor(() => {
        expect(
          screen.getByText(
            /this subsidy program cannot be deleted because it is currently referenced/i,
          ),
        ).toBeInTheDocument();
      });
    });

    it('hides Delete Program button after in-use error (only shows error)', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      mockDeleteSubsidyProgram.mockRejectedValueOnce(
        new ApiClientError(409, { code: 'SUBSIDY_PROGRAM_IN_USE', message: 'In use' }),
      );
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete energy rebate/i }));

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));

      await waitFor(() => {
        // After in-use error, the Delete Program button is no longer shown
        expect(within(dialog).queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
      });
    });

    it('shows generic error for non-ApiClientError delete failures', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      mockDeleteSubsidyProgram.mockRejectedValueOnce(new Error('Network error'));
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete energy rebate/i }));

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/failed to delete subsidy program. please try again/i),
        ).toBeInTheDocument();
      });
    });

    it('shows non-409 ApiClientError message on delete failure', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      mockDeleteSubsidyProgram.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Server error' }),
      );
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete energy rebate/i }));

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument();
      });
    });

    it('modal is not closeable while deletion is in progress', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      // Deletion never completes — stays in deleting state
      mockDeleteSubsidyProgram.mockReturnValueOnce(new Promise(() => {}));
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete energy rebate/i }));

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));

      // Cancel button is disabled while deleting
      await waitFor(() => {
        expect(within(dialog).getByRole('button', { name: /cancel/i })).toBeDisabled();
      });
    });
  });

  // ─── Maximum Amount (cap) field ───────────────────────────────────────────

  describe('maximumAmount — create form', () => {
    it('shows "Maximum Amount (€)" input in the create form', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));

      expect(screen.getByLabelText(/maximum amount/i)).toBeInTheDocument();
    });

    it('create form "Maximum Amount (€)" input has placeholder "No limit"', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));

      const maxAmountInput = screen.getByLabelText(/maximum amount/i);
      expect(maxAmountInput).toHaveAttribute('placeholder', 'No limit');
    });

    it('submits maximumAmount when filled in create form', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      mockCreateSubsidyProgram.mockResolvedValueOnce({ ...sampleProgramWithCap });
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));
      await user.type(screen.getByLabelText(/name/i), 'Capped Subsidy');
      const reductionValueInput = screen.getByLabelText(/value \(%\)/i);
      fireEvent.change(reductionValueInput, { target: { value: '15' } });
      fireEvent.change(screen.getByLabelText(/maximum amount/i), { target: { value: '10000' } });
      await user.click(screen.getByRole('button', { name: /create program/i }));

      await waitFor(() => {
        expect(mockCreateSubsidyProgram).toHaveBeenCalledWith(
          expect.objectContaining({ maximumAmount: 10000 }),
        );
      });
    });

    it('submits maximumAmount as null when left empty in create form', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      mockCreateSubsidyProgram.mockResolvedValueOnce({ ...sampleProgram1 });
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));
      await user.type(screen.getByLabelText(/name/i), 'Energy Rebate');
      const reductionValueInput = screen.getByLabelText(/value \(%\)/i);
      fireEvent.change(reductionValueInput, { target: { value: '15' } });
      // Leave maximumAmount empty
      await user.click(screen.getByRole('button', { name: /create program/i }));

      await waitFor(() => {
        expect(mockCreateSubsidyProgram).toHaveBeenCalledWith(
          expect.objectContaining({ maximumAmount: null }),
        );
      });
    });
  });

  describe('maximumAmount — cap badge in program list', () => {
    it('shows cap badge with formatted amount when maximumAmount is set', async () => {
      const listWithCap: SubsidyProgramListResponse = {
        subsidyPrograms: [sampleProgramWithCap],
      };
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listWithCap);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/cap:/i)).toBeInTheDocument();
      });

      // The badge should display the formatted currency
      expect(screen.getByText(/cap:/i).textContent).toMatch(/10[,.]?000/);
    });

    it('does not show cap badge when maximumAmount is null', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Energy Rebate')).toBeInTheDocument();
      });

      expect(screen.queryByText(/cap:/i)).not.toBeInTheDocument();
    });

    it('shows cap badge only for programs that have maximumAmount set', async () => {
      const mixedList: SubsidyProgramListResponse = {
        subsidyPrograms: [sampleProgram1, sampleProgramWithCap],
      };
      mockFetchSubsidyPrograms.mockResolvedValueOnce(mixedList);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Energy Rebate')).toBeInTheDocument();
        expect(screen.getByText('Capped Subsidy')).toBeInTheDocument();
      });

      // Only one cap badge should be present
      expect(screen.getAllByText(/cap:/i)).toHaveLength(1);
    });
  });

  describe('maximumAmount — edit form', () => {
    it('shows "Maximum Amount (€)" input in the edit form', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit energy rebate/i }));

      expect(screen.getByLabelText(/maximum amount/i)).toBeInTheDocument();
    });

    it('edit form pre-populates maximumAmount when program has a cap', async () => {
      const listWithCap: SubsidyProgramListResponse = {
        subsidyPrograms: [sampleProgramWithCap],
      };
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listWithCap);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit capped subsidy/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit capped subsidy/i }));

      const maxAmountInput = screen.getByLabelText(/maximum amount/i);
      expect((maxAmountInput as HTMLInputElement).value).toBe('10000');
    });

    it('edit form maximumAmount is empty when program has no cap', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit energy rebate/i }));

      const maxAmountInput = screen.getByLabelText(/maximum amount/i);
      expect((maxAmountInput as HTMLInputElement).value).toBe('');
    });

    it('submits maximumAmount in edit save call', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);
      mockUpdateSubsidyProgram.mockResolvedValueOnce({ ...sampleProgram1, maximumAmount: 8000 });
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit energy rebate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit energy rebate/i }));
      fireEvent.change(screen.getByLabelText(/maximum amount/i), { target: { value: '8000' } });
      await user.click(screen.getByRole('button', { name: /^Save$/ }));

      await waitFor(() => {
        expect(mockUpdateSubsidyProgram).toHaveBeenCalledWith(
          'prog-1',
          expect.objectContaining({ maximumAmount: 8000 }),
        );
      });
    });

    it('submits maximumAmount as null when edit form field is cleared', async () => {
      const listWithCap: SubsidyProgramListResponse = {
        subsidyPrograms: [sampleProgramWithCap],
      };
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listWithCap);
      mockUpdateSubsidyProgram.mockResolvedValueOnce({
        ...sampleProgramWithCap,
        maximumAmount: null,
      });
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit capped subsidy/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit capped subsidy/i }));
      // Clear the maximumAmount field
      fireEvent.change(screen.getByLabelText(/maximum amount/i), { target: { value: '' } });
      await user.click(screen.getByRole('button', { name: /^Save$/ }));

      await waitFor(() => {
        expect(mockUpdateSubsidyProgram).toHaveBeenCalledWith(
          'prog-3',
          expect.objectContaining({ maximumAmount: null }),
        );
      });
    });
  });

  // ─── Success / error banners ──────────────────────────────────────────────

  describe('success and error banners', () => {
    it('shows success banner with role="alert"', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(emptyProgramsResponse);
      mockCreateSubsidyProgram.mockResolvedValueOnce(sampleProgram1);
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add program/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add program/i }));
      await user.type(screen.getByLabelText(/name/i), 'Energy Rebate');
      const reductionValueInput = screen.getByLabelText(/value \(%\)/i);
      fireEvent.change(reductionValueInput, { target: { value: '15' } });
      await user.click(screen.getByRole('button', { name: /create program/i }));

      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        const successAlert = alerts.find((el) => el.textContent?.includes('created successfully'));
        expect(successAlert).toBeDefined();
      });
    });
  });

  // ─── Docs toggle (story #1744) ──────────────────────────────────────────────

  describe('docs toggle (paperclip button)', () => {
    it('renders a docs toggle button for each program row', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Energy Rebate')).toBeInTheDocument();
      });

      // The docs toggle button has aria-controls matching program-docs-{id}
      const docsBtn = screen
        .getAllByRole('button', { hidden: true })
        .find((btn) => btn.getAttribute('aria-controls') === `program-docs-${sampleProgram1.id}`);
      expect(docsBtn).toBeDefined();
    });

    it('clicking the docs toggle button renders LinkedDocumentsSection with entityType=subsidy_program and correct entityId', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Energy Rebate')).toBeInTheDocument();
      });

      const docsBtn = screen
        .getAllByRole('button', { hidden: true })
        .find(
          (btn) =>
            btn.getAttribute('aria-controls') === `program-docs-${sampleProgram1.id}` &&
            btn.getAttribute('aria-expanded') === 'false',
        );
      expect(docsBtn).toBeDefined();

      fireEvent.click(docsBtn!);

      await waitFor(() => {
        expect(screen.getByTestId('linked-documents-section')).toBeInTheDocument();
      });

      const section = screen.getByTestId('linked-documents-section');
      expect(section.getAttribute('data-entity-type')).toBe('subsidy_program');
      expect(section.getAttribute('data-entity-id')).toBe(sampleProgram1.id);
    });

    it('clicking the docs toggle button a second time hides LinkedDocumentsSection', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Energy Rebate')).toBeInTheDocument();
      });

      const docsBtn = screen
        .getAllByRole('button', { hidden: true })
        .find((btn) => btn.getAttribute('aria-controls') === `program-docs-${sampleProgram1.id}`);
      expect(docsBtn).toBeDefined();

      // First click — opens
      fireEvent.click(docsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('linked-documents-section')).toBeInTheDocument(),
      );

      // Second click — closes
      fireEvent.click(docsBtn!);
      await waitFor(() =>
        expect(screen.queryByTestId('linked-documents-section')).not.toBeInTheDocument(),
      );
    });

    it('docs toggle button has aria-expanded=false initially', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce({ subsidyPrograms: [sampleProgram1] });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Energy Rebate')).toBeInTheDocument();
      });

      const docsBtn = screen
        .getAllByRole('button', { hidden: true })
        .find((btn) => btn.getAttribute('aria-controls') === `program-docs-${sampleProgram1.id}`);
      expect(docsBtn).toBeDefined();
      expect(docsBtn!.getAttribute('aria-expanded')).toBe('false');
    });

    it('docs toggle button has aria-expanded=true after clicking', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce({ subsidyPrograms: [sampleProgram1] });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Energy Rebate')).toBeInTheDocument();
      });

      const docsBtn = screen
        .getAllByRole('button', { hidden: true })
        .find((btn) => btn.getAttribute('aria-controls') === `program-docs-${sampleProgram1.id}`);
      expect(docsBtn).toBeDefined();

      fireEvent.click(docsBtn!);

      await waitFor(() => {
        expect(docsBtn!.getAttribute('aria-expanded')).toBe('true');
      });
    });

    it('docs toggle button is disabled when editingProgram is active', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Energy Rebate')).toBeInTheDocument();
      });

      // Start editing program1
      const editBtn = screen.getByRole('button', { name: /edit energy rebate/i });
      fireEvent.click(editBtn);

      await waitFor(() => {
        // All docs toggles should be disabled when editing
        const allDocsToggleBtns = screen
          .getAllByRole('button', { hidden: true })
          .filter((btn) => btn.getAttribute('aria-controls')?.startsWith('program-docs-'));
        expect(allDocsToggleBtns.length).toBeGreaterThan(0);
        for (const btn of allDocsToggleBtns) {
          expect(btn).toBeDisabled();
        }
      });
    });

    it('LinkedDocumentsSection is hidden when editing the same program', async () => {
      mockFetchSubsidyPrograms.mockResolvedValueOnce({ subsidyPrograms: [sampleProgram1] });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Energy Rebate')).toBeInTheDocument();
      });

      // Open docs panel
      const docsBtn = screen
        .getAllByRole('button', { hidden: true })
        .find((btn) => btn.getAttribute('aria-controls') === `program-docs-${sampleProgram1.id}`);
      fireEvent.click(docsBtn!);

      await waitFor(() =>
        expect(screen.getByTestId('linked-documents-section')).toBeInTheDocument(),
      );

      // Now start editing the same program — docs panel should disappear
      const editBtn = screen.getByRole('button', { name: /edit energy rebate/i });
      fireEvent.click(editBtn);

      await waitFor(() =>
        expect(screen.queryByTestId('linked-documents-section')).not.toBeInTheDocument(),
      );
    });
  });
});
