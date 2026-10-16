import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isRouteServed, routeUrl } from '@cornerstone/shared';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { ReferenceList } from '../../components/ReferenceList/ReferenceList.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useReferenceListData } from '../../hooks/useReferenceListData.js';
import { navHref } from '../../navigation/navActive.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import sharedStyles from '../../styles/shared.module.css';
import { AreasInterimCard } from './AreasInterimCard.js';
import { HouseSection } from './HouseSection.js';
import { useProjectSetupLocation } from './projectSetupLocation.js';
import {
  costCategoryAdapter,
  orientationAdapter,
  purchaseCategoryAdapter,
  toCostCategoryItem,
  toOrientationItem,
  toPurchaseCategoryItem,
} from './referenceListAdapters.js';
import styles from './ManagePage.module.css';

/**
 * Settings › Project setup: one page of sections (House, Cost categories, Purchase categories,
 * Photo orientations) followed by pointers to what is managed on other pages. A section is a
 * `#anchor` target; the old `?tab=` URLs are rewritten to anchors by `useProjectSetupLocation`.
 */
export function ManagePage() {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const pageTitle = tCommon('navigation.projectSetup');
  useDocumentTitle(pageTitle);

  const costCategories = useReferenceListData(costCategoryAdapter);
  const purchaseCategories = useReferenceListData(purchaseCategoryAdapter);
  const orientations = useReferenceListData(orientationAdapter);

  const costItems = useMemo(
    () => costCategories.rows.map((row) => toCostCategoryItem(row, t)),
    [costCategories.rows, t],
  );
  const purchaseItems = useMemo(
    () => purchaseCategories.rows.map((row) => toPurchaseCategoryItem(row, t)),
    [purchaseCategories.rows, t],
  );
  const orientationItems = useMemo(
    () => orientations.rows.map(toOrientationItem),
    [orientations.rows],
  );

  // Interim page content (Architecture › interim page content): #2218 serves 'areas' and deletes
  // the Areas card branch below.
  const areasServed = isRouteServed('areas');
  const [houseSettled, setHouseSettled] = useState(false);
  const [areasSettled, setAreasSettled] = useState(false);
  const onHouseSettled = useCallback(() => setHouseSettled(true), []);
  const onAreasSettled = useCallback(() => setAreasSettled(true), []);
  const settled =
    houseSettled &&
    costCategories.status !== 'loading' &&
    purchaseCategories.status !== 'loading' &&
    orientations.status !== 'loading' &&
    (areasServed || areasSettled);
  useProjectSetupLocation({ settled });

  // One always-mounted polite region. Clearing first makes a repeated message read again.
  const [announcement, setAnnouncement] = useState('');
  const announceFrameRef = useRef(0);
  const announce = useCallback((message: string) => {
    window.cancelAnimationFrame(announceFrameRef.current);
    setAnnouncement('');
    announceFrameRef.current = window.requestAnimationFrame(() => setAnnouncement(message));
  }, []);
  useEffect(
    () => () => {
      window.cancelAnimationFrame(announceFrameRef.current);
    },
    [],
  );

  return (
    <PageLayout maxWidth="narrow" title={pageTitle}>
      <div className={styles.sections}>
        <HouseSection onSettled={onHouseSettled} />

        <ReferenceList
          anchorId="cost-categories"
          sectionTestId="project-setup-cost-categories"
          testIdPrefix="cost-categories"
          labels={{
            title: t('projectSetup.costCategories.title'),
            description: t('projectSetup.costCategories.description'),
            newItem: t('projectSetup.costCategories.newItem', {
              item: t('projectSetup.costCategories.item'),
            }),
            editItem: t('projectSetup.costCategories.editItem', {
              item: t('projectSetup.costCategories.item'),
            }),
            empty: t('projectSetup.costCategories.empty', {
              items: t('projectSetup.costCategories.items'),
            }),
            loadFailed: t('projectSetup.costCategories.loadFailed', {
              items: t('projectSetup.costCategories.items'),
            }),
            duplicateName: t('projectSetup.costCategories.duplicateName'),
            deleteBlocked: (name) => t('projectSetup.costCategories.deleteBlocked', { name }),
          }}
          fields={{ nameMaxLength: 100, descriptionMaxLength: 500, color: true }}
          items={costItems}
          status={costCategories.status}
          onRetry={costCategories.retry}
          onCreate={costCategories.create}
          onUpdate={costCategories.update}
          onDelete={costCategories.remove}
          onReorder={costCategories.reorder}
          onAnnounce={announce}
        />

        <ReferenceList
          anchorId="purchase-categories"
          sectionTestId="project-setup-purchase-categories"
          testIdPrefix="purchase-categories"
          labels={{
            title: t('projectSetup.purchaseCategories.title'),
            description: t('projectSetup.purchaseCategories.description'),
            newItem: t('projectSetup.purchaseCategories.newItem', {
              item: t('projectSetup.purchaseCategories.item'),
            }),
            editItem: t('projectSetup.purchaseCategories.editItem', {
              item: t('projectSetup.purchaseCategories.item'),
            }),
            empty: t('projectSetup.purchaseCategories.empty', {
              items: t('projectSetup.purchaseCategories.items'),
            }),
            loadFailed: t('projectSetup.purchaseCategories.loadFailed', {
              items: t('projectSetup.purchaseCategories.items'),
            }),
            duplicateName: t('projectSetup.purchaseCategories.duplicateName'),
            deleteBlocked: (name) => t('projectSetup.purchaseCategories.deleteBlocked', { name }),
          }}
          fields={{ nameMaxLength: 100, color: true }}
          items={purchaseItems}
          status={purchaseCategories.status}
          onRetry={purchaseCategories.retry}
          onCreate={purchaseCategories.create}
          onUpdate={purchaseCategories.update}
          onDelete={purchaseCategories.remove}
          onReorder={purchaseCategories.reorder}
          onAnnounce={announce}
        />

        <ReferenceList
          anchorId="orientations"
          sectionTestId="project-setup-photo-orientations"
          testIdPrefix="photo-orientations"
          labels={{
            title: t('projectSetup.orientations.title'),
            description: t('projectSetup.orientations.description'),
            newItem: t('projectSetup.orientations.newItem', {
              item: t('projectSetup.orientations.item'),
            }),
            editItem: t('projectSetup.orientations.editItem', {
              item: t('projectSetup.orientations.item'),
            }),
            empty: t('projectSetup.orientations.empty', {
              items: t('projectSetup.orientations.items'),
            }),
            loadFailed: t('projectSetup.orientations.loadFailed', {
              items: t('projectSetup.orientations.items'),
            }),
            duplicateName: t('projectSetup.orientations.duplicateName'),
          }}
          fields={{ nameMaxLength: 200, descriptionMaxLength: 2000 }}
          items={orientationItems}
          status={orientations.status}
          onRetry={orientations.retry}
          onCreate={orientations.create}
          onUpdate={orientations.update}
          onDelete={orientations.remove}
          onReorder={orientations.reorder}
          deleteImpactType="orientation"
          onAnnounce={announce}
        />

        {!areasServed && <AreasInterimCard onSettled={onAreasSettled} />}

        <section
          id="pointers"
          aria-labelledby="pointers-heading"
          className={styles.card}
          data-testid="project-setup-pointers"
        >
          <h2 id="pointers-heading" className={styles.cardTitle}>
            {t('projectSetup.pointers.title')}
          </h2>
          <ul className={styles.pointerList}>
            <li>
              <NavAnchor
                id="trades"
                to={routeUrl('companies', undefined, { trades: 1 })}
                className={styles.pointerRow}
                data-testid="project-setup-pointer-trades"
              >
                <span className={styles.pointerText}>
                  <span className={styles.pointerName}>{t('projectSetup.pointers.trades')}</span>
                  <span className={styles.pointerHint}>
                    {t('projectSetup.pointers.tradesHint')}
                  </span>
                </span>
                <span aria-hidden="true" className={styles.chevron}>
                  ›
                </span>
              </NavAnchor>
            </li>
            {areasServed && (
              <li>
                <NavAnchor
                  id="areas"
                  to={navHref('areas')}
                  className={styles.pointerRow}
                  data-testid="project-setup-pointer-areas"
                >
                  <span className={styles.pointerText}>
                    <span className={styles.pointerName}>{t('projectSetup.pointers.areas')}</span>
                    <span className={styles.pointerHint}>
                      {t('projectSetup.pointers.areasHint')}
                    </span>
                  </span>
                  <span aria-hidden="true" className={styles.chevron}>
                    ›
                  </span>
                </NavAnchor>
              </li>
            )}
          </ul>
        </section>
      </div>

      <div role="status" className={sharedStyles.srOnly} data-testid="project-setup-status">
        {announcement}
      </div>
    </PageLayout>
  );
}

export default ManagePage;
