import { Outlet, useLocation } from 'react-router-dom';
import { Suspense, useCallback, useId, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext.js';
import { ShortcutRegistryProvider } from '../../hooks/shortcutRegistry.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { BreadcrumbSlotContext, TOP_BAR_MEDIA_QUERY } from '../../navigation/breadcrumbSlot.js';
import { resolveNavActive } from '../../navigation/navActive.js';
import { navSections } from '../../navigation/navConfig.js';
import { PreviousPathContext, useTrackPreviousPath } from '../../navigation/previousPath.js';
import { useRealLocationKey } from '../../navigation/realLocation.js';
import { useNavContext } from '../../navigation/useNavContext.js';
import { ViewMenuContext, viewMenuFor } from '../../navigation/viewMenu.js';
import { ImmersiveShellContext } from './immersiveShellContext.js';
import { AttentionProvider } from '../../attention/AttentionProvider.js';
import { useShellAttention } from '../../attention/useShellAttention.js';
import { BottomBar } from '../BottomBar/BottomBar.js';
import { CommandSearch } from '../CommandSearch/CommandSearch.js';
import { CommandSearchProvider } from '../CommandSearch/CommandSearchContext.js';
import type { CommandSearchOpenOptions } from '../CommandSearch/CommandSearchContext.js';
import { CreateMenuProvider } from '../CreateMenu/CreateMenuContext.js';
import { CreateSheet } from '../CreateMenu/CreateSheet.js';
import { MoreSheet } from '../MoreSheet/MoreSheet.js';
import { Sidebar } from '../Sidebar/Sidebar.js';
import { TopBar } from '../TopBar/TopBar.js';
import styles from './AppShell.module.css';

/**
 * The app frame. From 1024 px: sidebar and desktop top bar. Below: compact top bar, bottom bar
 * and the More sheet. The switch is JS (never CSS display:none), so exactly one navigation, one
 * banner and one Log out exist at any width.
 */
function AppShellFrame() {
  const { t } = useTranslation('common');
  const { data: attentionData } = useShellAttention();
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
  if (moreOpenKey !== null && moreOpenKey !== location.key) setMoreOpenKey(null);
  const moreOpen = !wide && moreOpenKey === location.key;
  // Never reopen after a resize round trip: leaving the compact layout forgets the request.
  const [wasWide, setWasWide] = useState(wide);
  if (wasWide !== wide) {
    setWasWide(wide);
    if (wide) setMoreOpenKey(null);
  }
  // The New sheet closes on any real navigation (a dialog route keeps the display location).
  const realKey = useRealLocationKey();
  const [createOpenKey, setCreateOpenKey] = useState<string | null>(null);
  if (createOpenKey !== null && createOpenKey !== realKey) setCreateOpenKey(null);
  const createOpen = !wide && createOpenKey === realKey;
  if (wide && createOpenKey !== null) setCreateOpenKey(null);
  const onCreateSheetOpenChange = useCallback(
    (open: boolean) => setCreateOpenKey(open ? realKey : null),
    [realKey],
  );
  // Command search: any real navigation (including browser Back) closes it.
  const [searchRequest, setSearchRequest] = useState<{
    key: string;
    query: string;
    returnFocusRef?: RefObject<HTMLElement | null>;
  } | null>(null);
  // A request belongs to the location it was made on: once the real key differs (a result, Go to,
  // Back or Forward) it is dropped, so a later return to the old key cannot reopen the palette.
  if (searchRequest !== null && searchRequest.key !== realKey) setSearchRequest(null);
  const searchOpen = searchRequest !== null && searchRequest.key === realKey;
  const openSearch = useCallback(
    (options: CommandSearchOpenOptions) =>
      setSearchRequest({
        key: realKey,
        query: options.query ?? '',
        ...(options.returnFocusRef ? { returnFocusRef: options.returnFocusRef } : {}),
      }),
    [realKey],
  );
  const closeSearch = useCallback(() => setSearchRequest(null), []);
  // Immersive pages (the phone photo viewer) hide the compact bars while registered.
  const [immersiveCount, setImmersiveCount] = useState(0);
  const immersive = useMemo(
    () => ({
      register: () => {
        setImmersiveCount((n) => n + 1);
        return () => setImmersiveCount((n) => n - 1);
      },
    }),
    [],
  );
  const hideBars = !wide && immersiveCount > 0;
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const sheetId = useId();

  return (
    <ShortcutRegistryProvider>
      <CreateMenuProvider
        moneyPage={active?.sectionId === 'money'}
        wide={wide}
        sheetOpen={createOpen}
        onSheetOpenChange={onCreateSheetOpenChange}
      >
        <CommandSearchProvider isOpen={searchOpen} onOpen={openSearch} onClose={closeSearch}>
          <BreadcrumbSlotContext value={slotEl}>
            <PreviousPathContext value={getPreviousPath}>
              <ViewMenuContext value={viewMenu}>
                <ImmersiveShellContext value={immersive}>
                  <div
                    className={
                      wide
                        ? styles.appShell
                        : `${styles.appShell} ${styles.compact}${hideBars ? ` ${styles.immersive}` : ''}`
                    }
                    inert={searchOpen || undefined}
                  >
                    {wide && <Sidebar sections={sections} active={active} />}
                    <div className={styles.shellColumn} inert={moreOpen || createOpen}>
                      {!hideBars && (
                        <TopBar
                          breadcrumbSlotRef={setSlotEl}
                          variant={wide ? 'desktop' : 'compact'}
                        />
                      )}
                      {!wide && !hideBars && (
                        <BottomBar
                          active={active}
                          moreOpen={moreOpen}
                          moreControlsId={sheetId}
                          moreButtonRef={moreButtonRef}
                          onMoreClick={() => setMoreOpenKey(location.key)}
                          homeBadge={attentionData?.count}
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
                    {!wide && <CreateSheet />}
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
                </ImmersiveShellContext>
                {searchOpen && (
                  <CommandSearch
                    wide={wide}
                    initialQuery={searchRequest.query}
                    returnFocusRef={searchRequest.returnFocusRef}
                    onClose={closeSearch}
                    navContext={ctx}
                    sections={sections}
                    active={active}
                  />
                )}
              </ViewMenuContext>
            </PreviousPathContext>
          </BreadcrumbSlotContext>
        </CommandSearchProvider>
      </CreateMenuProvider>
    </ShortcutRegistryProvider>
  );
}

/** The app frame inside the one shell attention state (Home, the bell and the bottom bar read it). */
export function AppShell() {
  return (
    <AttentionProvider>
      <AppShellFrame />
    </AttentionProvider>
  );
}
