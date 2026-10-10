/**
 * Page Object Model for the AppShell layout.
 *
 * - >= 1024px: sidebar + desktop top bar and user menu (#2205, #2206).
 * - < 1024px (phones and tablets, #2207): compact top bar, bottom bar (Home, Site diary, New,
 *   Photos, More), the More sheet (sections + user block) and the title menu ("Tasks v") that
 *   lists the section's views.
 *
 * Navigation helpers: `navigateTo(route)` goes through the shell the way a user does, composed
 * of `tapBottomBar(slot)` / `openFromMoreSheet(section)` (below 1024px) or the sidebar (above),
 * plus `openView(route)` for a section's views.
 *
 * Desktop-only members (>= 1024px): `sidebar`, `settingsNav`, `userMenuTrigger`, `userMenu`,
 * `openUserMenu()`. The remaining locators name one control that exists at every width and are
 * evaluated per call, so `page.setViewportSize()` mid-test is honoured.
 */

import type { Page, Locator } from '@playwright/test';
import { getRouteEntry, routeUrl } from '../../shared/src/routes/index.js';
import type { RouteSection, ServedRouteId } from '../../shared/src/routes/index.js';

export type BottomBarSlot = 'home' | 'diary' | 'new' | 'photos' | 'more';
/** NavConfig section ids that live in the bottom bar. */
export type BarSection = 'home' | 'diary' | 'photos';
/** NavConfig section ids that live in the More sheet. */
export type SheetSection =
  'tasks' | 'purchases' | 'money' | 'companies' | 'areas' | 'history' | 'documents' | 'settings';
export type ShellSection = BarSection | SheetSection;

/** Route-map section label -> NavConfig section id (Auth/System pages are not in the shell). */
const SECTION_OF: Record<RouteSection, ShellSection | null> = {
  Auth: null,
  Home: 'home',
  Tasks: 'tasks',
  Purchases: 'purchases',
  'Site diary': 'diary',
  Photos: 'photos',
  Money: 'money',
  Companies: 'companies',
  Areas: 'areas',
  History: 'history',
  Documents: 'documents',
  Settings: 'settings',
  System: null,
};
const BAR_SECTIONS: readonly BarSection[] = ['home', 'diary', 'photos'];

function isBarSection(section: ShellSection): section is BarSection {
  return (BAR_SECTIONS as readonly string[]).includes(section);
}

