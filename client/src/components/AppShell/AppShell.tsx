import { Outlet, useLocation } from 'react-router-dom';
import { Suspense, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext.js';
import { ShortcutRegistryProvider } from '../../hooks/shortcutRegistry.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { BreadcrumbSlotContext, TOP_BAR_MEDIA_QUERY } from '../../navigation/breadcrumbSlot.js';
import { resolveNavActive } from '../../navigation/navActive.js';
import { navSections } from '../../navigation/navConfig.js';
import { PreviousPathContext, useTrackPreviousPath } from '../../navigation/previousPath.js';
import { useNavContext } from '../../navigation/useNavContext.js';
import { ViewMenuContext, viewMenuFor } from '../../navigation/viewMenu.js';
import { BottomBar } from '../BottomBar/BottomBar.js';
import { MoreSheet } from '../MoreSheet/MoreSheet.js';
import { Sidebar } from '../Sidebar/Sidebar.js';
import { TopBar } from '../TopBar/TopBar.js';
import styles from './AppShell.module.css';

/**
 * The app frame. From 1024 px: sidebar and desktop top bar. Below: compact top bar, bottom bar
 * and the More sheet. The switch is JS (never CSS display:none), so exactly one navigation, one
 * banner and one Log out exist at any width.
 */
export function AppShell() {
  const { t } = useTranslation('common');
  const wide = useMediaQuery(TOP_BAR_MEDIA_QUERY);
  const { user } = useAuth();
  const location = useLocation();
  const ctx = useNavContext();
  const sections = useMemo(() => navSections(ctx), [ctx]);
  const active = useMemo(
    () => resolveNavActive(location.pathname, sections),
    [location.pathname, sections],
  );
  const viewMenu = useMemo(
    () => (wide || !user ? null : viewMenuFor(active, sections)),
    [wide, user, active, sections],
  );
  const getPreviousPath = useTrackPreviousPath(location.pathname, location.key);
  const [slotEl, setSlotEl] = useState<HTMLDivElement | null>(null);
  const [moreOpenKey, setMoreOpenKey] = useState<string | null>(null);
  // Any navigation (a new location key) closes the sheet.
  const moreOpen = !wide && moreOpenKey === location.key;
  // Never reopen after a resize round trip: leaving the compact layout forgets the request.
  const [wasWide, setWasWide] = useState(wide);
  if (wasWide !== wide) {
    setWasWide(wide);
    if (wide) setMoreOpenKey(null);
  }
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const sheetId = useId();

  return (
    <ShortcutRegistryProvider>
      <BreadcrumbSlotContext value={slotEl}>
        <PreviousPathContext value={getPreviousPath}>
          <ViewMenuContext value={viewMenu}>
            <div className={wide ? styles.appShell : `${styles.appShell} ${styles.compact}`}>
              {wide && <Sidebar sections={sections} active={active} />}
              <div className={styles.shellColumn} inert={moreOpen}>
                <TopBar breadcrumbSlotRef={setSlotEl} variant={wide ? 'desktop' : 'compact'} />
                {!wide && (
                  <BottomBar
                    active={active}
                    moreOpen={moreOpen}
                    moreControlsId={sheetId}
                    moreButtonRef={moreButtonRef}
                    onMoreClick={() => setMoreOpenKey(location.key)}
                  />
                )}
                <div className={styles.mainContent}>
                  <main className={styles.pageContent}>
                    <Suspense fallback={<div className={styles.loading}>{t('loading')}</div>}>
                      <Outlet />
                    </Suspense>
                  </main>
                </div>
              </div>
              {!wide && (
                <MoreSheet
                  id={sheetId}
                  open={moreOpen}
                  onClose={() => setMoreOpenKey(null)}
                  sections={sections}
                  active={active}
                  returnFocusRef={moreButtonRef}
                />
              )}
            </div>
          </ViewMenuContext>
        </PreviousPathContext>
      </BreadcrumbSlotContext>
    </ShortcutRegistryProvider>
  );
}
