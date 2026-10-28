import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { VendorDetail } from '@cornerstone/shared';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { useCreateContext } from '../../components/CreateMenu/CreateMenuContext.js';
import { ObjectHistorySection } from '../../components/FeedRow/ObjectHistorySection.js';
import { ObjectHeader } from '../../components/ObjectHeader/index.js';
import type { ObjectHeaderPrimary } from '../../components/ObjectHeader/index.js';
import { ObjectTabs } from '../../components/ObjectTabs/ObjectTabs.js';
import type { ObjectTabId } from '../../components/ObjectTabs/objectTabIds.js';
import { useObjectTabs } from '../../components/ObjectTabs/useObjectTabs.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { SectionCardScope } from '../../components/SectionCard/index.js';
import type { SectionCardController } from '../../components/SectionCard/index.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { SummaryStrip } from '../../components/SummaryStrip/SummaryStrip.js';
import type { SummaryFact } from '../../components/SummaryStrip/SummaryStrip.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { focusPageHeadingWhenReady } from '../../lib/focusPageHeading.js';
import { useFormatters } from '../../lib/formatters.js';
import { useOnObjectCreated } from '../../lib/objectCreatedEvents.js';
import { deleteVendor } from '../../lib/vendorsApi.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import sharedStyles from '../../styles/shared.module.css';
import { CompanyContactPersons } from './CompanyContactPersons.js';
import { CompanyDetailCards } from './CompanyDetailCards.js';
import { CompanyDiaryPanel } from './CompanyDiaryPanel.js';
import { CompanyPaymentsPanel } from './CompanyPaymentsPanel.js';
import { CompanyWorkPanel } from './CompanyWorkPanel.js';
import { companyPrimary } from './companyHeaderActions.js';
import { useCompanyDiary } from './useCompanyDiary.js';
import { useCompanyPayments } from './useCompanyPayments.js';
import { useCompanyRecord } from './useCompanyRecord.js';
import type { UseCompanyRecordResult } from './useCompanyRecord.js';
import { useCompanyRelations } from './useCompanyRelations.js';
import styles from './VendorDetailPage.module.css';

/** Reads the route id once; the view below always has a company id. */
export function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to={routeUrl('companies')} replace />;
  return <CompanyView id={id} />;
}

