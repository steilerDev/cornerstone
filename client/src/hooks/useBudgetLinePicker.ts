import { useState, useCallback, useRef, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  WorkItemBudgetLine,
  HouseholdItemBudgetLine,
  Vendor,
  BudgetCategory,
  CreateInvoiceBudgetLineRequest,
} from '@cornerstone/shared';
import { fetchWorkItemBudgets, createWorkItemBudget } from '../lib/workItemBudgetsApi.js';
import {
  fetchHouseholdItemBudgets,
  createHouseholdItemBudget,
} from '../lib/householdItemBudgetsApi.js';
import { fetchBudgetCategories } from '../lib/budgetCategoriesApi.js';
import { fetchBudgetSources } from '../lib/budgetSourcesApi.js';
import { fetchVendors } from '../lib/vendorsApi.js';
import { createInvoiceBudgetLine } from '../lib/invoiceBudgetLinesApi.js';
import type { BudgetLineFormState } from './useBudgetSection.js';
import type { BudgetSource } from '@cornerstone/shared';
import { ApiClientError } from '../lib/apiClient.js';

type BudgetLineType = 'work_item' | 'household_item';

export interface PickerState {
  isOpen: boolean;
  step: 1 | 2;
  type: BudgetLineType | null;
  itemId: string | null;
  itemTitle: string | null;
  isLoading: boolean;
  error: string | null;
  budgetLines: (WorkItemBudgetLine | HouseholdItemBudgetLine)[];
  budgetSources: BudgetSource[] | null;
  vendors: Vendor[] | null;
  categories: BudgetCategory[] | null;
  showCreateForm: boolean;
  createForm?: BudgetLineFormState;
  createError: string | null;
  isCreatingBudgetLine?: boolean;
}

interface UseBudgetLinePickerOptions {
  invoiceId: string;
  invoiceAmount: number;
  onLineCreated: (
    line: WorkItemBudgetLine | HouseholdItemBudgetLine,
    invoiceBudgetLineId: string | null,
  ) => void;
  eagerLinkInvoice?: boolean;
}

export interface UseBudgetLinePickerReturn {
  pickerState: PickerState;
  openPicker: () => void;
  closePicker: () => void;
  handleSelectItem: (itemId: string, type: BudgetLineType, itemTitle?: string) => Promise<void>;
  showCreateBudgetLineForm: (prefill?: Partial<BudgetLineFormState>) => Promise<void>;
  handleCreateBudgetLine: (e: FormEvent) => Promise<void>;
  setPickerState: React.Dispatch<React.SetStateAction<PickerState>>;
  createBudgetLineButtonRef: React.RefObject<HTMLButtonElement | null>;
  initializeStaticData: () => Promise<void>;
}

