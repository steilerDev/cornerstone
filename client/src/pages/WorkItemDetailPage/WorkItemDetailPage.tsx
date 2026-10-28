import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { WorkItemPageDetail, WorkItemStatus } from '@cornerstone/shared';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { useCreateContext } from '../../components/CreateMenu/CreateMenuContext.js';
import { useDocumentsPanel } from '../../components/DocumentsPanel/index.js';
import { ObjectHistorySection } from '../../components/FeedRow/ObjectHistorySection.js';
import { KeyboardShortcutsHelp } from '../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js';
import {
  ObjectHeader,
  forwardActionTo,
  useLogPrimary,
} from '../../components/ObjectHeader/index.js';
import type { ObjectHeaderPrimary } from '../../components/ObjectHeader/index.js';
import { ObjectTabs } from '../../components/ObjectTabs/ObjectTabs.js';
import { useObjectTabs } from '../../components/ObjectTabs/useObjectTabs.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import type { SectionCardController } from '../../components/SectionCard/index.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { StatusMenu } from '../../components/StatusMenu/StatusMenu.js';
import { taskTransitions } from '../../components/StatusMenu/statusVocabularies.js';
import { SummaryStrip } from '../../components/SummaryStrip/SummaryStrip.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUndoableStatusChange } from '../../hooks/useUndoableStatusChange.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { fetchFailureMessage } from '../../lib/fetchFailure.js';
import { focusPageHeadingWhenReady } from '../../lib/focusPageHeading.js';
import { useFormatters } from '../../lib/formatters.js';
import { useOnObjectCreated } from '../../lib/objectCreatedEvents.js';
import { changeWorkItemStatus, workItemStatusBody } from '../../lib/statusChangeApi.js';
import { deleteWorkItem } from '../../lib/workItemsApi.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import type { OriginState } from '../../navigation/origin.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import sharedStyles from '../../styles/shared.module.css';
import { TaskCostPanel } from './TaskCostPanel.js';
import { TaskDiaryPanel } from './TaskDiaryPanel.js';
import { TaskOverviewPanel } from './TaskOverviewPanel.js';
import { TaskTimingPanel } from './TaskTimingPanel.js';
import { TASK_TIMING_INTENTS } from './taskAnchors.js';
import type { TaskTimingIntent } from './taskAnchors.js';
import type { TaskPanelProps } from './taskPageTypes.js';
import { useTaskDiary } from './useTaskDiary.js';
import { useTaskRecord } from './useTaskRecord.js';
import type { UseTaskRecordResult } from './useTaskRecord.js';
import { useTaskSummaryFacts } from './useTaskSummaryFacts.js';
import styles from './WorkItemDetailPage.module.css';

function isTimingIntent(value: string): value is TaskTimingIntent {
  return (TASK_TIMING_INTENTS as readonly string[]).includes(value);
}

/** Reads the route id once; the view below always has a task id. */
export default function WorkItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to={routeUrl('workItems')} replace />;
  return <TaskView id={id} />;
}

