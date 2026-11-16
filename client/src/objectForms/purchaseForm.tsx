import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HOUSEHOLD_ITEM_STATUSES, routeUrl } from '@cornerstone/shared';
import type {
  HouseholdItemCategory,
  HouseholdItemCategoryEntity,
  HouseholdItemStatus,
} from '@cornerstone/shared';
import { EntityMultiPicker } from '../components/EntityPicker/EntityMultiPicker.js';
import { parsePredecessorValue } from '../components/EntityPicker/entityPickerKinds.js';
import type { EntityOption } from '../components/EntityPicker/types.js';
import { fieldsForScope } from '../components/ObjectForm/objectFormState.js';
import type {
  ObjectFormErrors,
  ObjectFormSchema,
  ObjectFormScope,
  ObjectFormValues,
} from '../components/ObjectForm/types.js';
import type { KnownCompany } from '../hooks/useCompanyName.js';
import { useAreas } from '../hooks/useAreas.js';
import { useStatusBadgeVariants } from '../hooks/useStatusBadgeVariants.js';
import { ApiClientError } from '../lib/apiClient.js';
import { fetchHouseholdItemCategories } from '../lib/householdItemCategoriesApi.js';
import { createHouseholdItemDep } from '../lib/householdItemDepsApi.js';
import { createHouseholdItem } from '../lib/householdItemsApi.js';
import { getCategoryDisplayName } from '../lib/categoryUtils.js';
import { fetchVendor, fetchVendors } from '../lib/vendorsApi.js';
import { prefillFromSearch } from '../navigation/createQuery.js';
import { useRealLocation } from '../navigation/realLocation.js';
import { EntityPicker } from '../components/EntityPicker/EntityPicker.js';
import { AreaField } from './AreaField.js';
import { useCompanyFormSchema } from './companyForm.js';
import type { CompanyOption } from './companyForm.js';

/** The tasks and milestones chosen in "Waits for"; the field value is the chosen options. */
function chosenOptions(value: unknown): readonly EntityOption[] {
  return Array.isArray(value) ? (value as EntityOption[]) : [];
}

export interface PurchaseFormOptions {
  /** Default 'create' (the dialog). 'edit' = the purchase page cards. */
  readonly scope?: ObjectFormScope;
  /** The purchase's current company (edit): its name shows in the Company picker. */
  readonly knownCompany?: KnownCompany | null;
}

export interface PurchaseValueMessages {
  readonly name: string;
  readonly category: string;
  readonly quantity: string;
  readonly deliveryDates: string;
  readonly deliveryWindow: string;
}

/** The messages of `validatePurchaseValues` (translation only, no requests). */
export function usePurchaseValueMessages(): PurchaseValueMessages {
  const { t } = useTranslation('householdItems');
  return {
    name: t('create.form.name.error'),
    category: t('create.form.category.error'),
    quantity: t('create.form.quantity.error'),
    deliveryDates: t('create.form.deliveryDates.error'),
    deliveryWindow: t('create.form.deliveryWindow.error'),
  };
}

/** Every purchase rule, dialog and cards alike; keys are field names (missing keys read as ''). */
export function validatePurchaseValues(
  values: ObjectFormValues,
  messages: PurchaseValueMessages,
): ObjectFormErrors {
  const text = (key: string): string => String(values[key] ?? '');
  const errors: Record<string, string> = {};
  if (!text('name').trim()) errors.name = messages.name;
  if (!text('category')) errors.category = messages.category;
  const quantity = Number(text('quantity'));
  if (!Number.isInteger(quantity) || quantity < 1) errors.quantity = messages.quantity;
  const order = text('orderDate');
  const actual = text('actualDeliveryDate');
  if (actual && order && actual < order) errors.actualDeliveryDate = messages.deliveryDates;
  const earliest = text('earliestDeliveryDate');
  const latest = text('latestDeliveryDate');
  if (earliest && latest && earliest > latest) errors.latestDeliveryDate = messages.deliveryWindow;
  return errors;
}

/**
 * The purchase form: the New purchase dialog (default) and, with `scope: 'edit'`, the fields of
 * the purchase page cards. Waits for creates finish-to-start dependencies after the purchase.
 */