export class AppShellPage {
  readonly page: Page;
  /** The "Main navigation" landmark (sidebar >= 1024px, bottom bar below). */
  readonly nav: Locator;
  /** The top bar `<header>` (banner) at every width; desktop and compact variants. */
  readonly topBar: Locator;
  /** The compact bottom bar (`<nav>` "Main navigation"), < 1024px only. */
  readonly bottomBar: Locator;
  /** The More button (last slot of the bottom bar), < 1024px only. */
  readonly moreButton: Locator;
  /** The More sheet panel: always mounted below 1024px, `inert` and without a dialog role while closed. */
  readonly moreSheet: Locator;
  readonly moreSheetBackdrop: Locator;
  /** The More sheet's Close button (the header x). */
  readonly moreSheetClose: Locator;
  /** The title-menu trigger (the h1's button, "Tasks v"), < 1024px on a section's views. */
  readonly viewMenuTrigger: Locator;
  /** The open title menu. */
  readonly viewMenu: Locator;
  /** Compact top bar: house name, and the title that appears once the h1 scrolled away. */
  readonly topBarHouseName: Locator;
  readonly topBarTitle: Locator;
  /** The `aside` sidebar. >= 1024px only. */
  readonly sidebar: Locator;
  /** Footer landmark "Settings" / "Einstellungen" of the sidebar. >= 1024px only. */
  readonly settingsNav: Locator;
  /** Avatar trigger of the user menu in the top bar. >= 1024px only. */
  readonly userMenuTrigger: Locator;
  /** The open user-menu panel. >= 1024px only. */
  readonly userMenu: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nav = page.getByRole('navigation', { name: /Main navigation|Hauptnavigation/ });
    this.topBar = page.getByTestId('top-bar');
    this.bottomBar = page.getByTestId('bottom-bar');
    this.moreButton = page.getByTestId('bottom-bar-more');
    this.moreSheet = page.getByTestId('more-sheet');
    this.moreSheetBackdrop = page.getByTestId('more-sheet-backdrop');
    this.moreSheetClose = page.getByTestId('more-sheet-close');
    this.viewMenuTrigger = page.getByTestId('view-menu-trigger');
    this.viewMenu = page.getByTestId('view-menu');
    this.topBarHouseName = page.getByTestId('top-bar-house-name');
    this.topBarTitle = page.getByTestId('top-bar-title');
    this.sidebar = page.locator('aside');
    this.settingsNav = page.getByRole('navigation', { name: /^(Settings|Einstellungen)$/ });
    this.userMenuTrigger = page.getByTestId('user-menu-trigger');
    this.userMenu = page.getByTestId('user-menu');
  }

  /** True below the shell breakpoint (1023/1024): bottom bar + More sheet instead of the sidebar. */
  isCompact(): boolean {
    const width = this.page.viewportSize()?.width ?? Number.MAX_SAFE_INTEGER;
    return width < 1024;
  }

  // ---------------------------------------------------------------------------------------
  // Phone / tablet controls
  // ---------------------------------------------------------------------------------------

  /** A bottom-bar slot (`home` | `diary` | `new` | `photos` | `more`). */
  bottomBarSlot(id: BottomBarSlot): Locator {
    return this.page.getByTestId(`bottom-bar-${id}`);
  }

  /** A section row of the More sheet by NavConfig section id (tasks, purchases, money, ...). */
  moreSheetRow(id: string): Locator {
    return this.page.getByTestId(`more-sheet-section-${id}`);
  }

  /** Open the More sheet (no-op when open) and wait until it is interactive. */
  async openMoreSheet(): Promise<void> {
    if ((await this.moreSheet.getAttribute('data-open')) !== 'true') {
      await this.moreButton.click();
    }
    await this.page.locator('[data-testid="more-sheet"][data-open="true"]').waitFor();
    await this.moreSheet.waitFor({ state: 'visible' });
    // Let the slide-in finish so position and size measurements are of the settled sheet
    await this.moreSheet.evaluate((el) =>
      Promise.all(el.getAnimations().map((animation) => animation.finished)),
    );
  }

  /** Close the More sheet with Escape and wait until it is closed (no-op when closed). */
  async closeMoreSheet(): Promise<void> {
    if ((await this.moreSheet.getAttribute('data-open')) !== 'true') return;
    await this.page.keyboard.press('Escape');
    await this.page.locator('[data-testid="more-sheet"][data-open="false"]').waitFor();
  }

  /** Phone/tablet only: tap a bottom-bar slot (More opens the sheet and waits for it). */
  async tapBottomBar(slot: BottomBarSlot): Promise<void> {
    if (!this.isCompact()) throw new Error('tapBottomBar is below 1024px only');
    if (slot === 'more') {
      await this.openMoreSheet();
      return;
    }
    await this.bottomBarSlot(slot).click();
  }

  /** Phone/tablet only: open the More sheet and tap a section row; waits until the sheet closed. */
  async openFromMoreSheet(section: SheetSection): Promise<void> {
    if (!this.isCompact()) throw new Error('openFromMoreSheet is below 1024px only');
    await this.openMoreSheet();
    await this.moreSheetRow(section).click();
    await this.page.locator('[data-testid="more-sheet"][data-open="false"]').waitFor();
  }

  /**
   * Make the section's views assertable: below 1024px open the title menu (when not open);
   * on desktop the sidebar already shows them (no-op).
   */
  async revealViews(): Promise<void> {
    if (!this.isCompact()) return;
    if (await this.viewMenu.isVisible()) return;
    await this.viewMenuTrigger.click();
    await this.viewMenu.waitFor({ state: 'visible' });
  }

  // ---------------------------------------------------------------------------------------
  // Viewport-aware members
  // ---------------------------------------------------------------------------------------

  /** Every bar/sheet/sidebar entry currently marked as the page's entry (never the title menu). */
  get activeEntries(): Locator {
    return this.isCompact()
      ? this.bottomBar.or(this.moreSheet).locator('[aria-current="page"]')
      : this.sidebar.locator('[aria-current="page"]');
  }

  /** The nested view links: desktop sidebar views, compact title-menu items (main view excluded). */
  get viewLinks(): Locator {
    return this.isCompact()
      ? this.viewMenu.locator('[data-testid^="view-menu-item-"]')
      : this.sidebar.locator('[data-testid^="sidebar-view-"]');
  }

  /** Theme choice (`light` | `dark` | `system`) in the user menu (desktop) or the More sheet. */
  themeOption(value: 'light' | 'dark' | 'system'): Locator {
    return this.page.getByTestId(
      this.isCompact() ? `more-sheet-theme-${value}` : `user-menu-theme-${value}`,
    );
  }

  /** Language choice (`en` | `de`) in the user menu (desktop) or the More sheet. */
  languageOption(value: 'en' | 'de'): Locator {
    return this.page.getByTestId(
      this.isCompact() ? `more-sheet-language-${value}` : `user-menu-language-${value}`,
    );
  }

  /** Open the user menu from the avatar. Desktop only; below 1024px use openMoreSheet(). */
  async openUserMenu(): Promise<void> {
    if (this.isCompact()) {
      throw new Error('openUserMenu is desktop-only; use openMoreSheet() below 1024px');
    }
    await this.userMenuTrigger.click();
    await this.userMenu.waitFor({ state: 'visible' });
  }

  /**
   * A section entry by NavConfig section id. Desktop: `sidebar-section-<id>`. Compact: the
   * bottom-bar slot for home/diary/photos, otherwise the More sheet row (attribute and text
   * assertions work on the closed, inert row).
   */
  sectionLink(id: string): Locator {
    if (!this.isCompact()) return this.page.getByTestId(`sidebar-section-${id}`);
    return isBarSection(id as ShellSection)
      ? this.bottomBarSlot(id as BottomBarSlot)
      : this.moreSheetRow(id);
  }

  /**
   * A nested view by route id (scheduleGantt, scheduleCalendar, milestones, invoices,
   * budgetSources, budgetSubsidies, bankReport, settingsProfile, settingsUsers, settingsBackups).
   * Desktop: `sidebar-view-<route>` (only inside the active section). Compact:
   * `view-menu-item-<route>` (only while the title menu is open, see revealViews()).
   */
  viewLink(route: string): Locator {
    return this.page.getByTestId(
      this.isCompact() ? `view-menu-item-${route}` : `sidebar-view-${route}`,
    );
  }

  /** Click a nested view (the page must already be inside its section). */
  async openView(route: ServedRouteId): Promise<void> {
    await this.revealViews();
    await this.viewLink(route).click();
  }

  /** The NavConfig section that owns a route (from the route map's `section`). */
  sectionOf(route: ServedRouteId): ShellSection {
    const section = SECTION_OF[getRouteEntry(route).section];
    if (section === null) throw new Error(`${route} does not belong to a shell section`);
    return section;
  }

  /**
   * Navigate through the shell the way a user does, to a section's entry route or one of its
   * views. Desktop: the sidebar entry, then the sidebar view. Below 1024px: the bottom-bar slot
   * or the More sheet row, then the title menu. Redirecting entries (home -> dashboard,
   * companies -> vendors) are followed. Parameter-free routes only; callers assert the final URL.
   */
  async navigateTo(route: ServedRouteId): Promise<void> {
    const section = this.sectionOf(route);
    const target = (routeUrl as (id: ServedRouteId) => string)(route);
    const compact = this.isCompact();
    const entry = this.sectionLink(section);
    const testId = compact
      ? isBarSection(section)
        ? `bottom-bar-${section}`
        : `more-sheet-section-${section}`
      : `sidebar-section-${section}`;
    // Read before clicking: the closed sheet row keeps its href
    const entryPath = await entry.getAttribute('href');

    if (!compact) await entry.click();
    else if (isBarSection(section)) await this.tapBottomBar(section);
    else await this.openFromMoreSheet(section);

    // Home and Companies redirect, so wait for the entry to be marked current, not for the URL.
    // `attached`: the closed sheet row is hidden.
    await this.page
      .locator(`[data-testid="${testId}"][aria-current="page"]`)
      .waitFor({ state: 'attached' });
    await this.page.locator('main h1').first().waitFor({ state: 'visible' });

    if (entryPath === target) return;

    // The target is one of the section's views
    await this.revealViews();
    if ((await this.viewLink(route).count()) === 0) {
      throw new Error(`${route} is neither the entry nor a view of section ${section}`);
    }
    await this.viewLink(route).click();
    await this.page.waitForURL((url) => url.pathname === target);
  }

  /**
   * Real UI log-out, viewport-aware, no API fallback. >= 1024px: last row of the user menu.
   * Below 1024px: the More sheet's Log out row.
   */
  async logout(): Promise<void> {
    if (this.isCompact()) {
      await this.openMoreSheet();
      await this.page.getByTestId('more-sheet-logout').click();
      return;
    }
    await this.openUserMenu();
    await this.page.getByTestId('user-menu-logout').click();
  }
}
