import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { MilestoneCompletionState, MilestoneDetail } from '@cornerstone/shared';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { ObjectHistorySection } from '../../components/FeedRow/ObjectHistorySection.js';
import { KeyboardShortcutsHelp } from '../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js';
import { ObjectHeader } from '../../components/ObjectHeader/index.js';
import type { ObjectHeaderPrimary } from '../../components/ObjectHeader/index.js';
import { ObjectTabs } from '../../components/ObjectTabs/ObjectTabs.js';
import { useObjectTabs } from '../../components/ObjectTabs/useObjectTabs.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import type { SectionCardController } from '../../components/SectionCard/index.js';
import type { StartEditOptions } from '../../components/SectionCard/SectionCard.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { StatusMenu } from '../../components/StatusMenu/StatusMenu.js';
import { milestoneTransitions } from '../../components/StatusMenu/statusVocabularies.js';
import { SummaryStrip } from '../../components/SummaryStrip/SummaryStrip.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { useObjectRecord } from '../../hooks/useObjectRecord.js';
import type { UseObjectRecordResult } from '../../hooks/useObjectRecord.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUndoableStatusChange } from '../../hooks/useUndoableStatusChange.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { fetchFailureMessage } from '../../lib/fetchFailure.js';
import { focusPageHeadingWhenReady } from '../../lib/focusPageHeading.js';
import { useFormatters } from '../../lib/formatters.js';
import { milestoneBadgeProps, milestoneStatusLabel } from '../../lib/milestoneStatusLabel.js';
import { deleteMilestone, getMilestone } from '../../lib/milestonesApi.js';
import { changeMilestoneStatus, milestoneStatusBody } from '../../lib/statusChangeApi.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import type { OriginState } from '../../navigation/origin.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import sharedStyles from '../../styles/shared.module.css';
import { MilestoneOverviewPanel } from './MilestoneOverviewPanel.js';
import { MilestoneWorkPanel } from './MilestoneWorkPanel.js';
import type { MilestonePanelProps } from './milestonePageTypes.js';
import { useMilestoneSummaryFacts } from './useMilestoneSummaryFacts.js';
import styles from './MilestoneDetailPage.module.css';

/** A route id that is not a positive integer is a milestone that does not exist (404, not 400). */
function fetchMilestone(raw: string): Promise<MilestoneDetail> {
  return /^[1-9]\d*$/.test(raw)
    ? getMilestone(Number(raw))
    : Promise.reject(new ApiClientError(404, { code: 'NOT_FOUND', message: '' }));
}

/** Reads the route id once; the view below always has a milestone id. */
export function MilestoneDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to={routeUrl('milestones')} replace />;
  return <MilestoneView key={id} id={id} />;
}

