import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MilestoneSummary } from '@cornerstone/shared';
import { EntityPicker } from '../../components/EntityPicker/EntityPicker.js';
import { FormError } from '../../components/FormError/FormError.js';
import {
  DateRangeFilter,
  NumberRangeFilter,
} from '../../components/ObjectList/ObjectListRangeFilters.js';
import type {
  ObjectListFilterDef,
  ObjectListFilterRenderContext,
} from '../../components/ObjectList/types.js';
import { useAreas } from '../../hooks/useAreas.js';
import { fetchFailureMessage, toFetchFailure } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';
import { listMilestones } from '../../lib/milestonesApi.js';
import { listUsers } from '../../lib/usersApi.js';
import shared from '../../styles/shared.module.css';
import { NONE_KEY } from './tasksListUrl.js';
import styles from './TaskListFilters.module.css';

const WHO_ID = 'who';

interface FilterOptions {
  readonly members: readonly { readonly id: string; readonly displayName: string }[];
  readonly milestones: readonly MilestoneSummary[];
  readonly membersFailure: FetchFailure | null;
  readonly milestonesFailure: FetchFailure | null;
}

const NO_OPTIONS: FilterOptions = {
  members: [],
  milestones: [],
  membersFailure: null,
  milestonesFailure: null,
};

/** Household members and milestones for the selects, loaded once; a failure is kept as data. */
function useFilterOptions(): FilterOptions {
  const [options, setOptions] = useState<FilterOptions>(NO_OPTIONS);
  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([listUsers(), listMilestones()]).then(([users, milestones]) => {
      if (cancelled) return;
      setOptions({
        members:
          users.status === 'fulfilled'
            ? users.value.users
                .filter((user) => !user.deactivatedAt)
                .map((user) => ({ id: user.id, displayName: user.displayName }))
            : [],
        milestones: milestones.status === 'fulfilled' ? milestones.value : [],
        membersFailure: users.status === 'rejected' ? toFetchFailure(users.reason) : null,
        milestonesFailure:
          milestones.status === 'rejected' ? toFetchFailure(milestones.reason) : null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return options;
}

interface SelectFieldProps {
  readonly ctx: ObjectListFilterRenderContext;
  readonly label: string;
  readonly emptyLabel: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly failure: FetchFailure | null;
  readonly testId: string;
}

/** A native select with an "any" option that clears the param, and its load failure below it. */
function SelectField({ ctx, label, emptyLabel, options, failure, testId }: SelectFieldProps) {
  const { t } = useTranslation('workItems');
  const { t: tErrors } = useTranslation('errors');
  return (
    <div className={styles.field}>
      <label htmlFor={ctx.id} className={styles.label}>
        {label}
      </label>
      <select
        id={ctx.id}
        className={`${shared.select} ${styles.select}`}
        value={ctx.value ?? ''}
        onChange={(e) => ctx.onChange(e.target.value === '' ? null : e.target.value)}
        data-testid={testId}
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {failure ? (
        <FormError
          variant="field"
          message={fetchFailureMessage(failure, tErrors, t('list.filters.optionsFailed'))}
        />
      ) : null}
    </div>
  );
}

/**
 * The filter defs of the Tasks Filters panel, in order: Area, Who (Company and Household
 * member, one fieldset), Milestone, Start date, End date and Cost lines. The URL params keep
 * the serialisations of the list this replaced.
 */
export function useTaskListFilters(): readonly ObjectListFilterDef[] {
  const { t } = useTranslation('workItems');
  const { areas, error: areasError } = useAreas();
  const { members, milestones, membersFailure, milestonesFailure } = useFilterOptions();

  return useMemo(() => {
    const dateLabels = { from: t('list.filters.from'), to: t('list.filters.to') };
    const fieldset = { id: WHO_ID, legend: t('list.filters.who') };
    return [
      {
        param: 'areaId',
        label: t('list.filters.area'),
        render: (ctx) => (
          <>
            <EntityPicker
              kind="area"
              id={ctx.id}
              areas={areas}
              // A legacy multi-value CSV shows its first id; a new pick replaces the whole value.
              value={(ctx.value ?? '').split(',')[0]!}
              onChange={(id) => ctx.onChange(id === '' ? null : id)}
              specialOptions={[{ id: NONE_KEY, label: t('list.group.noArea') }]}
              create="off"
              placeholder={t('list.filters.area')}
            />
            <FormError variant="field" message={areasError} />
          </>
        ),
      },
      {
        param: 'assignedVendorId',
        label: t('list.filters.company'),
        fieldset,
        render: (ctx) => (
          <div className={styles.field}>
            <label htmlFor={ctx.id} className={styles.label}>
              {t('list.filters.company')}
            </label>
            <EntityPicker
              kind="company"
              id={ctx.id}
              value={ctx.value ?? ''}
              onChange={(id) => ctx.onChange(id === '' ? null : id)}
              // A company id that no longer exists (old link or bookmark) is dropped from the URL.
              onUnknownCompany={() => ctx.onChange(null)}
              create="off"
              placeholder={t('list.filters.company')}
            />
          </div>
        ),
      },
      {
        param: 'assignedUserId',
        label: t('list.filters.member'),
        fieldset,
        render: (ctx) => (
          <SelectField
            ctx={ctx}
            label={t('list.filters.member')}
            emptyLabel={t('list.filters.anyone')}
            options={members.map((member) => ({ value: member.id, label: member.displayName }))}
            failure={membersFailure}
            testId="tasks-filter-member"
          />
        ),
      },
      {
        param: 'milestoneId',
        label: t('list.filters.milestone'),
        render: (ctx) => (
          <SelectField
            ctx={ctx}
            label={t('list.filters.milestone')}
            emptyLabel={t('list.filters.anyMilestone')}
            options={milestones.map((milestone) => ({
              value: String(milestone.id),
              label: milestone.title,
            }))}
            failure={milestonesFailure}
            testId="tasks-filter-milestone"
          />
        ),
      },
      {
        param: 'startDate',
        label: t('list.filters.startDate'),
        render: (ctx) => (
          <DateRangeFilter ctx={ctx} testId="tasks-filter-startDate" labels={dateLabels} />
        ),
      },
      {
        param: 'endDate',
        label: t('list.filters.endDate'),
        render: (ctx) => (
          <DateRangeFilter ctx={ctx} testId="tasks-filter-endDate" labels={dateLabels} />
        ),
      },
      {
        param: 'budgetLines',
        label: t('list.filters.costLines'),
        render: (ctx) => (
          <NumberRangeFilter
            ctx={ctx}
            testId="tasks-filter-budgetLines"
            labels={{ min: t('list.filters.min'), max: t('list.filters.max') }}
            step="1"
          />
        ),
      },
    ];
  }, [t, areas, areasError, members, milestones, membersFailure, milestonesFailure]);
}
