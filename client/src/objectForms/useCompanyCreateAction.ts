import { use, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SearchPickerCreateAction } from '../components/SearchPicker/SearchPicker.js';
import { CompanyCreateContext } from './companyCreateContext.js';
import type { CompanyOption } from './companyForm.js';

export interface CompanyCreateAction {
  /** undefined outside a CompanyCreateProvider (unit tests): pickers then show no create row. */
  readonly createAction: SearchPickerCreateAction<CompanyOption> | undefined;
  /** True while the create dialog is open (hosts in a Modal pass dismissible={!isCreating}). */
  readonly isCreating: boolean;
}

/**
 * The "New company ‹text›" row for a company SearchPicker. The form opens in place through
 * `CompanyCreateProvider`; this module never imports ObjectForm.
 */
export function useCompanyCreateAction(): CompanyCreateAction {
  const { t } = useTranslation('budget');
  const request = use(CompanyCreateContext);
  const [isCreating, setIsCreating] = useState(false);
  const requestRef = useRef(request);
  requestRef.current = request;

  const createAction = useMemo<SearchPickerCreateAction<CompanyOption> | undefined>(() => {
    if (request === null) return undefined;
    return {
      getLabel: (query) => t('companies.picker.newNamed', { name: query }),
      show: 'noExactMatch',
      onCreate: async (query) => {
        setIsCreating(true);
        try {
          return await requestRef.current!(query);
        } finally {
          setIsCreating(false);
        }
      },
    };
  }, [request, t]);

  return { createAction, isCreating };
}
