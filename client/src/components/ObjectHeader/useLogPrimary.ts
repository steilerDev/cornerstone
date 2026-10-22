import { useTranslation } from 'react-i18next';
import { useCreateEntryLink } from '../../navigation/useOpenCreate.js';
import type { ObjectHeaderPrimary } from './ObjectHeader.js';

/**
 * The terminal-state primary: "Log", a new diary entry that carries the page's create context
 * and origin (never a bare navigate). An offer's primary is "Convert to invoice" instead, a plain
 * `{ kind: 'link', to: routeUrl(…) }` that the invoice page builds.
 */
export function useLogPrimary(testId = 'object-header-log'): ObjectHeaderPrimary {
  const { t } = useTranslation('common');
  const link = useCreateEntryLink('diaryEntry');
  return { kind: 'link', label: t('objectHeader.log'), to: link.to, state: link.state, testId };
}
