import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { HouseholdItemDepDetail } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import { EntityPicker } from '../../components/EntityPicker/EntityPicker.js';
import {
  parsePredecessorValue,
  predecessorValue,
} from '../../components/EntityPicker/entityPickerKinds.js';
import { FormError } from '../../components/FormError/FormError.js';
import { RelatedList } from '../../components/RelatedList/RelatedList.js';
import type { RelatedListRow } from '../../components/RelatedList/types.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { createHouseholdItemDep, deleteHouseholdItemDep } from '../../lib/householdItemDepsApi.js';
import { useFormatters } from '../../lib/formatters.js';
import { actionError } from '../../lib/actionError.js';
import type { PurchasePanelProps } from './purchasePageTypes.js';

type PurchaseWaitsForListProps = Pick<PurchasePanelProps, 'purchase' | 'refresh' | 'originState'>;

/**
 * The tasks and milestones a purchase waits for (decision D2). Add picks from one shared list of
 * tasks and milestones; Remove unlinks with Undo.
 */
export function PurchaseWaitsForList({
  purchase,
  refresh,
  originState,
}: PurchaseWaitsForListProps) {
  const { t } = useTranslation('householdItems');
  const { t: tErrors } = useTranslation('errors');
  const { formatDate } = useFormatters();
  const statusVariants = useStatusBadgeVariants();
  const [addError, setAddError] = useState<string | null>(null);

  const dependencies = purchase.dependencies;

  const rows = useMemo(
    () =>
      dependencies.map((dependency: HouseholdItemDepDetail): RelatedListRow => {
        const { predecessor, predecessorType, predecessorId } = dependency;
        const kind =
          predecessorType === 'work_item'
            ? t('purchasePage.timing.kindTask')
            : t('purchasePage.timing.kindMilestone');
        return {
          id: predecessorValue({ type: predecessorType, id: predecessorId }),
          title: predecessor.title,
          to:
            predecessorType === 'work_item'
              ? routeUrl('workItem', { id: predecessorId })
              : routeUrl('milestone', { id: predecessorId }),
          badges:
            predecessor.status === null ? undefined : (
              <Badge variants={statusVariants.task} value={predecessor.status} />
            ),
          facts:
            predecessor.endDate === null
              ? kind
              : t('purchasePage.timing.rowFacts', {
                  kind,
                  date: formatDate(predecessor.endDate),
                }),
        };
      }),
    [dependencies, statusVariants, t, formatDate],
  );

  const add = async (value: string, close: () => void) => {
    // The picker only emits values `predecessorValue` built.
    const target = parsePredecessorValue(value)!;
    setAddError(null);
    try {
      await createHouseholdItemDep(purchase.id, {
        predecessorType: target.type,
        predecessorId: target.id,
      });
      await refresh();
      close();
    } catch (err) {
      setAddError(actionError(err, tErrors, t('purchasePage.timing.addError')));
    }
  };

  return (
    <RelatedList
      title={t('purchasePage.timing.waitsFor')}
      headingLevel={2}
      rows={rows}
      emptyMessage={t('purchasePage.timing.waitsForEmpty')}
      action={{
        kind: 'picker',
        label: t('purchasePage.timing.add'),
        renderPicker: ({ close }) => (
          <div>
            <EntityPicker
              kind="taskOrMilestone"
              value=""
              clearOnSelect
              autoFocus
              excludeIds={rows.map((row) => row.id)}
              onChange={(value) => void add(value, close)}
            />
            <FormError message={addError} />
          </div>
        ),
      }}
      onRemove={async (row) => {
        const target = parsePredecessorValue(row.id)!;
        const response = await deleteHouseholdItemDep(purchase.id, target.type, target.id);
        await refresh();
        return response.undo;
      }}
      onRestored={refresh}
      linkState={originState}
      testId="purchase-waits-for"
    />
  );
}

export default PurchaseWaitsForList;