export function usePurchaseFormSchema(options: PurchaseFormOptions = {}): ObjectFormSchema {
  const { scope = 'create' } = options;
  const { t } = useTranslation('householdItems');
  const { t: tw } = useTranslation('workItems');
  const messages = usePurchaseValueMessages();
  const { t: tc } = useTranslation('common');
  const { t: tSettings } = useTranslation('settings');
  const companySchema = useCompanyFormSchema();
  const statusVariants = useStatusBadgeVariants();
  const { areas, isLoading: areasLoading } = useAreas();
  // The pre-filled company, read once from the real location (the dialog route's own URL).
  const realLocation = useRealLocation();
  const [prefilledId] = useState(
    () => prefillFromSearch(new URLSearchParams(realLocation.search)).companyId,
  );

  const [vendors, setVendors] = useState<CompanyOption[]>([]);
  const [categories, setCategories] = useState<HouseholdItemCategoryEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  // A company created from the picker's child step: its name shows until the user changes it.
  const [createdCompany, setCreatedCompany] = useState<CompanyOption | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        // The page cards need the categories only (the company picker searches on its own).
        const [vendorsResponse, categoriesResponse] = await Promise.all([
          scope === 'create' ? fetchVendors({ pageSize: 100 }) : Promise.resolve(null),
          fetchHouseholdItemCategories(),
        ]);
        if (cancelled) return;
        let loaded: CompanyOption[] = vendorsResponse?.vendors ?? [];
        // A pre-filled company outside the first page is looked up on its own; only a company
        // that does not exist (404) is left out, so ObjectForm then drops its id.
        if (scope === 'create' && prefilledId && !loaded.some((v) => v.id === prefilledId)) {
          try {
            const found = await fetchVendor(prefilledId);
            if (cancelled) return;
            loaded = [...loaded, { id: found.id, name: found.name }];
          } catch (err) {
            // Only a company that does not exist is dropped; any other failure shows the load error.
            if (!(err instanceof ApiClientError && err.statusCode === 404)) throw err;
          }
        }
        if (cancelled) return;
        setVendors(loaded);
        setCategories(categoriesResponse.categories);
      } catch (err) {
        console.error('Failed to load data:', err);
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadData();
    return () => {
      cancelled = true;
    };
  }, [prefilledId, scope]);

  return {
    id: 'purchase',
    title: tc('navigation.newPurchase'),
    prefill: { areaId: 'area', companyId: 'vendorId' },
    initialValues: {
      name: '',
      category: '',
      status: 'planned',
      quantity: '1',
      area: '',
      vendorId: '',
      description: '',
      url: '',
      orderDate: '',
      earliestDeliveryDate: '',
      latestDeliveryDate: '',
      actualDeliveryDate: '',
      waitsFor: [],
    },
    fields: fieldsForScope(
      [
        {
          name: 'name',
          label: t('create.form.name.label'),
          kind: 'text',
          essential: true,
          required: true,
          maxLength: 500,
          placeholder: t('create.form.name.placeholder'),
        },
        {
          name: 'category',
          label: t('create.form.category.label'),
          kind: 'custom',
          essential: true,
          required: true,
          optionsLoading: loading,
          defaultFromOptions: 'first',
          notice: loadFailed ? t('create.errors.loadFailed') : undefined,
          options: loading ? [] : categories.map((cat) => ({ value: cat.id, label: cat.name })),
          render: (ctx) => {
            const categoryId = typeof ctx.value === 'string' ? ctx.value : '';
            const category = categories.find((cat) => cat.id === categoryId);
            return (
              <EntityPicker
                kind="category"
                id={ctx.id}
                value={categoryId}
                selectedLabel={
                  category
                    ? getCategoryDisplayName(tSettings, category.name, category.translationKey)
                    : undefined
                }
                onChange={ctx.setValue}
                disabled={ctx.busy}
                placeholder={t('create.form.category.placeholder')}
                inputAriaProps={{
                  'aria-required': true,
                  'aria-invalid': ctx.invalid || undefined,
                  'aria-describedby': ctx.describedBy,
                }}
              />
            );
          },
        },
        {
          // The page's header status menu owns status.
          name: 'status',
          label: t('create.form.status.label'),
          kind: 'select',
          essential: true,
          width: 'half',
          scope: 'create',
          options: HOUSEHOLD_ITEM_STATUSES.map((status) => ({
            value: status,
            label: statusVariants.purchase[status].label,
          })),
        },
        {
          name: 'quantity',
          label: t('create.form.quantity.label'),
          kind: 'number',
          essential: true,
          width: 'half',
          min: 1,
          step: 1,
        },
        {
          name: 'area',
          label: t('create.form.area.label'),
          kind: 'custom',
          essential: true,
          options: areas.map((a) => ({ value: a.id, label: a.name })),
          optionsLoading: areasLoading,
          render: (ctx) => <AreaField ctx={ctx} areas={areas} />,
        },
        {
          name: 'vendorId',
          label: t('create.form.vendor.label'),
          kind: 'custom',
          essential: true,
          // Lets ObjectForm drop an unknown pre-filled company id once the companies have loaded (D12).
          // The page cards have no such list (the picker looks the company up by id).
          ...(scope === 'create'
            ? {
                options: vendors.map((v) => ({ value: v.id, label: v.name })),
                optionsLoading: loading,
              }
            : {}),
          render: (ctx) => {
            const value = typeof ctx.value === 'string' ? ctx.value : '';
            return (
              <EntityPicker
                kind="company"
                id={ctx.id}
                value={value}
                onChange={ctx.setValue}
                disabled={ctx.busy}
                placeholder={t('create.form.vendor.placeholder')}
                selectedLabel={vendors.find((v) => v.id === value)?.name}
                knownCompany={createdCompany ?? options.knownCompany ?? null}
                inputAriaProps={{
                  'aria-invalid': ctx.invalid || undefined,
                  'aria-describedby': ctx.describedBy,
                }}
                // The dialog continues in a child step (dialogs never stack); the new company
                // is set on this field when it is saved. The page cards keep the picker's own.
                create={
                  scope === 'create'
                    ? (query) => {
                        ctx.createChild({
                          schema: companySchema,
                          prefill: { name: query },
                          onCreated: (result) => {
                            setCreatedCompany({ id: result.id, name: result.label });
                            ctx.setValue(result.id);
                          },
                        });
                        return Promise.resolve(null);
                      }
                    : undefined
                }
              />
            );
          },
        },
        {
          name: 'waitsFor',
          label: t('create.form.waitsFor.label'),
          hint: t('create.form.waitsFor.hint'),
          kind: 'custom',
          essential: true,
          scope: 'create',
          render: (ctx) => (
            <EntityMultiPicker
              id={ctx.id}
              value={chosenOptions(ctx.value)}
              onChange={(next) => ctx.setValue(next)}
              picker={{ kind: 'taskOrMilestone', disabled: ctx.busy }}
              removeLabel={(option) => tw('create.waitsFor.remove', { title: option.label })}
              countLabel={(count) => tw('create.waitsFor.count', { count })}
              invalid={ctx.invalid}
              describedBy={ctx.describedBy}
              testId="purchase-form-waits-for"
            />
          ),
        },
        {
          name: 'earliestDeliveryDate',
          label: t('create.form.earliestDelivery.label'),
          kind: 'date',
          essential: true,
          width: 'half',
        },
        {
          name: 'latestDeliveryDate',
          label: t('create.form.latestDelivery.label'),
          kind: 'date',
          essential: true,
          width: 'half',
        },
        {
          name: 'description',
          label: t('create.form.description.label'),
          kind: 'textarea',
          maxLength: 5000,
          placeholder: t('create.form.description.placeholder'),
        },
        {
          name: 'url',
          label: t('create.form.url.label'),
          kind: 'url',
          maxLength: 2000,
          placeholder: t('create.form.url.placeholder'),
        },
        { name: 'orderDate', label: t('create.form.orderDate.label'), kind: 'date' },
        {
          name: 'actualDeliveryDate',
          label: t('create.form.actualDelivery.label'),
          kind: 'date',
        },
      ],
      scope,
    ),
    validate: (values: ObjectFormValues): ObjectFormErrors =>
      validatePurchaseValues(values, messages),
    submit: async (values) => {
      const name = String(values.name).trim();
      const item = await createHouseholdItem({
        name,
        description: String(values.description ?? '').trim() || null,
        category: values.category as HouseholdItemCategory,
        status: values.status as HouseholdItemStatus,
        quantity: Number(values.quantity),
        areaId: String(values.area ?? '') || null,
        vendorId: String(values.vendorId ?? '') || null,
        url: String(values.url ?? '').trim() || null,
        orderDate: String(values.orderDate ?? '') || null,
        earliestDeliveryDate: String(values.earliestDeliveryDate ?? '') || undefined,
        latestDeliveryDate: String(values.latestDeliveryDate ?? '') || undefined,
        actualDeliveryDate: String(values.actualDeliveryDate ?? '') || null,
      });

      // "Waits for": finish-to-start, no lag; the type is edited later on the purchase page.
      const failed: string[] = [];
      for (const option of chosenOptions(values.waitsFor)) {
        const target = parsePredecessorValue(option.id);
        if (target === null) continue;
        try {
          await createHouseholdItemDep(item.id, {
            predecessorType: target.type,
            predecessorId: target.id,
          });
        } catch {
          failed.push(option.label);
        }
      }

      return {
        id: item.id,
        href: routeUrl(
          'householdItem',
          { id: item.id },
          failed.length > 0 ? { tab: 'timing', depError: failed.join(', ') } : undefined,
        ),
        label: name,
        incomplete: failed.length > 0,
      };
    },
  };
}
