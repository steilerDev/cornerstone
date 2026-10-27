/**
 * Figure-surface registry for the consistency test (#2232, EPIC-21 P3.5, ADR-039 §7).
 *
 * "One answer per question": every surface that shows a project figure (Left to spend, Still to
 * pay, Ready to submit, ...) or a subject figure (a company's Still to pay, a task's "Holds up n
 * tasks") is registered here with a reader. `figure-consistency.spec.ts` reads every registered
 * surface and asserts it equals the server's answer.
 *
 * Contract (AC3): a story that builds a surface showing one of these figures registers it here in
 * the same PR. A surface that is not built yet is listed in PENDING_SURFACES with the story that
 * owns it; the spec's FC5 fails when such a story's route is served (stage `done`) without the
 * entry moving to PROJECT_SURFACES / SUBJECT_SURFACES.
 *
 * Readers find figures only through `[data-figure="<kind>"]` inside the surface's container
 * (client/src/types/figureKind.ts, the closed list), never by position or label. Money readers
 * return integer cents (`null` = the en dash "no figure yet"); counts return plain numbers. The
 * app runs in English here (`locale=en`), so `parseMoney` reads the en format.
 */

import type { Locator, Page } from '@playwright/test';
import type { ServedRouteId } from '../../shared/src/routes/index.js';
import { routeUrl } from '../../shared/src/routes/index.js';
import { BudgetOverviewPage } from '../pages/BudgetOverviewPage.js';
import { HomePage } from '../pages/HomePage.js';
import { InvoicesPage } from '../pages/InvoicesPage.js';
import { TimelinePage } from '../pages/TimelinePage.js';
import { VendorDetailPage } from '../pages/VendorDetailPage.js';

/** Mirrors client/src/types/figureKind.ts (closed list). */
export type FigureKind = 'left-to-spend' | 'still-to-pay' | 'paid' | 'ready-to-submit' | 'holds-up';
export type ProjectFigure =
  'leftToSpend' | 'stillToPay' | 'stillToPayCount' | 'paid' | 'readyToSubmit';

export interface ProjectSurface {
  /** e.g. 'home.pulse' */
  id: string;
  /** The story that built it, e.g. '3.3' */
  story: string;
  /** Route id: the AC4 unit (at most one Left to spend figure per screen) */
  screen: ServedRouteId;
  /** Navigate and wait until the figures render */
  open(page: Page): Promise<void>;
  /** False when the screen has no figures for the current data. */
  isAvailable?(page: Page): Promise<boolean>;
  /** Cents for money figures, a plain number for counts; null = en dash / absent figure. */
  read: Partial<Record<ProjectFigure, (page: Page) => Promise<number | null>>>;
}

export interface CompanySubject {
  companyId: string;
}
export interface TaskSubject {
  workItemId: string;
}
export interface InvoiceSubject {
  invoiceId: string;
}

export interface SubjectSurface<S> {
  id: string;
  story: string;
  kind: 'company-still-to-pay' | 'holds-up' | 'invoice-paid' | 'invoice-still-to-pay';
  /** Every marker of the kind on the surface (a company page shows its balance twice). */
  readAll(page: Page, subject: S): Promise<Array<number | null>>;
}

