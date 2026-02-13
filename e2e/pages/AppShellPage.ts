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
    this.menuButton = page.getByRole('button', { name: /Open menu|Close menu/ });
    this.sidebarCloseButton = page.getByRole('button', { name: 'Close menu' });
    this.nav = page.getByRole('navigation', { name: 'Main navigation' });
    this.overlay = page.locator('div[aria-hidden="true"]').last();
  }

  async openSidebar(): Promise<void> {
    const isOpen = await this.isSidebarOpen();
    if (!isOpen) {
      await this.menuButton.click();
      await this.sidebar.waitFor({ state: 'visible' });
    }
  }

  async closeSidebar(): Promise<void> {
    const isOpen = await this.isSidebarOpen();
    if (isOpen) {
      await this.sidebarCloseButton.click();
      await this.sidebar.waitFor({ state: 'hidden' });
    }
  }

  async isSidebarOpen(): Promise<boolean> {
    // Check if sidebar has 'open' class
    const sidebarClass = await this.sidebar.getAttribute('class');
    return sidebarClass?.includes('open') ?? false;
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
    const className = await link.getAttribute('class');
    return className?.includes('active') ?? false;
  }

  async logout(): Promise<void> {
    const logoutButton = this.nav.getByRole('button', { name: 'Logout' });
    await logoutButton.click();
  }

  async getMenuButton(): Promise<Locator> {
    return this.menuButton;
  }
}
