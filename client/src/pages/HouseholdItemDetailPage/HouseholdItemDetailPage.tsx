import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { HouseholdItemPageDetail, HouseholdItemStatus } from '@cornerstone/shared';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { useCreateContext } from '../../components/CreateMenu/CreateMenuContext.js';
import { useDocumentsPanel } from '../../components/DocumentsPanel/index.js';
import { ObjectDiaryPanel } from '../../components/FeedRow/ObjectDiaryPanel.js';
import { KeyboardShortcutsHelp } from '../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js';
import { ObjectHeader, useLogPrimary } from '../../components/ObjectHeader/index.js';
import type { ObjectHeaderPrimary } from '../../components/ObjectHeader/index.js';
import { ObjectTabs } from '../../components/ObjectTabs/ObjectTabs.js';
import { useObjectTabs } from '../../components/ObjectTabs/useObjectTabs.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import type { SectionCardController } from '../../components/SectionCard/index.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { StatusMenu } from '../../components/StatusMenu/StatusMenu.js';
import { purchaseTransitions } from '../../components/StatusMenu/statusVocabularies.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { SummaryStrip } from '../../components/SummaryStrip/SummaryStrip.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { useObjectDiary } from '../../hooks/useObjectDiary.js';
import { useObjectRecord } from '../../hooks/useObjectRecord.js';
import type { UseObjectRecordResult } from '../../hooks/useObjectRecord.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUndoableStatusChange } from '../../hooks/useUndoableStatusChange.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { fetchFailureMessage } from '../../lib/fetchFailure.js';
import { focusPageHeadingWhenReady } from '../../lib/focusPageHeading.js';
import { useFormatters } from '../../lib/formatters.js';
import { deleteHouseholdItem, getHouseholdItem } from '../../lib/householdItemsApi.js';
import { useOnObjectCreated } from '../../lib/objectCreatedEvents.js';
import { changeHouseholdItemStatus, householdItemStatusBody } from '../../lib/statusChangeApi.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import type { OriginState } from '../../navigation/origin.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import sharedStyles from '../../styles/shared.module.css';
import { PurchaseCostPanel } from './PurchaseCostPanel.js';
import { PurchaseOverviewPanel } from './PurchaseOverviewPanel.js';
import { PurchaseTimingPanel } from './PurchaseTimingPanel.js';
import { purchaseDiaryWindow } from './purchaseDates.js';
import type { PurchasePanelProps } from './purchasePageTypes.js';
import { usePurchaseSummaryFacts } from './usePurchaseSummaryFacts.js';
import styles from './HouseholdItemDetailPage.module.css';

/** Reads the route id once; the view below always has a purchase id. */
export function HouseholdItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to={routeUrl('householdItems')} replace />;
  return <PurchaseView key={id} id={id} />;
}

