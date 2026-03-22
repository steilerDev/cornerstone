/**
 * Page Object Model for the AppShell layout (sidebar + header)
 */

import type { Page, Locator } from '@playwright/test';

export class AppShellPage {
  readonly page: Page;
  readonly sidebar: Locator;
  readonly menuButton: Locator;
  readonly sidebarCloseButton: Locator;
  readonly nav: Locator;
  readonly overlay: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sidebar = page.locator('aside');
    // AppShell renders a floating action button with data-testid="menu-fab" — no <header> element.
    // The FAB is the only menu toggle button; it is outside the sidebar (aside).
    // When sidebar is open, the FAB aria-label becomes "Close menu" (from t('aria.closeMenu')).
    // There is NO close button inside the <aside> — PR #1168 removed it.
    this.menuButton = page.getByTestId('menu-fab');
    // sidebarCloseButton is the FAB itself (it toggles: open→close, close→open).
    // We keep it as a separate property for API compatibility; it points to the same FAB.
    this.sidebarCloseButton = page.getByTestId('menu-fab');
    this.nav = page.getByRole('navigation', { name: 'Main navigation' });
    // Overlay uses data-testid="sidebar-overlay" (AppShell.tsx) — not a generic div[aria-hidden].
    this.overlay = page.getByTestId('sidebar-overlay');
  }

  async openSidebar(): Promise<void> {
    // Wait for the sidebar element to be present in the DOM before reading its state.
    // On mobile, the React app shell may not have finished rendering when openSidebar()
    // is called immediately after page.goto(), causing isSidebarOpen() to read a
    // null attribute and menuButton.click() to race against the mount cycle.
    await this.sidebar.waitFor({ state: 'attached' });
    const isOpen = await this.isSidebarOpen();
    if (!isOpen) {
      await this.menuButton.click();
      // Wait for data-open attribute to become "true" (sidebar CSS uses transform, not display)
      await this.page.locator('aside[data-open="true"]').waitFor();
    }
  }

  async closeSidebar(): Promise<void> {
    // Wait for the sidebar element to be present in the DOM before reading its state.
    await this.sidebar.waitFor({ state: 'attached' });
    const isOpen = await this.isSidebarOpen();
    if (isOpen) {
      await this.sidebarCloseButton.click();
      // Wait for data-open attribute to become "false"
      await this.page.locator('aside[data-open="false"]').waitFor();
    }
  }

  async isSidebarOpen(): Promise<boolean> {
    // Wait for the sidebar to appear in the DOM. On mobile WebKit, React
    // hydration can be slow; if the sidebar never appears (e.g., page
    // redirected to /login due to session invalidation), return false
    // to let the test fail on the subsequent assertion with a clearer message.
    try {
      await this.sidebar.waitFor({ state: 'attached', timeout: 15000 });
    } catch {
      return false;
    }
    const dataOpen = await this.sidebar.getAttribute('data-open');
    return dataOpen === 'true';
  }

  async isOverlayVisible(): Promise<boolean> {
    return await this.overlay.isVisible();
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

  async logout(): Promise<void> {
    const logoutButton = this.sidebar.getByRole('button', { name: 'Logout' });
    await logoutButton.click();
  }

  async getMenuButton(): Promise<Locator> {
    return this.menuButton;
  }
}
