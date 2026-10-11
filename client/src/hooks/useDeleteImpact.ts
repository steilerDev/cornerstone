import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DeleteImpactEffect, DeleteImpactEntityType } from '@cornerstone/shared';
import type { ConfirmDialogConsequences } from '../components/ConfirmDialog/ConfirmDialog.js';
import { I18N_UNION_KEYS } from '../i18n/unionKeys.js';
import { fetchDeleteImpact } from '../lib/deleteImpactApi.js';

type ImpactState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly effects: readonly DeleteImpactEffect[] };

/**
 * Loads what a delete would also change, shaped for `ConfirmDialog`'s `consequences` prop.
 * Fetches when `id` becomes non-null (open the dialog by setting the id); `null` stays idle.
 */
export function useDeleteImpact(
  entityType: DeleteImpactEntityType,
  id: string | number | null,
): ConfirmDialogConsequences {
  const { t } = useTranslation('common');
  const [state, setState] = useState<ImpactState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (id === null) return;
    let cancelled = false;
    /* eslint-disable @eslint-react/set-state-in-effect -- (re)loading state when the target changes */
    setState({ status: 'loading' });
    /* eslint-enable @eslint-react/set-state-in-effect */
    fetchDeleteImpact(entityType, id)
      .then((response) => {
        if (!cancelled) setState({ status: 'ready', effects: response.effects });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, id, attempt]);

  const onRetry = useCallback(() => setAttempt((n) => n + 1), []);

  return useMemo<ConfirmDialogConsequences>(() => {
    if (state.status === 'loading') return { status: 'loading' };
    if (state.status === 'error') return { status: 'error', onRetry };
    return {
      status: 'ready',
      items: state.effects.map((effect) => ({
        label: t(I18N_UNION_KEYS.deleteImpactKind.key(effect.kind)),
        count: effect.count,
      })),
    };
  }, [state, onRetry, t]);
}