export interface PendingSurface {
  story: string;
  /** A route-map id when the story serves a new route (FC5 checks its stage), else a screen name */
  screen: string;
  figures: Array<ProjectFigure | 'company-still-to-pay' | 'holds-up'>;
  note: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a formatted en-locale money text ("€1,234.56", "-€12.00", "−€12.00") into integer cents.
 * The en dash "–" (no figure) and any text without digits give null.
 */
export function parseMoney(text: string): number | null {
  if (!/\d/.test(text)) return null;
  const negative = /[-−]/.test(text);
  const digits = text.replace(/[^\d.]/g, '');
  const value = Math.round(Number(digits) * 100);
  if (Number.isNaN(value)) return null;
  return negative ? -value : value;
}

/** The first whole number in a text ("Holds up 2 tasks · ..." gives 2). */
export function firstInteger(text: string): number | null {
  const match = /\d+/.exec(text);
  return match ? Number(match[0]) : null;
}

async function figureText(locator: Locator): Promise<string> {
  await locator.waitFor({ state: 'visible' });
  return (await locator.innerText()).replace(/\s+/g, ' ').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Project figures
// ─────────────────────────────────────────────────────────────────────────────

export const PROJECT_SURFACES: ProjectSurface[] = [
  {
    id: 'home.pulse',
    story: '3.3',
    screen: 'home',
    async open(page) {
      const home = new HomePage(page);
      await home.goto();
      await home.pulseTile('left-to-spend').waitFor({ state: 'visible' });
    },
    read: {
      async leftToSpend(page) {
        const home = new HomePage(page);
        return parseMoney(await figureText(home.pulseFigure('left-to-spend')));
      },
      async stillToPay(page) {
        const home = new HomePage(page);
        return parseMoney(await figureText(home.pulseFigure('still-to-pay')));
      },
      async stillToPayCount(page) {
        const home = new HomePage(page);
        const tile = await figureText(home.pulseTile('still-to-pay'));
        return /(\d+)\s+open/.exec(tile) ? Number(/(\d+)\s+open/.exec(tile)![1]) : null;
      },
    },
  },
  {
    id: 'money.overview',
    story: '4.5',
    screen: 'budgetOverview',
    async open(page) {
      const overview = new BudgetOverviewPage(page);
      await overview.goto();
      await overview.waitForLoaded();
      await overview.leftToSpendFigure.waitFor({ state: 'visible' });
    },
    read: {
      async leftToSpend(page) {
        const overview = new BudgetOverviewPage(page);
        return parseMoney(
          await figureText(overview.headline.locator('[data-figure="left-to-spend"]')),
        );
      },
      async paid(page) {
        const overview = new BudgetOverviewPage(page);
        return parseMoney(await figureText(overview.summary.locator('[data-figure="paid"]')));
      },
      async stillToPay(page) {
        const overview = new BudgetOverviewPage(page);
        return parseMoney(
          await figureText(overview.summary.locator('[data-figure="still-to-pay"]')),
        );
      },
    },
  },
  {
    id: 'invoices.toPay',
    story: '4.6',
    screen: 'invoices',
    async open(page) {
      const invoices = new InvoicesPage(page);
      await invoices.goto();
      await invoices.waitForLoaded();
      await invoices.footer.waitFor({ state: 'visible' });
    },
    // The To pay chip footer: "Still to pay" while no search or filter is active. There is no
    // Paid footer (a Paid-chip sum is not the money service's Paid) and the Ready to submit card
    // is retired (D-30); Financing (4.10) brings it back.
    read: {
      async stillToPay(page) {
        const invoices = new InvoicesPage(page);
        return parseMoney(
          await figureText(invoices.footer.locator('[data-figure="still-to-pay"]')),
        );
      },
    },
  },
];

/** AC4: the screens that must show at most one Left to spend figure. */
export const LEFT_SCREENS: ServedRouteId[] = ['home', 'budgetOverview', 'invoices', 'company'];

// ─────────────────────────────────────────────────────────────────────────────
// Subject figures
// ─────────────────────────────────────────────────────────────────────────────

export const COMPANY_SURFACE: SubjectSurface<CompanySubject> = {
  id: 'company.page',
  story: '3.5',
  kind: 'company-still-to-pay',
  async readAll(page, subject) {
    await page.goto(routeUrl('company', { id: subject.companyId }));
    const vendor = new VendorDetailPage(page);
    await vendor.stillToPayFigures.first().waitFor({ state: 'visible' });
    const texts = await vendor.stillToPayFigures.allInnerTexts();
    return texts.map((text) => parseMoney(text));
  },
};

export const HOME_ATTENTION_SURFACE: SubjectSurface<TaskSubject & { groupKey?: string }> = {
  id: 'home.needsAttention',
  story: '3.3',
  kind: 'holds-up',
  async readAll(page, subject) {
    const home = new HomePage(page);
    await home.goto();
    await home.needsAttention.waitFor({ state: 'visible' });
    const figure = home.holdsUpFigure(subject.workItemId);
    if ((await figure.count()) === 0 && (await home.showAllButton.isVisible())) {
      await home.showAllButton.click();
    }
    if (subject.groupKey) {
      const toggle = home.groupToggle(subject.groupKey);
      if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
    }
    await figure.first().waitFor({ state: 'visible' });
    const texts = await figure.allInnerTexts();
    return texts.map((text) => firstInteger(text));
  },
};

export const SCHEDULE_TOOLTIP_SURFACE: SubjectSurface<TaskSubject> = {
  id: 'schedule.tooltip',
  story: '3.5',
  kind: 'holds-up',
  async readAll(page, subject) {
    const timeline = new TimelinePage(page);
    await timeline.goto();
    await timeline.waitForLoaded();
    const bar = timeline.ganttBar(subject.workItemId);
    await bar.waitFor({ state: 'visible' });
    await bar.hover();
    await timeline.tooltip.waitFor({ state: 'visible' });
    const texts = await timeline.tooltipHoldsUpFigure.allInnerTexts();
    return texts.map((text) => firstInteger(text));
  },
};

/** The summary strip of an offer or invoice page (#2239, story 4.7): its Paid and Still to pay. */
async function readInvoiceStrip(
  page: Page,
  subject: InvoiceSubject,
  kind: 'paid' | 'still-to-pay',
): Promise<Array<number | null>> {
  await page.goto(routeUrl('invoice', { id: subject.invoiceId }));
  const strip = page.getByTestId('invoice-summary');
  await strip.waitFor({ state: 'visible' });
  // The Amount fact is always present: the strip has rendered its facts
  await strip.getByTestId('summary-fact-amount').waitFor({ state: 'visible' });
  const texts = await strip.locator(`[data-figure="${kind}"]`).allInnerTexts();
  return texts.map((text) => parseMoney(text));
}

export const INVOICE_PAID_SURFACE: SubjectSurface<InvoiceSubject> = {
  id: 'invoice.page.paid',
  story: '4.7',
  kind: 'invoice-paid',
  readAll: (page, subject) => readInvoiceStrip(page, subject, 'paid'),
};

export const INVOICE_STILL_TO_PAY_SURFACE: SubjectSurface<InvoiceSubject> = {
  id: 'invoice.page.stillToPay',
  story: '4.7',
  kind: 'invoice-still-to-pay',
  readAll: (page, subject) => readInvoiceStrip(page, subject, 'still-to-pay'),
};

export const SUBJECT_SURFACES = [
  COMPANY_SURFACE,
  HOME_ATTENTION_SURFACE,
  SCHEDULE_TOOLTIP_SURFACE,
  INVOICE_PAID_SURFACE,
  INVOICE_STILL_TO_PAY_SURFACE,
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Not built yet
// ─────────────────────────────────────────────────────────────────────────────

export const PENDING_SURFACES: PendingSurface[] = [
  {
    story: '4.10',
    screen: 'financing',
    figures: ['readyToSubmit', 'paid'],
    note: 'Financing: per-source Ready to submit and Paid. Served when the financing route is done.',
  },
  {
    story: '4.12',
    screen: 'Company summary',
    figures: ['company-still-to-pay'],
    note: 'The company page summary, now labelled Still to pay (today: Outstanding Balance).',
  },
  {
    story: '5.2',
    screen: 'Task page',
    figures: ['holds-up'],
    note: 'Holds up n tasks on the task page.',
  },
  {
    story: '5.3',
    screen: 'Reschedule preview',
    figures: ['holds-up'],
    note: 'The Reschedule preview names the tasks it would move.',
  },
];
