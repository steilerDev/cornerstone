/**
 * Page Object Model for the AppShell layout (sidebar + header)
 */

import type { Page, Locator } from '@playwright/test';

export class AppShellPage {
  readonly page: Page;
  readonly header: Locator;
  readonly sidebar: Locator;
  readonly menuButton: Locator;
  readonly sidebarCloseButton: Locator;
  readonly nav: Locator;
  readonly overlay: Locator;

  constructor(page: Page) {
    this.page = page;
    this.header = page.locator('header');
    this.sidebar = page.locator('aside');
    // Scope menuButton to header to avoid strict mode violation
    // (sidebar also has a "Close menu" button)
    this.menuButton = page.locator('header').getByRole('button', { name: /Open menu|Close menu/ });
    // Scope sidebarCloseButton to aside to avoid matching header button when both say "Close menu"
    this.sidebarCloseButton = page.locator('aside').getByRole('button', { name: 'Close menu' });
    this.nav = page.getByRole('navigation', { name: 'Main navigation' });
    this.overlay = page.locator('div[aria-hidden="true"]').last();
  }

  async openSidebar(): Promise<void> {
    const isOpen = await this.isSidebarOpen();
    if (!isOpen) {
      await this.menuButton.click();
      // Wait for data-open attribute to become "true" (sidebar CSS uses transform, not display)
      await this.page.locator('aside[data-open="true"]').waitFor({ timeout: 5000 });
    }
  }

  async closeSidebar(): Promise<void> {
    const isOpen = await this.isSidebarOpen();
    if (isOpen) {
      await this.sidebarCloseButton.click();
      // Wait for data-open attribute to become "false"
      await this.page.locator('aside[data-open="false"]').waitFor({ timeout: 5000 });
    }
  }

  async isSidebarOpen(): Promise<boolean> {
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