function PurchaseView({ id }: { id: string }) {
  const { t } = useTranslation('householdItems');
  const { t: tc } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const navigate = useNavigate();
  const state = useObjectRecord(id, getHouseholdItem);
  const { record, isLoading, failure, notFound } = state;

  const failed = !isLoading && (failure !== null || record === null);
  const displayName = record?.name.trim() || tc('navigation.untitledPurchase');
  let h1Text = displayName;
  if (isLoading || failed) h1Text = tc('navigation.purchase');
  if (!isLoading && notFound) h1Text = tc('navigation.purchaseNotFound');
  useDocumentTitle(h1Text);
  const originState = useOriginState(record && !isLoading ? displayName : null);

  if (isLoading) {
    return (
      <PageLayout title={h1Text} breadcrumbs={<PageBreadcrumbs />}>
        <Skeleton lines={4} loadingLabel={t('purchasePage.loading')} />
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
              onClick={() => navigate(routeUrl('householdItems'))}
            >
              {tc('navigation.backTo', { origin: tc('navigation.purchases') })}
            </button>
            {notFound ? null : (
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={() => void state.reload()}
              >
                {t('purchasePage.retry')}
              </button>
            )}
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PurchaseLoaded
      id={id}
      purchase={record}
      state={state}
      h1Text={h1Text}
      displayName={displayName}
      originState={originState}
    />
  );
}

interface PurchaseLoadedProps {
  readonly id: string;
  readonly purchase: HouseholdItemPageDetail;
  readonly state: UseObjectRecordResult<HouseholdItemPageDetail>;
  readonly h1Text: string;
  readonly displayName: string;
  readonly originState: OriginState;
}

function PurchaseLoaded({
  id,
  purchase,
  state,
  h1Text,
  displayName,
  originState,
}: PurchaseLoadedProps) {
  const { t } = useTranslation('householdItems');
  const { t: tc } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const statusVariants = useStatusBadgeVariants();
  const { run: runStatusChange } = useUndoableStatusChange();
  const logPrimary = useLogPrimary('purchase-primary-log');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const detailsCardRef = useRef<SectionCardController>(null);
  const { refresh, revision } = state;

  // `?edit=` (the old edit URLs) is read once: it opens the Details card in edit mode.
  const [editIntent] = useState(() => searchParams.has('edit'));
  const pendingEditRef = useRef(editIntent);
  const intentHandledRef = useRef(false);

  // New › Invoice / Log start from this purchase's area and company.
  useCreateContext({ areaId: purchase.area?.id, companyId: purchase.vendor?.id });
  useOnObjectCreated('invoice', () => void refresh());

  const documents = useDocumentsPanel('household_item', id);
  const diaryWindow = purchaseDiaryWindow(purchase);
  const diary = useObjectDiary(
    {
      subjectKey: purchase.id,
      vendorId: purchase.vendor?.id ?? null,
      areaId: purchase.area?.id ?? null,
      dates: diaryWindow,
    },
    revision,
  );
  const tabs = useObjectTabs(['overview', 'timing', 'cost', 'diary', 'history']);

  // The one replace: no `edit`, no `tab`; the origin state survives.
  useEffect(() => {
    if (intentHandledRef.current) return;
    intentHandledRef.current = true;
    if (!editIntent) return;
    const next = new URLSearchParams(searchParams);
    next.delete('edit');
    next.delete('tab');
    const search = next.toString();
    void navigate(
      { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash },
      { replace: true, state: location.state },
    );
  }, [editIntent, searchParams, location.pathname, location.hash, location.state, navigate]);

  const [showDelete, setShowDelete] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const deleteConsequences = useDeleteImpact('household_item', showDelete ? id : null);

  // Opening the card from another tab: select Overview first; its card exists once it is active.
  useEffect(() => {
    if (pendingEditRef.current && tabs.active === 'overview') {
      pendingEditRef.current = false;
      detailsCardRef.current!.startEdit();
    }
  });

  const openDetailsEdit = useCallback(() => {
    if (tabs.active === 'overview') {
      detailsCardRef.current!.startEdit();
      return;
    }
    pendingEditRef.current = true;
    tabs.select('overview');
  }, [tabs]);

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
      await deleteHouseholdItem(id);
      showToast('success', t('purchasePage.deleted'));
      // Replace: Back must not land on a deleted purchase.
      navigate(routeUrl('householdItems'), { replace: true });
      focusPageHeadingWhenReady();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteBlocked(err.statusCode === 409);
        setDeleteError(translateApiError(err.error.code, tErrors));
      } else {
        setDeleteError(t('purchasePage.deleteError'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const shortcuts = useMemo(
    () => [
      { key: 'e', handler: openDetailsEdit, description: t('purchasePage.shortcuts.edit') },
      { key: 'Delete', handler: openDelete, description: t('purchasePage.shortcuts.delete') },
      // Same action; the empty description keeps it out of the help overlay.
      { key: 'Backspace', handler: openDelete, description: '' },
      {
        key: '?',
        handler: () => setShowShortcuts(true),
        description: t('purchasePage.shortcuts.help'),
      },
    ],
    [t, openDetailsEdit, openDelete],
  );
  useKeyboardShortcuts(shortcuts);

  const transitions = purchaseTransitions(tc, purchase);
  const statusMenuProps = {
    transitions,
    badge: { variants: statusVariants.purchase, value: purchase.status },
    currentLabel: statusVariants.purchase[purchase.status].label,
    focusFallbackRef: headingRef,
    onApply: (to: HouseholdItemStatus, date: string | null) =>
      runStatusChange({
        request: () => changeHouseholdItemStatus(id, householdItemStatusBody(to, date)),
        recordName: displayName,
        statusLabel: statusVariants.purchase[to].label,
        dedupeKey: `purchase:${id}`,
        onChanged: () => void refresh(),
        onUndone: refresh,
      }),
  };

  // Mark ordered, then Mark delivered (not "Mark delivery scheduled"); Log once delivered.
  let primary: ObjectHeaderPrimary<HouseholdItemStatus> = logPrimary;
  if (purchase.status !== 'arrived') {
    const planned = purchase.status === 'planned';
    primary = {
      kind: 'status',
      status: {
        ...statusMenuProps,
        actionTo: planned ? 'purchased' : 'arrived',
        testId: planned ? 'purchase-primary-ordered' : 'purchase-primary-delivered',
      },
    };
  }

  const facts = usePurchaseSummaryFacts({
    purchase,
    tabs,
    originState,
    documentsFact: documents.fact,
    onOpenDetails: openDetailsEdit,
  });

  const panelProps: PurchasePanelProps = { purchase, revision, refresh, originState, headingRef };

  const header = (
    <ObjectHeader
      title={h1Text}
      titleIsUserText={purchase.name.trim() !== ''}
      breadcrumbs={<PageBreadcrumbs />}
      headingRef={headingRef}
      testId="purchase-header"
      status={<StatusMenu {...statusMenuProps} testId="purchase-status" />}
      primary={primary}
      menu={{ onDelete: openDelete }}
    />
  );

  return (
    <PageLayout header={header}>
      <SummaryStrip
        columns={5}
        typeLabel={t('purchasePage.typeLabel')}
        facts={facts}
        testId="purchase-summary"
      />
      <ObjectTabs
        controller={tabs}
        typeLabel={t('purchasePage.typeLabel')}
        idPrefix="purchase-tabs"
        counts={{ cost: purchase.budgets.length, diary: diary.count }}
        panels={{
          overview: () => <PurchaseOverviewPanel {...panelProps} detailsCardRef={detailsCardRef} />,
          timing: () => <PurchaseTimingPanel {...panelProps} />,
          cost: () => <PurchaseCostPanel {...panelProps} />,
          diary: () => (
            <ObjectDiaryPanel
              diary={diary}
              companyId={purchase.vendor?.id ?? null}
              areaId={purchase.area?.id ?? null}
              dates={diaryWindow}
              originState={originState}
              testIdPrefix="purchase-diary"
              labels={{
                title: t('purchasePage.diary.title'),
                log: t('purchasePage.diary.log'),
                forCompany: t('purchasePage.diary.forCompany', {
                  company: purchase.vendor?.name ?? '',
                }),
                forSubject: t('purchasePage.diary.forPurchase'),
                otherEntries: t('purchasePage.diary.otherEntries'),
                fromPhotoTags: t('purchasePage.diary.fromPhotoTags'),
                empty: t('purchasePage.diary.empty'),
                loadError: t('purchasePage.diary.loadError'),
                showAll: t('purchasePage.diary.showAll'),
                retry: t('purchasePage.retry'),
                loading: t('purchasePage.loading'),
                srCount: (count) => t('purchasePage.diary.srCount', { count }),
              }}
            />
          ),
          history: () => <PurchaseHistory purchase={purchase} />,
        }}
      />
      {documents.panel}
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
          testIdPrefix="purchase-delete"
        />
      )}
      {showShortcuts && (
        <KeyboardShortcutsHelp shortcuts={shortcuts} onClose={() => setShowShortcuts(false)} />
      )}
    </PageLayout>
  );
}

/** The History tab: who created the purchase and when it last changed (no history events yet). */
function PurchaseHistory({ purchase }: { readonly purchase: HouseholdItemPageDetail }) {
  const { t } = useTranslation('householdItems');
  const { formatDate } = useFormatters();
  const createdDate = formatDate(purchase.createdAt.slice(0, 10));
  const created = purchase.createdBy
    ? t('purchasePage.history.created', { name: purchase.createdBy.displayName, date: createdDate })
    : t('purchasePage.history.createdUnknown', { date: createdDate });

  return (
    <div className={styles.panel}>
      <h2 className={styles.historyTitle}>{t('purchasePage.history.title')}</h2>
      <p className={styles.historyLine} data-testid="purchase-history-created">
        {created}
        {' · '}
        {t('purchasePage.history.updated', { date: formatDate(purchase.updatedAt.slice(0, 10)) })}
      </p>
    </div>
  );
}

export default HouseholdItemDetailPage;
