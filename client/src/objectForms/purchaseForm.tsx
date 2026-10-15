import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HOUSEHOLD_ITEM_STATUSES, routeUrl } from '@cornerstone/shared';
import type {
  HouseholdItemCategory,
  HouseholdItemCategoryEntity,
  HouseholdItemStatus,
} from '@cornerstone/shared';
import type {
  ObjectFormErrors,
  ObjectFormSchema,
  ObjectFormValues,
} from '../components/ObjectForm/types.js';
import { useAreas } from '../hooks/useAreas.js';
import { useStatusBadgeVariants } from '../hooks/useStatusBadgeVariants.js';
import { ApiClientError } from '../lib/apiClient.js';
import { fetchHouseholdItemCategories } from '../lib/householdItemCategoriesApi.js';
import { createHouseholdItem } from '../lib/householdItemsApi.js';
import { fetchVendor, fetchVendors, searchCompanies } from '../lib/vendorsApi.js';
import { prefillFromSearch } from '../navigation/createQuery.js';
import { useRealLocation } from '../navigation/realLocation.js';
import { SearchPicker } from '../components/SearchPicker/SearchPicker.js';
import { AreaField } from './AreaField.js';
import { useCompanyFormSchema } from './companyForm.js';
import type { CompanyOption } from './companyForm.js';

const NO_EXCLUDED: string[] = [];

/** The New purchase form: a 1:1 port of the former create page. */
export function usePurchaseFormSchema(): ObjectFormSchema {
  const { t } = useTranslation('householdItems');
  const { t: tc } = useTranslation('common');
  const { t: tb } = useTranslation('budget');
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
        const [vendorsResponse, categoriesResponse] = await Promise.all([
          fetchVendors({ pageSize: 100 }),
          fetchHouseholdItemCategories(),
        ]);
        if (cancelled) return;
        let loaded: CompanyOption[] = vendorsResponse.vendors;
        // A pre-filled company outside the first page is looked up on its own; only a company
        // that does not exist (404) is left out, so ObjectForm then drops its id.
        if (prefilledId && !loaded.some((v) => v.id === prefilledId)) {
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
  }, [prefilledId]);

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
    },
    fields: [
      {
        name: 'name',
        label: t('create.form.name.label'),
        kind: 'text',
        essential: true,
        required: true,
        placeholder: t('create.form.name.placeholder'),
      },
      {
        name: 'category',
        label: t('create.form.category.label'),
        kind: 'select',
        essential: true,
        required: true,
        optionsLoading: loading,
        defaultFromOptions: 'first',
        notice: loadFailed ? t('create.errors.loadFailed') : undefined,
        options: loading
          ? []
          : [
              { value: '', label: t('create.form.category.placeholder') },
              ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
            ],
      },
      {
        name: 'status',
        label: t('create.form.status.label'),
        kind: 'select',
        essential: true,
        width: 'half',
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
        options: vendors.map((v) => ({ value: v.id, label: v.name })),
        optionsLoading: loading,
        render: (ctx) => {
          const value = typeof ctx.value === 'string' ? ctx.value : '';
          return (
            <SearchPicker<CompanyOption>
              id={ctx.id}
              value={value}
              onChange={ctx.setValue}
              excludeIds={NO_EXCLUDED}
              disabled={ctx.busy}
              placeholder={t('create.form.vendor.placeholder')}
              searchFn={(query, _excluded, signal) => searchCompanies(query, signal)}
              renderItem={(vendor) => ({ id: vendor.id, label: vendor.name })}
              showItemsOnFocus
              initialTitle={
                createdCompany?.id === value
                  ? createdCompany.name
                  : vendors.find((v) => v.id === value)?.name
              }
              inputAriaProps={{
                'aria-invalid': ctx.invalid || undefined,
                'aria-describedby': ctx.describedBy,
              }}
              createAction={{
                getLabel: (query) => tb('companies.picker.newNamed', { name: query }),
                show: 'noExactMatch',
                // The form continues in a child step (dialogs never stack); the new company
                // is set on this field when it is saved.
                onCreate: async (query) => {
                  ctx.createChild({
                    schema: companySchema,
                    prefill: { name: query },
                    onCreated: (result) => {
                      setCreatedCompany({ id: result.id, name: result.label });
                      ctx.setValue(result.id);
                    },
                  });
                  return null;
                },
              }}
            />
          );
        },
      },
      {
        name: 'description',
        label: t('create.form.description.label'),
        kind: 'textarea',
        placeholder: t('create.form.description.placeholder'),
      },
      {
        name: 'url',
        label: t('create.form.url.label'),
        kind: 'url',
        placeholder: t('create.form.url.placeholder'),
      },
      { name: 'orderDate', label: t('create.form.orderDate.label'), kind: 'date' },
      {
        name: 'earliestDeliveryDate',
        label: t('create.form.earliestDelivery.label'),
        kind: 'date',
        width: 'half',
      },
      {
        name: 'latestDeliveryDate',
        label: t('create.form.latestDelivery.label'),
        kind: 'date',
        width: 'half',
      },
      {
        name: 'actualDeliveryDate',
        label: t('create.form.actualDelivery.label'),
        kind: 'date',
      },
    ],
    validate: (values: ObjectFormValues): ObjectFormErrors => {
      const errors: Record<string, string> = {};
      if (!String(values.name ?? '').trim()) errors.name = t('create.form.name.error');
      if (!String(values.category ?? '')) errors.category = t('create.form.category.error');
      const quantity = Number(values.quantity);
      if (!Number.isFinite(quantity) || quantity < 1) {
        errors.quantity = t('create.form.quantity.error');
      }
      const order = String(values.orderDate ?? '');
      const actual = String(values.actualDeliveryDate ?? '');
      if (actual && order && actual < order) {
        errors.actualDeliveryDate = t('create.form.deliveryDates.error');
      }
      const earliest = String(values.earliestDeliveryDate ?? '');
      const latest = String(values.latestDeliveryDate ?? '');
      if (earliest && latest && earliest > latest) {
        errors.latestDeliveryDate = t('create.form.deliveryWindow.error');
      }
      return errors;
    },
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
      return { id: item.id, href: routeUrl('householdItem', { id: item.id }), label: name };
    },
  };
}
