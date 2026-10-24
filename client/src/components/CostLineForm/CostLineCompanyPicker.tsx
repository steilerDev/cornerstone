import { useTranslation } from 'react-i18next';
import { useCompanyName } from '../../hooks/useCompanyName.js';
import type { KnownCompany } from '../../hooks/useCompanyName.js';
import { searchCompanies } from '../../lib/vendorsApi.js';
import type { CompanyOption } from '../../objectForms/companyForm.js';
import type { ObjectFormRenderContext, ObjectFormSchema } from '../ObjectForm/types.js';
import { SearchPicker } from '../SearchPicker/SearchPicker.js';

const NO_EXCLUDED: string[] = [];

export interface CostLineCompanyPickerProps {
  readonly ctx: ObjectFormRenderContext;
  /** The New company form, opened as a child step of the cost line form. */
  readonly companySchema: ObjectFormSchema;
  /** The saved company of the line being edited, when the host has it. */
  readonly known?: KnownCompany | null;
  readonly placeholder: string;
  /**
   * Called with a company created in the child step. The host keeps it above this component
   * (which unmounts while the child step is open) and passes it back as `known`, so the name
   * survives without a lookup.
   */
  readonly onCreatedCompany: (company: KnownCompany) => void;
}

/** The company of a cost line: a company search with a "New company ‹text›" row (like the purchase form). */
export function CostLineCompanyPicker({
  ctx,
  companySchema,
  known,
  placeholder,
  onCreatedCompany,
}: CostLineCompanyPickerProps) {
  const { t: tb } = useTranslation('budget');
  const value = typeof ctx.value === 'string' ? ctx.value : '';
  const company = useCompanyName(value, { known, onUnknown: () => ctx.setValue('') });

  return (
    <SearchPicker<CompanyOption>
      id={ctx.id}
      value={value}
      onChange={ctx.setValue}
      onSelectItem={company.remember}
      excludeIds={NO_EXCLUDED}
      disabled={ctx.busy}
      placeholder={placeholder}
      searchFn={(query, _excluded, signal) => searchCompanies(query, signal)}
      renderItem={(vendor) => ({ id: vendor.id, label: vendor.name })}
      showItemsOnFocus
      initialTitle={company.name}
      inputAriaProps={{
        'aria-invalid': ctx.invalid || undefined,
        'aria-describedby': ctx.describedBy,
      }}
      createAction={{
        getLabel: (query) => tb('companies.picker.newNamed', { name: query }),
        show: 'noExactMatch',
        // The form continues in a child step (dialogs never stack); the new company is set on
        // this field when it is saved.
        onCreate: async (query) => {
          ctx.createChild({
            schema: companySchema,
            prefill: { name: query },
            onCreated: (result) => {
              onCreatedCompany({ id: result.id, name: result.label });
              ctx.setValue(result.id);
            },
          });
          return null;
        },
      }}
    />
  );
}
