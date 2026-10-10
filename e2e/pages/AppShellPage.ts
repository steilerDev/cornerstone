/**
 * Page Object Model for the AppShell layout.
 *
 * - >= 1024px: sidebar + desktop top bar with the user menu (#2205, #2206).
 * - < 1024px (phones and tablets, #2207): compact top bar, bottom bar (Home, Site diary, New,
 *   Photos, More), the More sheet (sections + user block) and the title menu ("Tasks v") that
 *   lists the section's views. No drawer, no floating menu button.
 *
 * Several locators are getters evaluated per call, so `page.setViewportSize()` mid-test is
 * honoured. Members marked `@deprecated` are compatibility shims over the new bar and sheet so
 * the suites written for the drawer keep working; story #2208 migrates them and removes them.
 */

import type { Page, Locator } from '@playwright/test';

const BAR_SECTION_IDS = ['home', 'diary', 'photos'];

export type BottomBarSlot = 'home' | 'diary' | 'new' | 'photos' | 'more';

export class AppShellPage {
  readonly page: Page;
  /** The "Main navigation" landmark (sidebar >= 1024px, bottom bar below). */
  readonly nav: Locator;
  /** The top bar `<header>` (banner) at every width; desktop and compact variants. */
  readonly topBar: Locator;
  /** The compact bottom bar (`<nav>` "Main navigation"), < 1024px only. */
  readonly bottomBar: Locator;
  /** The More button (last slot of the bottom bar). */
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
  /** Desktop user menu trigger / panel (>= 1024px). */
  readonly desktopUserMenuTrigger: Locator;
  readonly desktopUserMenu: Locator;

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
    this.desktopUserMenuTrigger = page.getByTestId('user-menu-trigger');
    this.desktopUserMenu = page.getByTestId('user-menu');
  }

  /** True below the shell breakpoint (1023/1024): bottom bar + More sheet instead of the sidebar. */
  isCompact(): boolean {
    const width = this.page.viewportSize()?.width ?? Number.MAX_SAFE_INTEGER;
    return width < 1024;
  }

  // ---------------------------------------------------------------------------------------
  // New phone / tablet vocabulary (#2207)
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
  }

  /** Close the More sheet with Escape and wait until it is closed (no-op when closed). */
  async closeMoreSheet(): Promise<void> {
    if ((await this.moreSheet.getAttribute('data-open')) !== 'true') return;
    await this.page.keyboard.press('Escape');
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
  // Viewport-aware members (desktop sidebar/user menu vs. compact bar, title menu and sheet)
  // ---------------------------------------------------------------------------------------

  /** Desktop: the `aside` sidebar. Compact (shim): the bottom bar. */
  get sidebar(): Locator {
    return this.isCompact() ? this.bottomBar : this.page.locator('aside');
  }

  /** @deprecated shim, removed in #2208. Compact: the More button. */
  get menuButton(): Locator {
    return this.moreButton;
  }

  /** @deprecated shim, removed in #2208. Compact: the More sheet's Close button. */
  get sidebarCloseButton(): Locator {
    return this.moreSheetClose;
  }

  /** @deprecated shim, removed in #2208. Compact: the More sheet backdrop. */
  get overlay(): Locator {
    return this.moreSheetBackdrop;
  }

  /** Desktop: footer landmark "Settings". Compact (shim): the open title menu. */
  get settingsNav(): Locator {
    return this.isCompact()
      ? this.viewMenu
      : this.page.getByRole('navigation', { name: /^(Settings|Einstellungen)$/ });
  }

  /** Every bar/sheet/sidebar entry currently marked as the page's entry (never the title menu). */
  get activeEntries(): Locator {
    return this.isCompact()
      ? this.bottomBar.or(this.moreSheet).locator('[aria-current="page"]')
      : this.page.locator('aside').locator('[aria-current="page"]');
  }

  /** The nested view links: desktop sidebar views, compact title-menu items (main view excluded). */
  get viewLinks(): Locator {
    return this.isCompact()
      ? this.viewMenu.locator('[data-testid^="view-menu-item-"]')
      : this.page.locator('aside').locator('[data-testid^="sidebar-view-"]');
  }

  /** Avatar trigger (desktop). Compact (shim): the More button. */
  get userMenuTrigger(): Locator {
    return this.isCompact() ? this.moreButton : this.desktopUserMenuTrigger;
  }

  /** Open user-menu panel (desktop). Compact (shim): the More sheet. */
  get userMenu(): Locator {
    return this.isCompact() ? this.moreSheet : this.desktopUserMenu;
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

  /** Open the user menu (desktop avatar) or, below 1024px, the More sheet. */
  async openUserMenu(): Promise<void> {
    if (this.isCompact()) {
      await this.openMoreSheet();
      return;
    }
    await this.desktopUserMenuTrigger.click();
    await this.desktopUserMenu.waitFor({ state: 'visible' });
  }

  /**
   * A section entry by NavConfig section id. Desktop: `sidebar-section-<id>`. Compact: the
   * bottom-bar slot for home/diary/photos, otherwise the More sheet row (attribute and text
   * assertions work on the closed, inert row).
   */
  sectionLink(id: string): Locator {
    if (!this.isCompact()) return this.page.getByTestId(`sidebar-section-${id}`);
    return BAR_SECTION_IDS.includes(id)
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

  /** Click a section entry (compact: through the bar, or through the More sheet for the rest). */
  async openSection(id: string): Promise<void> {
    if (this.isCompact() && !BAR_SECTION_IDS.includes(id)) await this.openMoreSheet();
    await this.sectionLink(id).click();
  }

  /** Click a nested view (the page must already be inside its section). */
  async openView(route: string): Promise<void> {
    await this.revealViews();
    await this.viewLink(route).click();
  }

  /** @deprecated shim, removed in #2208. Compact: reveal the title menu when the page has one. */
  async openSidebar(): Promise<void> {
    await this.openSidebarIfDrawer();
  }

  /** @deprecated shim, removed in #2208. Compact: reveal the title menu when the page has one. */
  async openSidebarIfDrawer(): Promise<void> {
    if (!this.isCompact()) return;
    await this.bottomBar.waitFor({ state: 'attached' });
    if ((await this.viewMenuTrigger.count()) > 0) await this.revealViews();
  }

  /** @deprecated shim, removed in #2208. Compact: close the title menu or the sheet if open. */
  async closeSidebar(): Promise<void> {
    if (!this.isCompact()) return;
    if (await this.viewMenu.isVisible()) {
      await this.page.keyboard.press('Escape');
      await this.viewMenu.waitFor({ state: 'hidden' });
      return;
    }
    await this.closeMoreSheet();
  }

  /** @deprecated shim, removed in #2208. True when the More sheet is open (compact only). */
  async isSidebarOpen(): Promise<boolean> {
    if (!this.isCompact()) return false;
    return (await this.moreSheet.getAttribute('data-open')) === 'true';
  }

  /** @deprecated shim, removed in #2208. True when the More sheet backdrop is visible. */
  async isOverlayVisible(): Promise<boolean> {
    return await this.moreSheetBackdrop.isVisible();
  }

  async getNavLinks(): Promise<Locator[]> {
    return await this.nav.locator('a').all();
  }

  async clickNavLink(name: string): Promise<void> {
    const link = this.nav.getByRole('link', { name });
    await link.click();
  }

  async isNavLinkActive(name: string): Promise<boolean> {
    const link = this.nav.getByRole('link', { name });
    const ariaCurrent = await link.getAttribute('aria-current');
    return ariaCurrent === 'page';
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

  /** @deprecated shim, removed in #2208. */
  async getMenuButton(): Promise<Locator> {
    return this.menuButton;
  }
}