function TaskView({ id }: { id: string }) {
  const { t } = useTranslation('workItems');
  const { t: tc } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const navigate = useNavigate();
  const state = useTaskRecord(id);
  const { record, isLoading, failure, notFound } = state;

  const failed = !isLoading && (failure !== null || record === null);
  const displayTitle = record?.title.trim() || tc('navigation.untitledTask');
  let h1Text = displayTitle;
  if (isLoading || failed) h1Text = tc('navigation.task');
  if (!isLoading && notFound) h1Text = tc('navigation.taskNotFound');
  useDocumentTitle(h1Text);
  const originState = useOriginState(record && !isLoading ? displayTitle : null);

  if (isLoading) {
    return (
      <PageLayout title={h1Text} breadcrumbs={<PageBreadcrumbs />}>
        <Skeleton lines={4} loadingLabel={t('taskPage.loading')} />
      </PageLayout>
    );
  }

  if (failed || !record) {
    const back = (
      <button
        type="button"
        className={sharedStyles.btnSecondary}
        onClick={() => navigate(routeUrl('workItems'))}
      >
        {tc('navigation.backTo', { origin: tc('navigation.tasks') })}
      </button>
    );
    return (
      <PageLayout title={h1Text} breadcrumbs={<PageBreadcrumbs />}>
        <div className={styles.errorCard} role="alert">
          {notFound || failure === null ? null : (
            <p>{fetchFailureMessage(failure, tErrors, tc('requestErrors.unexpected'))}</p>
          )}
          <div className={styles.errorActions}>
            {back}
            {notFound ? null : (
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={() => void state.reload()}
              >
                {t('taskPage.retry')}
              </button>
            )}
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <TaskLoaded
      id={id}
      task={record}
      state={state}
      h1Text={h1Text}
      displayTitle={displayTitle}
      originState={originState}
    />
  );
}

interface TaskLoadedProps {
  readonly id: string;
  readonly task: WorkItemPageDetail;
  readonly state: UseTaskRecordResult;
  readonly h1Text: string;
  readonly displayTitle: string;
  readonly originState: OriginState;
}

type OverviewTarget = 'details' | 'whoWhere';

function TaskLoaded({ id, task, state, h1Text, displayTitle, originState }: TaskLoadedProps) {
  const { t } = useTranslation('workItems');
  const { t: tc } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const statusVariants = useStatusBadgeVariants();
  const { run: runStatusChange } = useUndoableStatusChange();
  const logPrimary = useLogPrimary('task-primary-log');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const detailsCardRef = useRef<SectionCardController>(null);
  const whoWhereCardRef = useRef<SectionCardController>(null);
  const pendingEditRef = useRef<OverviewTarget | null>(null);
  const intentHandledRef = useRef(false);
  const { refresh, revision } = state;

  // Deep links (`#reschedule`, `#constraints`, `?depError=`) are read once into state.
  const [intent, setIntent] = useState<TaskTimingIntent | null>(() => {
    const hash = location.hash.slice(1);
    return isTimingIntent(hash) ? hash : null;
  });
  const [depError, setDepError] = useState<string | null>(() => searchParams.get('depError'));

  // New › Invoice / Purchase / Log start from this task's area and company.
  useCreateContext({ areaId: task.area?.id, companyId: task.assignedVendor?.id });
  useOnObjectCreated('invoice', () => void refresh());

  const documents = useDocumentsPanel('work_item', id);
  const diary = useTaskDiary(task, revision);
  const tabs = useObjectTabs(['overview', 'timing', 'cost', 'diary', 'history']);

  // The one replace: Timing tab, no `depError`, no hash; origin state survives.
  useEffect(() => {
    if (intentHandledRef.current) return;
    intentHandledRef.current = true;
    if (intent === null && depError === null) return;
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'timing');
    next.delete('depError');
    void navigate(
      { pathname: location.pathname, search: `?${next.toString()}`, hash: '' },
      { replace: true, state: location.state },
    );
  }, [intent, depError, searchParams, location.pathname, location.state, navigate]);

  const [showDelete, setShowDelete] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const deleteConsequences = useDeleteImpact('work_item', showDelete ? id : null);

  const cardFor = (target: OverviewTarget): RefObject<SectionCardController | null> =>
    target === 'details' ? detailsCardRef : whoWhereCardRef;

  // Opening a card from another tab: select Overview first; its card exists once it is active.
  useEffect(() => {
    const target = pendingEditRef.current;
    if (target && tabs.active === 'overview') {
      pendingEditRef.current = null;
      cardFor(target).current?.startEdit();
    }
  });

  const openOverviewEdit = useCallback(
    (target: OverviewTarget) => {
      if (tabs.active === 'overview') {
        (target === 'details' ? detailsCardRef : whoWhereCardRef).current?.startEdit();
        return;
      }
      pendingEditRef.current = target;
      tabs.select('overview');
    },
    [tabs],
  );
  const openWhoWhere = useCallback(() => openOverviewEdit('whoWhere'), [openOverviewEdit]);

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
      await deleteWorkItem(id);
      // Replace: Back must not land on a deleted task.
      navigate(routeUrl('workItems'), { replace: true });
      focusPageHeadingWhenReady();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteBlocked(err.statusCode === 409);
        setDeleteError(translateApiError(err.error.code, tErrors));
      } else {
        setDeleteError(t('taskPage.deleteError'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const shortcuts = useMemo(
    () => [
      {
        key: 'e',
        handler: () => openOverviewEdit('details'),
        description: t('taskPage.shortcuts.edit'),
      },
      { key: 'Delete', handler: openDelete, description: t('taskPage.shortcuts.delete') },
      // Same action; the empty description keeps it out of the help overlay.
      { key: 'Backspace', handler: openDelete, description: '' },
      {
        key: '?',
        handler: () => setShowShortcuts(true),
        description: t('taskPage.shortcuts.help'),
      },
    ],
    [t, openOverviewEdit, openDelete],
  );
  useKeyboardShortcuts(shortcuts);

  const transitions = taskTransitions(tc, task);
  const statusMenuProps = {
    transitions,
    badge: { variants: statusVariants.task, value: task.status },
    currentLabel: statusVariants.task[task.status].label,
    focusFallbackRef: headingRef,
    onApply: (to: WorkItemStatus, date: string | null) =>
      runStatusChange({
        request: () => changeWorkItemStatus(id, workItemStatusBody(to, date)),
        recordName: displayTitle,
        statusLabel: statusVariants.task[to].label,
        dedupeKey: `task:${id}`,
        onChanged: () => void refresh(),
        onUndone: refresh,
      }),
  };

  const actionTo = forwardActionTo(transitions);
  const primary: ObjectHeaderPrimary<WorkItemStatus> =
    actionTo === null
      ? logPrimary
      : {
          kind: 'status',
          status: {
            ...statusMenuProps,
            actionTo,
            testId: actionTo === 'completed' ? 'task-primary-done' : 'task-primary-start',
          },
        };

  const facts = useTaskSummaryFacts({
    task,
    tabs,
    originState,
    documentsFact: documents.fact,
    onOpenWhoWhere: openWhoWhere,
  });

  const panelProps: TaskPanelProps = { task, revision, refresh, originState, headingRef };

  const header = (
    <ObjectHeader
      title={h1Text}
      titleIsUserText={task.title.trim() !== ''}
      breadcrumbs={<PageBreadcrumbs />}
      headingRef={headingRef}
      testId="task-header"
      status={<StatusMenu {...statusMenuProps} testId="work-item-status" />}
      primary={primary}
      menu={{ onDelete: openDelete }}
    />
  );

  return (
    <PageLayout header={header}>
      <SummaryStrip typeLabel={t('taskPage.typeLabel')} facts={facts} testId="task-summary" />
      <TaskTabs
        id={id}
        panelProps={panelProps}
        tabs={tabs}
        diary={diary}
        detailsCardRef={detailsCardRef}
        whoWhereCardRef={whoWhereCardRef}
        intent={intent}
        onIntentConsumed={() => setIntent(null)}
        depError={depError}
        onDepErrorDismiss={() => setDepError(null)}
      />
      {documents.panel}
      {showDelete && (
        <ConfirmDialog
          title={tc('confirmDialog.deleteTitle', { name: displayTitle })}
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
          testIdPrefix="work-item-delete"
        />
      )}
      {showShortcuts && (
        <KeyboardShortcutsHelp shortcuts={shortcuts} onClose={() => setShowShortcuts(false)} />
      )}
    </PageLayout>
  );
}

interface TaskTabsProps {
  readonly id: string;
  readonly panelProps: TaskPanelProps;
  readonly tabs: ReturnType<typeof useObjectTabs>;
  readonly diary: ReturnType<typeof useTaskDiary>;
  readonly detailsCardRef: RefObject<SectionCardController | null>;
  readonly whoWhereCardRef: RefObject<SectionCardController | null>;
  readonly intent: TaskTimingIntent | null;
  readonly onIntentConsumed: () => void;
  readonly depError: string | null;
  readonly onDepErrorDismiss: () => void;
}

/** The tab strip and its panels; each panel mounts on its first visit. */
function TaskTabs({
  id,
  panelProps,
  tabs,
  diary,
  detailsCardRef,
  whoWhereCardRef,
  intent,
  onIntentConsumed,
  depError,
  onDepErrorDismiss,
}: TaskTabsProps) {
  const { t } = useTranslation('workItems');
  const { formatDate } = useFormatters();
  const { task, revision, originState } = panelProps;

  const created = task.createdBy
    ? t('taskPage.history.created', {
        name: task.createdBy.displayName,
        date: formatDate(task.createdAt.slice(0, 10)),
      })
    : t('taskPage.history.createdUnknown', { date: formatDate(task.createdAt.slice(0, 10)) });

  return (
    <ObjectTabs
      controller={tabs}
      typeLabel={t('taskPage.typeLabel')}
      idPrefix="task-tabs"
      counts={{ cost: task.budgets.length, diary: diary.count }}
      panels={{
        overview: () => (
          <TaskOverviewPanel
            {...panelProps}
            detailsCardRef={detailsCardRef}
            whoWhereCardRef={whoWhereCardRef}
          />
        ),
        timing: () => (
          <TaskTimingPanel
            {...panelProps}
            intent={intent}
            onIntentConsumed={onIntentConsumed}
            depError={depError}
            onDepErrorDismiss={onDepErrorDismiss}
          />
        ),
        cost: () => <TaskCostPanel {...panelProps} />,
        diary: () => <TaskDiaryPanel task={task} diary={diary} originState={originState} />,
        history: () => (
          <div className={styles.panel}>
            <p className={styles.historyLine} data-testid="task-history-created">
              {created}
              {' · '}
              {t('taskPage.history.updated', {
                date: formatDate(task.updatedAt.slice(0, 10)),
              })}
            </p>
            <ObjectHistorySection
              entityType="work_item"
              entityId={id}
              revision={revision}
              testIdPrefix="task-history"
              labels={{
                title: t('taskPage.history.title'),
                empty: t('taskPage.history.empty'),
                loadError: t('taskPage.history.loadError'),
                retry: t('taskPage.retry'),
                showAll: t('taskPage.history.showAll'),
              }}
            />
          </div>
        ),
      }}
    />
  );
}
