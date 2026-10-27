import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { GrantCoveredItem } from '@cornerstone/shared';
import { AreaBreadcrumb } from '../../components/AreaBreadcrumb/AreaBreadcrumb.js';
import { itemValue } from '../../components/EntityPicker/entityPickerKinds.js';
import { EntityMultiPicker } from '../../components/EntityPicker/EntityMultiPicker.js';
import type { EntityOption } from '../../components/EntityPicker/types.js';
import { FormError } from '../../components/FormError/FormError.js';
import { RelatedList } from '../../components/RelatedList/RelatedList.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { fetchFailureMessage, toFetchFailure } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';
import { fetchGrantItems, linkGrantItems } from '../../lib/financingApi.js';
import { useFormatters } from '../../lib/formatters.js';
import { unlinkHouseholdItemSubsidy } from '../../lib/householdItemSubsidiesApi.js';
import { unlinkWorkItemSubsidy } from '../../lib/workItemsApi.js';
import type { OriginState } from '../../navigation/origin.js';
import styles from './GrantPage.module.css';

const rowId = (item: Pick<GrantCoveredItem, 'type' | 'id'>) => itemValue(item);

export interface GrantWorkPanelProps {
  readonly grantId: string;
  /** What Expected counts while nothing is linked (the empty sentence names it). */
  readonly expectedAmount: number;
  /** After the covered items changed: the page refreshes the grant's figures. */
  readonly onChanged: () => void;
  readonly originState: OriginState;
}

interface LinkPickerProps {
  readonly linkedValues: readonly string[];
  readonly busy: boolean;
  readonly error: string | null;
  readonly onSubmit: (picked: readonly EntityOption[]) => void;
  readonly onCancel: () => void;
}

/** The body of the "Link tasks / purchases" picker: chosen chips, then Link and Cancel. */
function LinkPicker({ linkedValues, busy, error, onSubmit, onCancel }: LinkPickerProps) {
  const { t } = useTranslation('budget');
  const { t: tc } = useTranslation('common');
  const [picked, setPicked] = useState<readonly EntityOption[]>([]);
  const none = picked.length === 0;

  return (
    <div className={styles.linkPicker}>
      <EntityMultiPicker
        value={picked}
        onChange={setPicked}
        picker={{ kind: 'taskOrPurchase', autoFocus: true, disabled: busy }}
        excludeIds={linkedValues}
        removeLabel={(option) => t('financing.work.removeChip', { name: option.label })}
        countLabel={(count) => t('financing.work.selected', { count })}
        testId="grant-link-picker"
      />
      <FormError message={error} />
      <div className={styles.linkFooter}>
        <button
          type="button"
          className={styles.linkButton}
          aria-disabled={none || busy ? 'true' : undefined}
          onClick={() => {
            if (!none && !busy) onSubmit(picked);
          }}
          data-testid="grant-link-submit"
        >
          {t('financing.work.linkCount', { count: picked.length })}
        </button>
        <button type="button" className={styles.linkCancel} onClick={onCancel}>
          {tc('button.cancel')}
        </button>
      </div>
    </div>
  );
}

/**
 * The Work tab of a grant: the tasks and purchases it covers, each with the share it pays. A
 * covered amount is computed, not stored, so rows have no Edit; Remove unlinks with Undo.
 */
export function GrantWorkPanel({
  grantId,
  expectedAmount,
  onChanged,
  originState,
}: GrantWorkPanelProps) {
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const { formatCurrency } = useFormatters();
  const { showToast } = useToast();
  const [items, setItems] = useState<readonly GrantCoveredItem[] | null>(null);
  const [loadFailure, setLoadFailure] = useState<FetchFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [linking, setLinking] = useState(false);
  const [linkFailure, setLinkFailure] = useState<FetchFailure | null>(null);

  const messageOf = (failure: FetchFailure | null) =>
    failure === null
      ? null
      : fetchFailureMessage(failure, tErrors, t('financing.grantPage.loadError'));

  useEffect(() => {
    let cancelled = false;
    fetchGrantItems(grantId)
      .then((response) => {
        if (cancelled) return;
        setItems(response.items);
        setLoadFailure(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadFailure(toFetchFailure(err));
      });
    return () => {
      cancelled = true;
    };
  }, [grantId, attempt]);

  const reload = useCallback(async () => {
    const response = await fetchGrantItems(grantId);
    setItems(response.items);
  }, [grantId]);

  const rows = useMemo(
    () =>
      items?.map((item) => ({
        id: rowId(item),
        title: item.title,
        to:
          item.type === 'work_item'
            ? routeUrl('workItem', { id: item.id })
            : routeUrl('householdItem', { id: item.id }),
        facts: (
          <>
            {t(I18N_UNION_KEYS.grantItemType.key(item.type))}
            {item.area ? (
              <>
                {' · '}
                <AreaBreadcrumb
                  variant="path"
                  segments={[...item.area.ancestors, { id: item.area.id, name: item.area.name }]}
                />
              </>
            ) : null}
          </>
        ),
        amount: formatCurrency(item.covered),
      })) ?? null,
    [items, t, formatCurrency],
  );

  const handleRemove = async (row: { readonly id: string }) => {
    const item = items!.find((candidate) => rowId(candidate) === row.id)!;
    const response =
      item.type === 'work_item'
        ? await unlinkWorkItemSubsidy(item.id, grantId)
        : await unlinkHouseholdItemSubsidy(item.id, grantId);
    await reload();
    onChanged();
    return response.undo;
  };

  const handleLink = async (picked: readonly EntityOption[], close: () => void) => {
    setLinking(true);
    setLinkFailure(null);
    try {
      const response = await linkGrantItems(
        grantId,
        picked.map((option) => ({ type: option.itemType!, id: option.entityId! })),
      );
      setItems(response.items);
      onChanged();
      close();
      showToast('success', t('financing.work.linked', { count: picked.length }));
    } catch (err) {
      setLinkFailure(toFetchFailure(err));
    } finally {
      setLinking(false);
    }
  };

  return (
    <RelatedList
      title={t('financing.grant.covered')}
      rows={rows}
      loadError={messageOf(loadFailure)}
      onRetry={() => {
        setLoadFailure(null);
        setAttempt((value) => value + 1);
      }}
      emptyMessage={`${t('financing.work.empty')} ${t('financing.work.emptyDetail', {
        amount: formatCurrency(expectedAmount),
      })}`}
      action={{
        kind: 'picker',
        label: t('financing.work.link'),
        renderPicker: ({ close }) => (
          <LinkPicker
            linkedValues={(items ?? []).map(rowId)}
            busy={linking}
            error={messageOf(linkFailure)}
            onSubmit={(picked) => void handleLink(picked, close)}
            onCancel={() => {
              setLinkFailure(null);
              close();
            }}
          />
        ),
      }}
      onRemove={handleRemove}
      onRestored={async () => {
        await reload();
        onChanged();
      }}
      linkState={originState}
      testId="grant-covered-items"
    />
  );
}

export default GrantWorkPanel;
