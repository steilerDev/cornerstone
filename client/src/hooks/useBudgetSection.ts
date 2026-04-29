import { useState, type FormEvent } from 'react';
import type {
  BaseBudgetLine,
  ConfidenceLevel,
  CreateBudgetLineRequest,
  UpdateBudgetLineRequest,
} from '@cornerstone/shared';

/**
 * Form state for creating or editing a budget line.
 * budgetCategoryId is included even for household items (empty string when not applicable).
 */
export interface BudgetLineFormState {
  description: string;
  plannedAmount: string;
  confidence: ConfidenceLevel;
  budgetCategoryId: string;
  budgetSourceId: string;
  vendorId: string;
  pricingMode: 'direct' | 'unit';
  quantity: string;
  unit: string;
  unitPrice: string;
  includesVat: boolean;
}

/**
 * Options for configuring the useBudgetSection hook.
 * Each entity (work item, household item) provides callbacks to map budget lines
 * to form state and vice versa.
 */
export interface UseBudgetSectionOptions<T extends BaseBudgetLine> {
  /**
   * API callbacks: create, update, delete operations
   */
  api: {
    fetchBudgets(entityId: string): Promise<T[]>;
    createBudget(entityId: string, data: CreateBudgetLineRequest): Promise<T>;
    updateBudget(entityId: string, budgetId: string, data: UpdateBudgetLineRequest): Promise<T>;
    deleteBudget(entityId: string, budgetId: string): Promise<void>;
  };

  /**
   * Callback to reload budget lines after a change (handles local state update)
   */
  reloadBudgetLines(): Promise<void>;

  /**
   * Callback to reload subsidy payback after budget changes
   */
  reloadSubsidyPayback(): Promise<void>;

  /**
   * Callback to reload linked subsidies after subsidy operations (link/unlink)
   */
  reloadLinkedSubsidies(): Promise<void>;

  /**
   * Convert a budget line to form state. Maps entity-specific fields to BudgetLineFormState.
   */
  toFormState(line: T): BudgetLineFormState;

  /**
   * Convert form state to API request payload.
   * Each entity may have different fields (e.g., work items include budgetCategoryId).
   */
  toPayload(form: BudgetLineFormState): CreateBudgetLineRequest | UpdateBudgetLineRequest;

  /**
   * Entity ID (work item or household item)
   */
  entityId: string;

  /**
   * Default budget source ID to use when opening a new budget form.
   * If not provided, new forms will have an empty funding source.
   */
  defaultBudgetSourceId?: string;
}

/**
 * Return value from useBudgetSection hook.
 * Provides all state and handlers for budget line and subsidy linking UI.
 */
export interface UseBudgetSectionReturn<T extends BaseBudgetLine = BaseBudgetLine> {
  // Budget line form state
  showBudgetForm: boolean;
  budgetForm: BudgetLineFormState;
  editingBudgetId: string | null;
  isSavingBudget: boolean;
  budgetFormError: string | null;
  deletingBudgetId: string | null;

  // Subsidy linking state
  selectedSubsidyId: string;
  isLinkingSubsidy: boolean;

  // Budget line form handlers
  openAddBudgetForm(): void;
  openEditBudgetForm(line: T): void;
  closeBudgetForm(): void;
  handleSaveBudgetLine(event: FormEvent): Promise<void>;
  handleDeleteBudgetLine(budgetId: string): void;
  confirmDeleteBudgetLine(): Promise<void>;
  setBudgetFormPartial(updates: Partial<BudgetLineFormState>): void;
  setBudgetForm(state: BudgetLineFormState): void;
  setDeletingBudgetId(id: string | null): void;

  // Subsidy linking handlers
  handleLinkSubsidy(): Promise<void>;
  handleUnlinkSubsidy(): Promise<void>;
  setSelectedSubsidyId(id: string): void;
}

/**
 * Shared hook for managing budget lines and subsidy linking across entities.
 * Eliminates duplication between WorkItemDetailPage and HouseholdItemDetailPage.
 *
 * The hook is parameterized by API callbacks and transform functions so each
 * entity can provide its own specific behavior (e.g., work items have budgetCategoryId).
 */
