import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { SubsidyProgram, UndoableDeleteResponse } from '@cornerstone/shared';
import { Badge } from '../Badge/Badge.js';
import { EntityPicker } from '../EntityPicker/EntityPicker.js';
import { FormError } from '../FormError/FormError.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { fetchFailureMessage, toFetchFailure } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';
import { useFormatters } from '../../lib/formatters.js';
import type { OriginState } from '../../navigation/origin.js';
import { RelatedList } from './RelatedList.js';

export interface GrantLinksListLabels {
  readonly title: string;
  readonly empty: string;
  readonly add: string;
  readonly loadError: string;
  readonly linkError: string;
}

export interface GrantLinksListProps {
  /** Bumps when the page refreshed; the list loads again. */
  readonly revision: number;
  readonly load: () => Promise<readonly SubsidyProgram[]>;
  readonly link: (grantId: string) => Promise<unknown>;
  readonly unlink: (grantId: string) => Promise<UndoableDeleteResponse>;
  /** After a link, unlink or Undo: the page refresh. */
  readonly onChanged: () => Promise<void>;
  readonly labels: GrantLinksListLabels;
  readonly linkState: OriginState;
  readonly testId: string;
}

/**
 * The grants that cover an object (task, purchase). A grant link is a plain relation: Remove
 * unlinks with Undo.
 */
export function GrantLinksList({
  revision,
  load,
  link,
  unlink,
  onChanged,
  labels,
  linkState,
  testId,
}: GrantLinksListProps) {
  const { t: tBudget } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const { formatCurrency } = useFormatters();
  const statusVariants = useStatusBadgeVariants();
  const [grants, setGrants] = useState<readonly SubsidyProgram[] | null>(null);
  const [loadFailure, setLoadFailure] = useState<FetchFailure | null>(null);
  const [linkFailure, setLinkFailure] = useState<FetchFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  // `load` is a fresh closure per render; the list loads again on revision and retry only.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let cancelled = false;
    loadRef
      .current()
      .then((response) => {
        if (cancelled) return;
        setGrants(response);
        setLoadFailure(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadFailure(toFetchFailure(err));
      });
    return () => {
      cancelled = true;
    };
  }, [revision, attempt]);

  const reload = async () => {
    setGrants(await load());
  };

  const messageOf = (failure: FetchFailure | null, fallback: string) =>
    failure === null ? null : fetchFailureMessage(failure, tErrors, fallback);

  const rows = useMemo(
    () =>
      grants?.map((grant) => ({
        id: grant.id,
        title: grant.name,
        to: routeUrl('grant', { id: grant.id }),
        badges: <Badge variants={statusVariants.grant} value={grant.applicationStatus} />,
        facts:
          grant.reductionType === 'percentage'
            ? tBudget('subsidies.linkSection.reductionPercentage', { value: grant.reductionValue })
            : tBudget('subsidies.linkSection.reductionFixed', {
                amount: formatCurrency(grant.reductionValue),
              }),
      })) ?? null,
    [grants, statusVariants, tBudget, formatCurrency],
  );

  // Empty until the first load answers; the picker only opens after that.
  const linkedIds = grants === null ? [] : grants.map((grant) => grant.id);

  const linkGrant = async (grantId: string, close: () => void) => {
    setLinkFailure(null);
    try {
      await link(grantId);
      await reload();
      await onChanged();
      close();
    } catch (err) {
      setLinkFailure(toFetchFailure(err));
    }
  };

  return (
    <RelatedList
      title={labels.title}
      rows={rows}
      loadError={messageOf(loadFailure, labels.loadError)}
      onRetry={() => {
        setLoadFailure(null);
        setAttempt((value) => value + 1);
      }}
      emptyMessage={labels.empty}
      action={{
        kind: 'picker',
        label: labels.add,
        renderPicker: ({ close }) => (
          <div>
            <EntityPicker
              kind="grant"
              value=""
              clearOnSelect
              autoFocus
              excludeIds={linkedIds}
              onChange={(value) => void linkGrant(value, close)}
            />
            <FormError message={messageOf(linkFailure, labels.linkError)} />
          </div>
        ),
      }}
      onRemove={async (row) => {
        const response = await unlink(row.id);
        await reload();
        await onChanged();
        return response.undo;
      }}
      onRestored={async () => {
        await reload();
        await onChanged();
      }}
      linkState={linkState}
      testId={testId}
    />
  );
}

export default GrantLinksList;
