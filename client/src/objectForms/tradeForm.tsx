import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type {
  ObjectFormErrors,
  ObjectFormSchema,
  ObjectFormValues,
} from '../components/ObjectForm/types.js';
import { useEntriesLanguage } from '../contexts/HouseNameContext.js';
import { createTrade } from '../lib/tradesApi.js';

export const TRADE_NAME_MAX_LENGTH = 200;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export interface TradeValueMessages {
  readonly nameRequired: string;
  readonly duplicateName: string;
}

/** Translation only (no data): the Trades sheet validates its inline rows with the same messages. */
export function useTradeValueMessages(): TradeValueMessages {
  const { t } = useTranslation('settings');
  return {
    nameRequired: t('tradesManager.nameRequired'),
    duplicateName: t('tradesManager.duplicateName'),
  };
}

/** Pure: a `name` error when the trimmed name is empty. */
export function validateTradeValues(
  values: ObjectFormValues,
  messages: TradeValueMessages,
): ObjectFormErrors {
  const errors: Record<string, string> = {};
  if (!text(values.name)) errors.name = messages.nameRequired;
  return errors;
}

/**
 * The New trade form (name only), shared by the trade pickers' inline create. The Trades sheet
 * keeps its inline rows and reuses the name limit and validator. Field names are the API body
 * keys, so server `details.fields[].path` maps onto them.
 */
export function useTradeFormSchema(): ObjectFormSchema {
  const { t } = useTranslation('common');
  const messages = useTradeValueMessages();
  const entriesLanguage = useEntriesLanguage() ?? undefined;

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
        autoComplete: 'off',
        lang: entriesLanguage,
        maxLength: TRADE_NAME_MAX_LENGTH,
        testId: 'trade-name-input',
      },
    ],
    validate: (values) => validateTradeValues(values, messages),
    mapError: (code) => (code === 'CONFLICT' ? { name: messages.duplicateName } : null),
    submit: async (values) => {
      const created = await createTrade({ name: text(values.name) });
      return { id: created.id, href: routeUrl('settingsManage'), label: created.name };
    },
  };
}