export function useBudgetSection<T extends BaseBudgetLine>(
  options: UseBudgetSectionOptions<T>,
): UseBudgetSectionReturn<T> {
  const {
    api,
    reloadBudgetLines,
    reloadSubsidyPayback,
    reloadLinkedSubsidies,
    toFormState,
    toPayload,
    entityId,
    defaultBudgetSourceId,
  } = options;

  const emptyForm: BudgetLineFormState = {
    description: '',
    plannedAmount: '',
    confidence: 'own_estimate',
    budgetCategoryId: '',
    budgetSourceId: defaultBudgetSourceId ?? '',
    vendorId: '',
    pricingMode: 'direct',
    quantity: '',
    unit: '',
    unitPrice: '',
    includesVat: true,
  };

  // Budget line form state
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [budgetForm, setBudgetForm] = useState<BudgetLineFormState>(emptyForm);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [budgetFormError, setBudgetFormError] = useState<string | null>(null);
  const [deletingBudgetId, setDeletingBudgetId] = useState<string | null>(null);

  // Subsidy linking state
  const [selectedSubsidyId, setSelectedSubsidyId] = useState('');
  const [isLinkingSubsidy, setIsLinkingSubsidy] = useState(false);

  // ─── Budget line form handlers ───────────────────────────────────────────

  const openAddBudgetForm = () => {
    setEditingBudgetId(null);
    setBudgetForm({ ...emptyForm, budgetSourceId: defaultBudgetSourceId ?? '' });
    setBudgetFormError(null);
    setShowBudgetForm(true);
  };

  const openEditBudgetForm = (line: T) => {
    setEditingBudgetId(line.id);
    setBudgetForm(toFormState(line));
    setBudgetFormError(null);
    setShowBudgetForm(true);
  };

  const closeBudgetForm = () => {
    setShowBudgetForm(false);
    setEditingBudgetId(null);
    setBudgetForm({ ...emptyForm, budgetSourceId: defaultBudgetSourceId ?? '' });
    setBudgetFormError(null);
  };

  const handleSaveBudgetLine = async (event: FormEvent) => {
    event.preventDefault();

    let plannedAmount: number;

    if (budgetForm.pricingMode === 'direct') {
      plannedAmount = parseFloat(budgetForm.plannedAmount);
      if (isNaN(plannedAmount) || plannedAmount < 0) {
        setBudgetFormError('Planned amount must be a valid non-negative number.');
        return;
      }
    } else {
      // Unit pricing mode
      const qty = parseFloat(budgetForm.quantity);
      const price = parseFloat(budgetForm.unitPrice);

      if (isNaN(qty) || qty <= 0) {
        setBudgetFormError('Quantity must be a valid positive number.');
        return;
      }
      if (isNaN(price) || price < 0) {
        setBudgetFormError('Unit price must be a valid non-negative number.');
        return;
      }

      plannedAmount = Math.round(qty * price * 100) / 100;
    }

    setIsSavingBudget(true);
    setBudgetFormError(null);

    // Override plannedAmount in form state for toPayload
    const formWithAmount = { ...budgetForm, plannedAmount: String(plannedAmount) };
    const payload = toPayload(formWithAmount);

    try {
      if (editingBudgetId) {
        await api.updateBudget(entityId, editingBudgetId, payload as UpdateBudgetLineRequest);
      } else {
        await api.createBudget(entityId, payload as CreateBudgetLineRequest);
      }
      closeBudgetForm();
      await Promise.all([reloadBudgetLines(), reloadSubsidyPayback()]);
    } catch (err) {
      const apiErr = err as { statusCode?: number; message?: string };
      setBudgetFormError(apiErr.message ?? 'Failed to save budget line. Please try again.');
      console.error('Failed to save budget line:', err);
    } finally {
      setIsSavingBudget(false);
    }
  };

  const handleDeleteBudgetLine = (budgetId: string) => {
    setDeletingBudgetId(budgetId);
  };

  const confirmDeleteBudgetLine = async () => {
    if (!deletingBudgetId) return;

    try {
      await api.deleteBudget(entityId, deletingBudgetId);
      setDeletingBudgetId(null);
      await Promise.all([reloadBudgetLines(), reloadSubsidyPayback()]);
    } catch (err) {
      setDeletingBudgetId(null);
      const apiErr = err as { statusCode?: number; message?: string };
      if (apiErr.statusCode === 409) {
        throw new Error(apiErr.message || 'Budget line cannot be deleted because it is in use');
      } else {
        throw new Error('Failed to delete budget line');
      }
    }
  };

  // Helper to update form with partial updates (merges with existing state)
  const setBudgetFormPartial = (updates: Partial<BudgetLineFormState>) => {
    setBudgetForm((prev) => ({ ...prev, ...updates }));
  };

  // Helper to replace entire form state
  const setBudgetFormFull = (state: BudgetLineFormState) => {
    setBudgetForm(state);
  };

  // ─── Subsidy linking handlers ──────────────────────────────────────────

  const handleLinkSubsidy = async () => {
    if (!selectedSubsidyId) return;

    setIsLinkingSubsidy(true);

    try {
      await reloadLinkedSubsidies();
      setSelectedSubsidyId('');
    } catch (err) {
      setIsLinkingSubsidy(false);
      throw err;
    } finally {
      setIsLinkingSubsidy(false);
    }
  };

  const handleUnlinkSubsidy = async () => {
    await reloadLinkedSubsidies();
  };

  return {
    // Budget form state
    showBudgetForm,
    budgetForm,
    editingBudgetId,
    isSavingBudget,
    budgetFormError,
    deletingBudgetId,

    // Subsidy linking state
    selectedSubsidyId,
    isLinkingSubsidy,

    // Handlers
    openAddBudgetForm,
    openEditBudgetForm,
    closeBudgetForm,
    handleSaveBudgetLine,
    handleDeleteBudgetLine,
    confirmDeleteBudgetLine,
    setBudgetFormPartial,
    setBudgetForm: setBudgetFormFull,
    setDeletingBudgetId,

    // Subsidy handlers
    handleLinkSubsidy,
    handleUnlinkSubsidy,
    setSelectedSubsidyId,
  };
}