function MilestoneView({ id }: { id: string }) {
  const { t } = useTranslation('schedule');
  const { t: tc } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const navigate = useNavigate();
  const state = useObjectRecord(id, fetchMilestone);
  const { record, isLoading, failure, notFound } = state;

  const failed = !isLoading && (failure !== null || record === null);
  const displayName = record?.title.trim() || tc('navigation.untitledMilestone');
  let h1Text = displayName;
  if (isLoading || failed) h1Text = tc('navigation.milestone');
  if (!isLoading && notFound) h1Text = t('milestones.detail.notFound');
  useDocumentTitle(h1Text);
  const originState = useOriginState(record && !isLoading ? displayName : null);

  if (isLoading) {
    return (
      <PageLayout title={h1Text} breadcrumbs={<PageBreadcrumbs />}>
        <Skeleton lines={4} loadingLabel={t('milestones.detail.loading')} />
      </PageLayout>
    );
  }

  if (failed || !record) {
    return (
      <PageLayout title={h1Text} breadcrumbs={<PageBreadcrumbs />}>
        <div className={styles.errorCard} role="alert">
          {notFound || failure === null ? null : (
            <p>{fetchFailureMessage(failure, tErrors, tc('requestErrors.unexpected'))}</p>
          )}
          <div className={styles.errorActions}>
            <button
              type="button"
              className={sharedStyles.btnSecondary}
              onClick={() => navigate(routeUrl('milestones'))}
            >
              {tc('navigation.backTo', { origin: tc('navigation.milestones') })}
            </button>
            {notFound ? null : (
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={() => void state.reload()}
              >
                {t('milestones.detail.retry')}
              </button>
            )}
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <MilestoneLoaded
      id={id}
      milestone={record}
      state={state}
      h1Text={h1Text}
      displayName={displayName}
      originState={originState}
    />
  );
}

interface MilestoneLoadedProps {
  readonly id: string;
  readonly milestone: MilestoneDetail;
  readonly state: UseObjectRecordResult<MilestoneDetail>;
  readonly h1Text: string;
  readonly displayName: string;
  readonly originState: OriginState;
}

function MilestoneLoaded({
  id,
  milestone,
  state,
  h1Text,
  displayName,
  originState,
}: MilestoneLoadedProps) {
  const { t } = useTranslation('schedule');
  const { t: tc } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const navigate = useNavigate();
  const { showToast } = useToast();
  const statusVariants = useStatusBadgeVariants();
  const { run: runStatusChange } = useUndoableStatusChange();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const detailsCardRef = useRef<SectionCardController>(null);
  const targetDateInputId = useId();
  const { refresh, revision } = state;
  const numId = milestone.id;
  const { isCompleted, targetDate, projectedDate } = milestone;

  const tabs = useObjectTabs(['overview', 'work', 'history']);

  const [showDelete, setShowDelete] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const [reopening, setReopening] = useState(false);
  const deleteConsequences = useDeleteImpact('milestone', showDelete ? numId : null);

  // Opening the card from another tab: select Overview first; its card exists once it is active.
  const pendingEditRef = useRef<StartEditOptions | null>(null);
  useEffect(() => {
    if (pendingEditRef.current && tabs.active === 'overview') {
      const options = pendingEditRef.current;
      pendingEditRef.current = null;
      detailsCardRef.current!.startEdit(options);
    }
  });

  const openEdit = useCallback(
    (options: StartEditOptions = {}) => {
      if (tabs.active === 'overview') {
        detailsCardRef.current!.startEdit(options);
        return;
      }
      pendingEditRef.current = options;
      tabs.select('overview');
    },
    [tabs],
  );
  const openDetailsEdit = useCallback(() => openEdit(), [openEdit]);
  const openChangeTarget = (opener: HTMLElement) =>
    openEdit({ focusId: targetDateInputId, returnFocus: opener });

  const openDelete = useCallback(() => {
    setDeleteError('');
    setDeleteBlocked(false);
    setShowDelete(true);
  }, []);
  const closeDelete = () => {
    setShowDelete(false);
    setDeleteError('');
    setDeleteBlocked(false);
  };
  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      await deleteMilestone(numId);
      showToast('success', t('milestones.detail.deleted'));
      // Replace: Back must not land on a deleted milestone.
      navigate(routeUrl('milestones'), { replace: true });
      focusPageHeadingWhenReady();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteBlocked(err.statusCode === 409);
        setDeleteError(translateApiError(err.error.code, tErrors));
      } else {
        setDeleteError(t('milestones.detail.deleteError'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const shortcuts = useMemo(
    () => [
      { key: 'e', handler: openDetailsEdit, description: t('milestones.detail.shortcuts.edit') },
      { key: 'Delete', handler: openDelete, description: t('milestones.detail.shortcuts.delete') },
      // Same action; the empty description keeps it out of the help overlay.
      { key: 'Backspace', handler: openDelete, description: '' },
      {
        key: '?',
        handler: () => setShowShortcuts(true),
        description: t('milestones.detail.shortcuts.help'),
      },
    ],
    [t, openDetailsEdit, openDelete],
  );
  useKeyboardShortcuts(shortcuts);

  const statusSource = { isCompleted, targetDate, projectedDate };
  const set = I18N_UNION_KEYS.statusVocabularyMilestone;
  const applyStatus = (to: MilestoneCompletionState, date: string | null) =>
    runStatusChange({
      request: () => changeMilestoneStatus(numId, milestoneStatusBody(to, date)),
      recordName: displayName,
      statusLabel: tc(set.key(to === 'reached' ? 'reached' : 'upcoming'), { ns: set.ns, days: 0 }),
      dedupeKey: `milestone:${id}`,
      onChanged: () => void refresh(),
      onUndone: refresh,
    });

  const statusMenuProps = {
    transitions: milestoneTransitions(tc, { isCompleted, targetDate }),
    badge: milestoneBadgeProps(statusVariants.milestone, tc, statusSource),
    currentLabel: milestoneStatusLabel(tc, statusSource),
    focusFallbackRef: headingRef,
    onApply: applyStatus,
  };

  const reopen = async () => {
    setReopening(true);
    try {
      await applyStatus('not_reached', null);
    } finally {
      setReopening(false);
    }
  };

  // Mark reached (date step with Undo); once reached the primary is Reopen.
  const primary: ObjectHeaderPrimary<MilestoneCompletionState> = isCompleted
    ? {
        kind: 'button',
        label: t('milestones.detail.primary.reopen'),
        busy: reopening,
        onClick: () => void reopen(),
        testId: 'milestone-primary-reopen',
      }
    : {
        kind: 'status',
        status: { ...statusMenuProps, actionTo: 'reached', testId: 'milestone-primary-reached' },
      };

  const facts = useMilestoneSummaryFacts({ milestone, tabs });

  const panelProps: MilestonePanelProps = {
    milestone,
    revision,
    refresh,
    originState,
    headingRef,
  };

  const header = (
    <ObjectHeader
      title={h1Text}
      titleIsUserText={milestone.title.trim() !== ''}
      breadcrumbs={<PageBreadcrumbs />}
      headingRef={headingRef}
      testId="milestone-header"
      status={<StatusMenu {...statusMenuProps} testId="milestone-status" />}
      primary={primary}
      secondary={
        isCompleted ? undefined : (
          <button
            type="button"
            className={sharedStyles.btnSecondary}
            data-testid="milestone-secondary-change-target"
            onClick={(event) => openChangeTarget(event.currentTarget)}
          >
            {t('milestones.detail.secondary.changeTarget')}
          </button>
        )
      }
      menu={{ onDelete: openDelete }}
    />
  );

  return (
    <PageLayout header={header}>
      <SummaryStrip
        typeLabel={tc('navigation.milestone')}
        facts={facts}
        testId="milestone-summary"
      />
      <ObjectTabs
        controller={tabs}
        typeLabel={tc('navigation.milestone')}
        idPrefix="milestone-tabs"
        panels={{
          overview: () => (
            <MilestoneOverviewPanel
              {...panelProps}
              detailsCardRef={detailsCardRef}
              targetDateInputId={targetDateInputId}
            />
          ),
          work: () => <MilestoneWorkPanel {...panelProps} />,
          history: () => <MilestoneHistory milestone={milestone} id={id} revision={revision} />,
        }}
      />
      {showDelete && (
        <ConfirmDialog
          title={tc('confirmDialog.deleteTitle', { name: displayName })}
          consequences={deleteConsequences}
          irreversible
          confirmLabel={tc('button.delete')}
          busyLabel={tc('confirmDialog.deleting')}
          busy={isDeleting}
          blocked={deleteBlocked}
          error={deleteError || null}
          onConfirm={() => void handleDelete()}
          onCancel={closeDelete}
          returnFocusRef={headingRef}
          testIdPrefix="milestone-delete"
        />
      )}
      {showShortcuts && (
        <KeyboardShortcutsHelp shortcuts={shortcuts} onClose={() => setShowShortcuts(false)} />
      )}
    </PageLayout>
  );
}

interface MilestoneHistoryProps {
  readonly milestone: MilestoneDetail;
  readonly id: string;
  readonly revision: number;
}

/** The History tab: who created the milestone and when it last changed, then its events. */
function MilestoneHistory({ milestone, id, revision }: MilestoneHistoryProps) {
  const { t } = useTranslation('schedule');
  const { formatDate } = useFormatters();
  const createdDate = formatDate(milestone.createdAt.slice(0, 10));
  const created = milestone.createdBy
    ? t('milestones.detail.history.created', {
        name: milestone.createdBy.displayName,
        date: createdDate,
      })
    : t('milestones.detail.history.createdUnknown', { date: createdDate });

  return (
    <div className={styles.panel}>
      <p className={styles.historyLine} data-testid="milestone-history-created">
        {created}
        {' · '}
        {t('milestones.detail.history.updated', {
          date: formatDate(milestone.updatedAt.slice(0, 10)),
        })}
      </p>
      <ObjectHistorySection
        entityType="milestone"
        entityId={id}
        revision={revision}
        testIdPrefix="milestone-history"
        labels={{
          title: t('milestones.detail.history.title'),
          empty: t('milestones.detail.history.empty'),
          loadError: t('milestones.detail.history.loadError'),
          retry: t('milestones.detail.retry'),
          showAll: t('milestones.detail.history.showAll'),
        }}
      />
    </div>
  );
}

export default MilestoneDetailPage;