export function useBudgetLinePicker({
  invoiceId,
  invoiceAmount: _invoiceAmount,
  onLineCreated,
  eagerLinkInvoice = true,
}: UseBudgetLinePickerOptions): UseBudgetLinePickerReturn {
  const { t } = useTranslation('budget');

  const [pickerState, setPickerState] = useState<PickerState>({
    isOpen: false,
    step: 1,
    type: null,
    itemId: null,
    itemTitle: null,
    isLoading: false,
    error: null,
    budgetLines: [],
    budgetSources: null,
    vendors: null,
    categories: null,
    showCreateForm: false,
    createError: null,
  });

  const createBudgetLineButtonRef = useRef<HTMLButtonElement | null>(null);

  const openPicker = useCallback(() => {
    setPickerState((prev) => ({
      ...prev,
      isOpen: true,
      step: 1,
      type: null,
      itemId: null,
      itemTitle: null,
      error: null,
      showCreateForm: false,
      createError: null,
    }));
  }, []);

  const closePicker = useCallback(() => {
    setPickerState((prev) => ({
      ...prev,
      isOpen: false,
      step: 1,
      type: null,
      itemId: null,
      itemTitle: null,
      budgetLines: [],
      error: null,
      showCreateForm: false,
      createForm: undefined,
      createError: null,
    }));
  }, []);

  const handleSelectItem = useCallback(
    async (itemId: string, type: BudgetLineType, itemTitle?: string) => {
      setPickerState({
        isOpen: true,
        step: 2,
        type,
        itemId,
        itemTitle: itemTitle ?? itemId,
        budgetLines: [],
        isLoading: true,
        error: null,
        budgetSources: pickerState.budgetSources,
        vendors: pickerState.vendors,
        categories: pickerState.categories,
        showCreateForm: false,
        createError: null,
      });

      try {
        const fetchFn = type === 'work_item' ? fetchWorkItemBudgets : fetchHouseholdItemBudgets;
        const lines = await fetchFn(itemId);

        // Filter to only unlinked budget lines
        const unlinkedLines = lines.filter((bl) => bl.invoiceLink === null);

        setPickerState((prev) => ({
          ...prev,
          budgetLines: unlinkedLines,
          isLoading: false,
        }));
      } catch (err) {
        const errorMsg =
          err instanceof ApiClientError
            ? err.error.message
            : t('invoiceDetail.budgetLines.picker.loadError');

        setPickerState((prev) => ({
          ...prev,
          budgetLines: [],
          isLoading: false,
          error: errorMsg,
        }));
      }
    },
    [pickerState.budgetSources, pickerState.vendors, pickerState.categories, t],
  );

  const initializeStaticData = useCallback(async () => {
    try {
      const [categoriesResponse, sourcesResponse, vendorsResponse] = await Promise.all([
        fetchBudgetCategories(),
        fetchBudgetSources(),
        fetchVendors({ pageSize: 100 }),
      ]);
      setPickerState((prev) => ({
        ...prev,
        categories: categoriesResponse.categories,
        budgetSources: sourcesResponse.budgetSources,
        vendors: vendorsResponse.vendors,
      }));
    } catch (err) {
      // Non-fatal: page can still render; users will see empty selects until retried via picker

      console.warn('[useBudgetLinePicker] Failed to initialize static data:', err);
    }
  }, []);

  const showCreateBudgetLineForm = useCallback(
    async (prefill?: Partial<BudgetLineFormState>) => {
      try {
        const [categoriesResponse, sourcesResponse, vendorsResponse] = await Promise.all([
          fetchBudgetCategories(),
          fetchBudgetSources(),
          fetchVendors({ pageSize: 100 }),
        ]);

        const discretionaryId = sourcesResponse.budgetSources.find((s) => s.isDiscretionary)?.id;

        const initialForm: BudgetLineFormState = {
          description: '',
          plannedAmount: '',
          confidence: 'invoice',
          budgetCategoryId: '',
          budgetSourceId: discretionaryId ?? '',
          vendorId: '',
          pricingMode: 'direct',
          quantity: '',
          unit: '',
          unitPrice: '',
          includesVat: true,
          ...prefill,
        };

        setPickerState((prev) => ({
          ...prev,
          showCreateForm: true,
          createForm: initialForm,
          categories: categoriesResponse.categories,
          budgetSources: sourcesResponse.budgetSources,
          vendors: vendorsResponse.vendors,
          createError: null,
        }));
      } catch (err) {
        const errorMsg =
          err instanceof ApiClientError
            ? err.error.message
            : t('invoiceDetail.budgetLines.picker.loadFormError');
        setPickerState((prev) => ({
          ...prev,
          error: errorMsg,
        }));
      }
    },
    [t],
  );

  const handleCreateBudgetLine = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!pickerState.itemId || !pickerState.type || !pickerState.createForm) return;

      const form = pickerState.createForm;

      let plannedAmount: number;
      if (form.pricingMode === 'direct') {
        plannedAmount = parseFloat(form.plannedAmount);
        if (isNaN(plannedAmount) || plannedAmount < 0) {
          setPickerState((prev) => ({
            ...prev,
            createError: t('invoiceDetail.budgetLines.picker.error.plannedAmountInvalid'),
          }));
          return;
        }
        const multiplier = form.includesVat ? 1 : 1.19;
        plannedAmount = Math.round(plannedAmount * multiplier * 100) / 100;
      } else {
        const qty = parseFloat(form.quantity);
        const price = parseFloat(form.unitPrice);
        if (isNaN(qty) || qty <= 0) {
          setPickerState((prev) => ({
            ...prev,
            createError: t('invoiceDetail.budgetLines.picker.error.quantityInvalid'),
          }));
          return;
        }
        if (isNaN(price) || price < 0) {
          setPickerState((prev) => ({
            ...prev,
            createError: t('invoiceDetail.budgetLines.picker.error.unitPriceInvalid'),
          }));
          return;
        }
        plannedAmount = Math.round(qty * price * 100) / 100;
      }

      setPickerState((prev) => ({
        ...prev,
        isCreatingBudgetLine: true,
        createError: null,
        error: null,
      }));

      try {
        const createFn =
          pickerState.type === 'work_item' ? createWorkItemBudget : createHouseholdItemBudget;
        const payload = {
          description: form.description.trim() || null,
          plannedAmount,
          confidence: form.confidence,
          budgetCategoryId: pickerState.type === 'work_item' ? form.budgetCategoryId || null : null,
          budgetSourceId: form.budgetSourceId || null,
          vendorId: form.vendorId || null,
          quantity: form.pricingMode === 'unit' && form.quantity ? parseFloat(form.quantity) : null,
          unit: form.pricingMode === 'unit' && form.unit ? form.unit : null,
          unitPrice:
            form.pricingMode === 'unit' && form.unitPrice ? parseFloat(form.unitPrice) : null,
          includesVat: form.includesVat,
        };
        const newBudgetLine = await createFn(pickerState.itemId, payload);

        let junctionId: string | null = null;
        if (eagerLinkInvoice) {
          const linkData: CreateInvoiceBudgetLineRequest = {
            invoiceId,
            ...(pickerState.type === 'work_item'
              ? { workItemBudgetId: newBudgetLine.id }
              : { householdItemBudgetId: newBudgetLine.id }),
            itemizedAmount: newBudgetLine.plannedAmount,
          };
          const linkResponse = await createInvoiceBudgetLine(invoiceId, linkData);
          junctionId = linkResponse.budgetLine.id;
        }

        onLineCreated(newBudgetLine, junctionId);
        closePicker();
      } catch (err) {
        if (err instanceof ApiClientError) {
          if (
            err.error.code === 'ITEMIZED_SUM_EXCEEDS_INVOICE' ||
            err.error.code === 'BUDGET_LINE_ALREADY_LINKED'
          ) {
            try {
              const fetchFn =
                pickerState.type === 'work_item' ? fetchWorkItemBudgets : fetchHouseholdItemBudgets;
              const lines = await fetchFn(pickerState.itemId!);
              const unlinkedLines = lines.filter((bl) => bl.invoiceLink === null);

              let errorMsg: string;
              if (err.error.code === 'ITEMIZED_SUM_EXCEEDS_INVOICE') {
                errorMsg = t('invoiceDetail.budgetLines.picker.error.exceedsTotal');
              } else {
                errorMsg = t('invoiceDetail.budgetLines.picker.error.alreadyLinked');
              }

              setPickerState((prev) => ({
                ...prev,
                showCreateForm: false,
                createForm: undefined,
                budgetLines: unlinkedLines,
                isCreatingBudgetLine: false,
                createError: null,
                error: errorMsg,
              }));
            } catch {
              setPickerState((prev) => ({
                ...prev,
                showCreateForm: false,
                createForm: undefined,
                isCreatingBudgetLine: false,
                createError: null,
                error:
                  err instanceof ApiClientError
                    ? err.error.message
                    : t('invoiceDetail.budgetLines.picker.loadError'),
              }));
            }
            return;
          }

          setPickerState((prev) => ({
            ...prev,
            isCreatingBudgetLine: false,
            createError: err.error.message,
          }));
        } else {
          setPickerState((prev) => ({
            ...prev,
            isCreatingBudgetLine: false,
            createError: t('invoiceDetail.budgetLines.picker.error.createFailed'),
          }));
        }
      }
    },
    [
      pickerState.itemId,
      pickerState.type,
      pickerState.createForm,
      t,
      invoiceId,
      onLineCreated,
      closePicker,
      eagerLinkInvoice,
    ],
  );

  return {
    pickerState,
    openPicker,
    closePicker,
    handleSelectItem,
    showCreateBudgetLineForm,
    handleCreateBudgetLine,
    setPickerState,
    createBudgetLineButtonRef,
    initializeStaticData,
  };
}
