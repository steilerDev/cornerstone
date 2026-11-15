import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { AreaPageSummary } from '@cornerstone/shared';
import { AreaColorDot } from '../../components/AreaBreadcrumb/AreaColorDot.js';
import { FilterChipGroup } from '../../components/FilterChipGroup/FilterChipGroup.js';
import { ObjectHeader } from '../../components/ObjectHeader/index.js';
import type { ObjectHeaderPrimary } from '../../components/ObjectHeader/index.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { SummaryStrip } from '../../components/SummaryStrip/SummaryStrip.js';
import { useCreateContext } from '../../components/CreateMenu/CreateMenuContext.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useObjectRecord } from '../../hooks/useObjectRecord.js';
import { useUserText } from '../../hooks/useUserText.js';
import { fetchAreaSummary } from '../../lib/areasApi.js';
import { fetchFailureMessage } from '../../lib/fetchFailure.js';
import { focusPageHeading } from '../../lib/focusPageHeading.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import type { OriginState } from '../../navigation/origin.js';
import { useCreateEntryLink } from '../../navigation/useOpenCreate.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import sharedStyles from '../../styles/shared.module.css';
import { AreaCompaniesList } from './AreaCompaniesList.js';
import { AreaCostSection } from './AreaCostSection.js';
import { AreaNowSection } from './AreaNowSection.js';
import { AreaRoomsList } from './AreaRoomsList.js';
import { AreaSiteSection } from './AreaSiteSection.js';
import { useAreaSummaryFacts } from './useAreaSummaryFacts.js';
import styles from './AreaDetailPage.module.css';

/** Reads the route id once; the view below always has an area id. */
export function AreaDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to={routeUrl('areas')} replace />;
  // The key remounts the page when moving between area pages (chips, Rooms, context rows).
  return <AreaView key={id} id={id} />;
}

function AreaView({ id }: { id: string }) {
  const { t } = useTranslation('areas');
  const { t: tc } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const navigate = useNavigate();
  const state = useObjectRecord(id, fetchAreaSummary);
  const { record, isLoading, failure, notFound } = state;

  const failed = !isLoading && (failure !== null || record === null);
  let h1Text = record && !isLoading ? record.area.name : t('detail.typeLabel');
  if (!isLoading && notFound) h1Text = t('detail.notFound');
  useDocumentTitle(h1Text);
  const originState = useOriginState(record && !isLoading ? record.area.name : null);

  useEffect(() => {
    if (failed) focusPageHeading();
  }, [failed]);

  if (isLoading) {
    return (
      <PageLayout title={h1Text} breadcrumbs={<PageBreadcrumbs />}>
        <Skeleton lines={4} loadingLabel={t('detail.loading')} />
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
              onClick={() => navigate(routeUrl('areas'))}
            >
              {tc('navigation.backTo', { origin: tc('navigation.areas') })}
            </button>
            {notFound ? null : (
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={() => void state.reload()}
              >
                {t('index.retry')}
              </button>
            )}
          </div>
        </div>
      </PageLayout>
    );
  }

  return <AreaLoaded summary={record} originState={originState} />;
}

interface AreaLoadedProps {
  readonly summary: AreaPageSummary;
  readonly originState: OriginState;
}

function AreaLoaded({ summary, originState }: AreaLoadedProps) {
  const { t } = useTranslation('areas');
  const userText = useUserText();
  const { area, children } = summary;

  // The New menu pre-fills this area, and so does Log here.
  useCreateContext({ areaId: area.id });
  const log = useCreateEntryLink('diaryEntry');
  const facts = useAreaSummaryFacts({ summary, originState });

  const primary: ObjectHeaderPrimary = {
    kind: 'link',
    label: t('detail.logHere'),
    to: log.to,
    state: log.state,
    testId: 'area-primary-log',
  };

  const header = (
    <ObjectHeader
      title={area.name}
      titleLeading={<AreaColorDot color={area.color} />}
      description={area.description ? <span {...userText()}>{area.description}</span> : undefined}
      breadcrumbs={
        <PageBreadcrumbs
          extraParents={area.ancestors.map((ancestor) => ({
            label: ancestor.name,
            href: routeUrl('area', { id: ancestor.id }),
            dynamic: true,
          }))}
        />
      }
      primary={primary}
      testId="area-header"
    />
  );

  return (
    <PageLayout header={header}>
      {children.length > 0 ? (
        <div className={styles.chips}>
          <FilterChipGroup
            variant="navigate"
            layout="scroll"
            ariaLabel={t('detail.subAreasOf', { area: area.name })}
            testIdPrefix="area-chip"
            options={children.map((child) => ({
              value: child.id,
              label: child.name,
              title: child.name,
              to: routeUrl('area', { id: child.id }),
              state: originState,
              leading: <AreaColorDot color={child.color} />,
            }))}
          />
        </div>
      ) : null}
      <SummaryStrip
        typeLabel={t('detail.typeLabel')}
        facts={facts}
        columns={4}
        testId="area-summary"
      />
      <div className={styles.panel}>
        <div id="area-now" className={styles.section}>
          <AreaNowSection summary={summary} originState={originState} />
        </div>
        <div id="area-site" className={styles.section}>
          <AreaSiteSection
            areaId={area.id}
            areaName={area.name}
            photos={summary.counts.photos}
            originState={originState}
          />
        </div>
        <div id="area-companies" className={styles.section}>
          <AreaCompaniesList
            companies={summary.companies}
            areaName={area.name}
            originState={originState}
          />
        </div>
        {children.length > 0 ? (
          <div id="area-rooms" className={styles.section}>
            <AreaRoomsList summary={summary} originState={originState} />
          </div>
        ) : null}
        <div id="area-cost" className={styles.section}>
          <AreaCostSection areaId={area.id} areaName={area.name} originState={originState} />
        </div>
      </div>
    </PageLayout>
  );
}

export default AreaDetailPage;