function CompanyView({ id }: { id: string }) {
  const { t } = useTranslation('budget');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const state = useCompanyRecord(id);
  const { record, isLoading, error } = state;

  // New › Invoice / Offer / Purchase start from this company.
  useCreateContext({ companyId: record?.id });
  const h1Text = !isLoading && record ? record.name : t('companyPage.typeLabel');
  useDocumentTitle(h1Text);
  const originState = useOriginState(record ? record.name : null);

  if (isLoading) {
    return (
      <PageLayout title={h1Text} breadcrumbs={<PageBreadcrumbs />}>
        <Skeleton lines={4} loadingLabel={t('companyPage.loading')} />
      </PageLayout>
    );
  }

  if (error || !record) {
    return (
      <PageLayout title={h1Text} breadcrumbs={<PageBreadcrumbs />}>
        <div className={styles.errorCard} role="alert">
          <p>{error}</p>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={sharedStyles.btnSecondary}
              onClick={() => navigate(routeUrl('companies'))}
            >
              {tc('navigation.backTo', { origin: tc('navigation.companies') })}
            </button>
            <button
              type="button"
              className={sharedStyles.btnSecondary}
              onClick={() => void state.reload()}
            >
              {t('companyPage.retry')}
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <CompanyLoaded
      id={id}
      vendor={record}
      state={state}
      h1Text={h1Text}
      originState={originState}
    />
  );
}

interface CompanyLoadedProps {
  readonly id: string;
  readonly vendor: VendorDetail;
  readonly state: UseCompanyRecordResult;
  readonly h1Text: string;
  readonly originState: ReturnType<typeof useOriginState>;
}

function CompanyLoaded({ id, vendor, state, h1Text, originState }: CompanyLoadedProps) {
  const { t } = useTranslation('budget');
  const { t: tc } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { t: tSettings } = useTranslation('settings');
  const navigate = useNavigate();
  const { formatCurrency, formatDate } = useFormatters();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const phoneCardRef = useRef<SectionCardController>(null);
  const pendingPhoneEditRef = useRef(false);

  const tabs = useObjectTabs(['overview', 'work', 'payments', 'diary', 'history']);
  const diary = useCompanyDiary(id, state.revision);

  const [showDelete, setShowDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const deleteConsequences = useDeleteImpact('vendor', showDelete ? id : null);

  // An invoice or offer created from the dialog: the figures and both lists refresh.
  useOnObjectCreated('invoice', () => void state.refresh());
  useOnObjectCreated('offer', () => void state.refresh());

  // "Add phone number" selects Overview first; its card exists once the tab is active.
  useEffect(() => {
    if (pendingPhoneEditRef.current && tabs.active === 'overview') {
      pendingPhoneEditRef.current = false;
      phoneCardRef.current!.startEdit();
    }
  }, [tabs.active]);

  const openPhoneEdit = () => {
    if (tabs.active === 'overview') {
      phoneCardRef.current!.startEdit();
      return;
    }
    pendingPhoneEditRef.current = true;
    tabs.select('overview');
  };

  const chosen = companyPrimary(vendor);
  let primary: ObjectHeaderPrimary;
  if (chosen.kind === 'call') {
    primary = {
      kind: 'tel',
      phone: chosen.phone,
      label: tc('callButton.call'),
      ariaLabel: tc('callButton.aria', {
        name: chosen.personName ?? vendor.name,
        number: chosen.phone,
      }),
      testId: 'company-primary-call',
    };
  } else {
    primary = {
      kind: 'button',
      label: t('companyPage.addPhone'),
      onClick: openPhoneEdit,
      testId: 'company-primary-add-phone',
    };
  }

  const openDelete = () => {
    setDeleteError('');
    setDeleteBlocked(false);
    setShowDelete(true);
  };
  const closeDelete = () => {
    setShowDelete(false);
    setDeleteError('');
    setDeleteBlocked(false);
  };
  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      await deleteVendor(id);
      // Replace: Back must not land on a deleted company.
      navigate(routeUrl('companies'), { replace: true });
      focusPageHeadingWhenReady();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteBlocked(err.statusCode === 409);
        setDeleteError(
          err.statusCode === 409
            ? t('companies.list.deleteBlocked')
            : translateApiError(err.error.code, tErrors),
        );
      } else {
        setDeleteError(t('companyPage.deleteError'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const tabFact = (
    factId: string,
    tab: ObjectTabId,
    label: string,
    value: SummaryFact['value'],
  ): SummaryFact => ({
    id: factId,
    kind: 'tab',
    href: tabs.hrefFor(tab),
    onActivate: () => tabs.select(tab, { focusPanel: true }),
    label,
    value,
  });

  const facts: SummaryFact[] = [];
  if (vendor.trade) {
    facts.push({
      id: 'trade',
      kind: 'link',
      to: routeUrl('companies', undefined, { tradeId: vendor.trade.id }),
      state: originState,
      label: t('companyPage.strip.trade'),
      value: getCategoryDisplayName(tSettings, vendor.trade.name, vendor.trade.translationKey),
    });
  } else {
    facts.push({
      id: 'trade',
      kind: 'static',
      label: t('companyPage.strip.trade'),
      value: null,
    });
  }
  facts.push({
    ...tabFact(
      'stillToPay',
      'payments',
      t('companyPage.strip.stillToPay'),
      formatCurrency(vendor.stillToPay),
    ),
    figureKind: 'still-to-pay',
  });
  facts.push(
    tabFact(
      'offers',
      'payments',
      t('companyPage.strip.offers'),
      vendor.offers.count > 0 ? (
        <>
          {formatCurrency(vendor.offers.amount)}
          <span className={styles.remark}>
            {' · '}
            {t('companyPage.strip.offersPaid', { amount: formatCurrency(vendor.offers.paid) })}
          </span>
        </>
      ) : (
        t('companyPage.strip.none')
      ),
    ),
  );
  facts.push(
    tabFact(
      'tasks',
      'work',
      t('companyPage.strip.tasks'),
      vendor.openTaskCount > 0
        ? t('companyPage.strip.tasksOpen', { count: vendor.openTaskCount })
        : t('companyPage.strip.noneOpen'),
    ),
  );
  facts.push(
    tabFact(
      'onSite',
      'diary',
      t('companyPage.strip.onSite'),
      vendor.onSiteDays > 0 ? (
        <>
          {t('companyPage.strip.days', { count: vendor.onSiteDays })}
          <span className={styles.remark}>
            {' · '}
            {t('companyPage.strip.last', { date: formatDate(vendor.lastOnSite) })}
          </span>
        </>
      ) : (
        t('companyPage.strip.noneYet')
      ),
    ),
  );

  const header = (
    <ObjectHeader
      title={h1Text}
      breadcrumbs={<PageBreadcrumbs />}
      headingRef={headingRef}
      testId="company-header"
      primary={primary}
      menu={{ onDelete: openDelete }}
    />
  );

  return (
    <PageLayout header={header}>
      <SummaryStrip
        typeLabel={t('companyPage.typeLabel')}
        columns={5}
        facts={facts}
        testId="company-summary"
      />
      <CompanyTabs
        id={id}
        vendor={vendor}
        state={state}
        tabs={tabs}
        diary={diary}
        originState={originState}
        phoneCardRef={phoneCardRef}
        headingRef={headingRef}
      />
      {showDelete && (
        <ConfirmDialog
          title={tc('confirmDialog.deleteTitle', { name: vendor.name })}
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
          testIdPrefix="vendor-delete"
        />
      )}
    </PageLayout>
  );
}

interface CompanyTabsProps {
  readonly id: string;
  readonly vendor: VendorDetail;
  readonly state: UseCompanyRecordResult;
  readonly tabs: ReturnType<typeof useObjectTabs>;
  readonly diary: ReturnType<typeof useCompanyDiary>;
  readonly originState: ReturnType<typeof useOriginState>;
  readonly phoneCardRef: RefObject<SectionCardController | null>;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
}

/** The tab strip and its panels; each data panel loads on its first visit. */
function CompanyTabs({
  id,
  vendor,
  state,
  tabs,
  diary,
  originState,
  phoneCardRef,
  headingRef,
}: CompanyTabsProps) {
  const { t } = useTranslation('budget');
  return (
    <ObjectTabs
      controller={tabs}
      typeLabel={t('companyPage.typeLabel')}
      idPrefix="company-tabs"
      counts={{ payments: vendor.invoiceCount, diary: diary.totalItems }}
      panels={{
        overview: () => (
          <SectionCardScope>
            <div className={styles.overview}>
              <CompanyContactPersons
                vendorId={id}
                contacts={vendor.contacts}
                onChanged={state.refresh}
              />
              <CompanyDetailCards
                vendor={vendor}
                onSaved={state.refresh}
                phoneCardRef={phoneCardRef}
              />
            </div>
          </SectionCardScope>
        ),
        work: () => <WorkTab id={id} revision={state.revision} originState={originState} />,
        payments: () => (
          <PaymentsTab
            vendor={vendor}
            revision={state.revision}
            originState={originState}
            onChanged={state.refresh}
            headingRef={headingRef}
          />
        ),
        diary: () => <CompanyDiaryPanel vendorId={id} diary={diary} originState={originState} />,
        history: () => (
          <ObjectHistorySection
            entityType="vendor"
            entityId={id}
            revision={state.revision}
            testIdPrefix="company-history"
            labels={{
              title: t('companyPage.history.title'),
              empty: t('companyPage.history.empty'),
              loadError: t('companyPage.history.loadError'),
              retry: t('companyPage.history.retry'),
              showAll: t('companyPage.history.showAll'),
            }}
          />
        ),
      }}
    />
  );
}

function WorkTab({
  id,
  revision,
  originState,
}: {
  readonly id: string;
  readonly revision: number;
  readonly originState: ReturnType<typeof useOriginState>;
}) {
  const relations = useCompanyRelations(id, revision);
  return <CompanyWorkPanel relations={relations} originState={originState} />;
}

function PaymentsTab({
  vendor,
  revision,
  originState,
  onChanged,
  headingRef,
}: {
  readonly vendor: VendorDetail;
  readonly revision: number;
  readonly originState: ReturnType<typeof useOriginState>;
  readonly onChanged: () => Promise<unknown>;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const payments = useCompanyPayments(vendor.id, revision);
  return (
    <CompanyPaymentsPanel
      vendor={vendor}
      payments={payments}
      originState={originState}
      onChanged={onChanged}
      headingRef={headingRef}
    />
  );
}

export default VendorDetailPage;
