import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { ObjectFormErrors, ObjectFormSchema } from '../components/ObjectForm/types.js';
import { createTrade } from '../lib/tradesApi.js';

export const TRADE_NAME_MAX_LENGTH = 200;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The New trade form: the name only (P5.10c extends it). Field names are the API body keys, so
 * server `details.fields[].path` maps onto them.
 */
export function useTradeFormSchema(): ObjectFormSchema {
  const { t } = useTranslation('common');
  const { t: tSettings } = useTranslation('settings');

  return {
    id: 'trade',
    title: t('entityPicker.forms.tradeTitle'),
    initialValues: { name: '' },
    fields: [
      {
        name: 'name',
        label: t('entityPicker.forms.name'),
        kind: 'text',
        essential: true,
        required: true,
        maxLength: TRADE_NAME_MAX_LENGTH,
        testId: 'trade-name-input',
      },
    ],
    validate: (values): ObjectFormErrors => {
      const errors: Record<string, string> = {};
      if (!text(values.name)) errors.name = tSettings('tradesManager.nameRequired');
      return errors;
    },
    mapError: (code) =>
      code === 'CONFLICT' ? { name: tSettings('tradesManager.duplicateName') } : null,
    submit: async (values) => {
      const created = await createTrade({ name: text(values.name) });
      return { id: created.id, href: routeUrl('settingsManage'), label: created.name };
    },
  };
}
