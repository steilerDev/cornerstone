/**
 * E2E tests for the Company page on the detail template (#2244, EPIC-21 P4.12) and the Companies
 * list money columns.
 *
 * Scenarios (numbering follows the E2E spec of #2244)
 *   1   AC1  Breadcrumb "Companies", Companies is the one active entry, tabs in order, exactly one
 *            primary "Call" with a `tel:` href (@responsive)
 *   2   D2   No company phone: the first contact person with a number is called; the accessible
 *            name carries the person
 *   3   D1   No number anywhere: "Add phone number" selects Overview and focuses Phone; Save turns
 *            the primary into Call
 *   4   AC2  Summary strip values against the API seeds; Trade links to the filtered list; every
 *            other fact selects its tab
 *   5   AC3  Contact persons: empty state, validation, create, edit, call link, Remove + Undo
 *   5b  AC7  The Phone and e-mail, Address and About cards edit and save on their own
 *   6   AC4  Payments: totals, Invoices / Offers / Progress payments, row links, New invoice,
 *            submitted note; a progress payment row opens `?payment=`
 *   6b  AC10 Row Delete: confirm, focus returns where it should, figures follow
 *   7   AC5  Work tab lists; Site diary lists entries and "Show all" past 20
 *   8   AC6  Companies list: Still to pay (sortable) and Offers columns, phone card
 *   9   AC9  Layout: compact strip on desktop and phone (@responsive)
 *   10       History tab shows a status change of the company's invoice
 *
 * All names, numbers and e-mails are synthetic. The E2E database is shared by parallel workers,
 * so every record carries the per-worker `testPrefix` and is removed in afterEach.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { createDiaryEntryViaApi, deleteDiaryEntryViaApi } from '../../fixtures/apiHelpers.js';
import {
  createCostLine,
  createFundingSource,
  newCleanup,
  runCleanup,
} from '../../fixtures/costLineSeed.js';
import type { SeedCleanup } from '../../fixtures/costLineSeed.js';
import { API } from '../../fixtures/testData.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { InvoiceFormDialog } from '../../pages/components/InvoiceFormDialog.js';
import { VendorDetailPage } from '../../pages/VendorDetailPage.js';
import { VendorsPage } from '../../pages/VendorsPage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Seeding
// ─────────────────────────────────────────────────────────────────────────────

let cleanup: SeedCleanup;

test.beforeEach(() => {
  cleanup = newCleanup();
});

test.afterEach(async () => {
  await runCleanup(cleanup);
});

interface CompanySeed {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  tradeId?: string | null;
}

/** A company; deleted last (cleanup runs newest first, so records seeded later go first). */
async function createCompany(page: Page, data: CompanySeed): Promise<string> {
  const response = await page.request.post(API.vendors, { data });
  expect(response.ok(), `POST company "${data.name}": ${response.status()}`).toBeTruthy();
  const id = ((await response.json()) as { vendor: { id: string } }).vendor.id;
  cleanup.fns.push(async () => {
    await page.request.delete(`${API.vendors}/${id}`);
  });
  return id;
}

async function createContact(
  page: Page,
  companyId: string,
  data: { firstName: string; lastName: string; role?: string; phone?: string },
): Promise<string> {
  const response = await page.request.post(`${API.vendors}/${companyId}/contacts`, { data });
  expect(response.ok(), `POST contact: ${response.status()}`).toBeTruthy();
  return ((await response.json()) as { contact: { id: string } }).contact.id;
}

type RecordStatus = 'quotation' | 'pending' | 'paid' | 'claimed';

async function createRecord(
  page: Page,
  companyId: string,
  data: {
    invoiceNumber: string;
    amount: number;
    status: RecordStatus;
    date?: string;
    dueDate?: string;
  },
): Promise<string> {
  const response = await page.request.post(`${API.vendors}/${companyId}/invoices`, {
    data: { date: '2026-03-01', ...data },
  });
  expect(response.ok(), `POST invoice ${data.invoiceNumber}: ${response.status()}`).toBeTruthy();
  const id = ((await response.json()) as { invoice: { id: string } }).invoice.id;
  cleanup.fns.push(async () => {
    await page.request.delete(`${API.vendors}/${companyId}/invoices/${id}`);
  });
  return id;
}

/** A progress payment that is already paid. */
async function createPaidProgressPayment(
  page: Page,
  invoiceId: string,
  amount: number,
): Promise<string> {
  const created = await page.request.post(`/api/invoices/${invoiceId}/deposits`, {
    data: { amount, dueDate: '2026-03-10', status: 'pending' },
  });
  expect(created.ok(), `POST progress payment: ${created.status()}`).toBeTruthy();
  const id = ((await created.json()) as { deposit: { id: string } }).deposit.id;
  const paid = await page.request.patch(`/api/invoices/${invoiceId}/deposits/${id}`, {
    data: { status: 'paid', paidDate: '2026-03-11' },
  });
  expect(paid.ok(), `PATCH progress payment paid: ${paid.status()}`).toBeTruthy();
  return id;
}

async function createTaskFor(
  page: Page,
  companyId: string,
  title: string,
  status = 'not_started',
): Promise<string> {
  const response = await page.request.post(API.workItems, {
    data: { title, assignedVendorId: companyId, status },
  });
  expect(response.ok(), `POST task "${title}": ${response.status()}`).toBeTruthy();
  const id = ((await response.json()) as { id: string }).id;
  cleanup.fns.push(async () => {
    await page.request.delete(`${API.workItems}/${id}`);
  });
  return id;
}

async function createPurchaseFor(page: Page, companyId: string, name: string): Promise<string> {
  const response = await page.request.post(API.householdItems, {
    data: { name, category: 'hic-other', status: 'planned', vendorId: companyId },
  });
  expect(response.ok(), `POST purchase "${name}": ${response.status()}`).toBeTruthy();
  const id = ((await response.json()) as { householdItem: { id: string } }).householdItem.id;
  cleanup.fns.push(async () => {
    await page.request.delete(`${API.householdItems}/${id}`);
  });
  return id;
}

async function createDailyLog(
  page: Page,
  companyId: string,
  entryDate: string,
  title: string,
): Promise<string> {
  const id = await createDiaryEntryViaApi(page, {
    entryType: 'daily_log',
    entryDate,
    title,
    body: `${title} body`,
    metadata: { vendorId: companyId },
  });
  cleanup.fns.push(async () => {
    await deleteDiaryEntryViaApi(page, id);
  });
  return id;
}

/** The company as the API serves it (the figures the page must show). */
async function getCompany(
  page: Page,
  id: string,
): Promise<{ stillToPay: number; paid: number; invoiceCount: number }> {
  const response = await page.request.get(`${API.vendors}/${id}`);
  expect(response.ok(), `GET company: ${response.status()}`).toBeTruthy();
  return (
    (await response.json()) as {
      vendor: { stillToPay: number; paid: number; invoiceCount: number };
    }
  ).vendor;
}

const amount = (whole: string): RegExp => new RegExp(whole.replace('.', '\\.'));

/** A company with a pending invoice (200 paid), a submitted one, a paid one and an offer. */
async function seedPayments(
  page: Page,
  testPrefix: string,
  label: string,
): Promise<{
  companyId: string;
  name: string;
  pendingId: string;
  pendingNumber: string;
  submittedId: string;
  paidId: string;
  paidNumber: string;
  offerId: string;
  offerNumber: string;
  paymentId: string;
}> {
  const name = `${testPrefix} ${label} Roofing Ltd`;
  const companyId = await createCompany(page, { name, phone: '555-0140' });
  const pendingNumber = `${testPrefix}-${label}-PEND`;
  const paidNumber = `${testPrefix}-${label}-PAID`;
  const offerNumber = `${testPrefix}-${label}-OFR`;
  const pendingId = await createRecord(page, companyId, {
    invoiceNumber: pendingNumber,
    amount: 1000,
    status: 'pending',
    dueDate: '2026-04-15',
  });
  const paymentId = await createPaidProgressPayment(page, pendingId, 200);
  const submittedId = await createRecord(page, companyId, {
    invoiceNumber: `${testPrefix}-${label}-SUB`,
    amount: 500,
    status: 'claimed',
  });
  const paidId = await createRecord(page, companyId, {
    invoiceNumber: paidNumber,
    amount: 300,
    status: 'paid',
  });
  const offerId = await createRecord(page, companyId, {
    invoiceNumber: offerNumber,
    amount: 2000,
    status: 'quotation',
  });
  return {
    companyId,
    name,
    pendingId,
    pendingNumber,
    submittedId,
    paidId,
    paidNumber,
    offerId,
    offerNumber,
    paymentId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 - AC1: header, breadcrumb, tabs, one primary
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company page - header (AC1)', { tag: '@responsive' }, () => {
  test('C1: trail "Companies", Companies is the one active entry, tabs in order, one Call with a tel: href', async ({
    page,
    testPrefix,
  }) => {
    const name = `${testPrefix} Example Roofing Ltd`;
    const id = await createCompany(page, { name, phone: '555-0140' });
    const company = new VendorDetailPage(page);
    const shell = new AppShellPage(page);

    await company.goto(id);
    await expect(company.header.heading).toHaveText(name);
    await company.breadcrumbs.expectTrail(['Companies']);
    await expect(shell.activeEntries).toHaveCount(1);
    await expect(shell.sectionLink('companies')).toHaveAttribute('aria-current', 'page');

    await expect(company.tabs.tablist.getByRole('tab')).toHaveText([
      /^Overview/,
      /^Work/,
      /^Payments/,
      /^Site diary/,
      /^History/,
    ]);
    await expect(company.tabs.selected).toHaveCount(1);
    await expect(company.tabs.tab('overview')).toHaveAttribute('aria-selected', 'true');

    // Exactly one primary: the Call link
    await expect(company.header.root.getByTestId('company-primary-call')).toHaveCount(1);
    await expect(company.primaryCall).toHaveText('Call');
    await expect(company.primaryCall).toHaveAttribute('href', 'tel:5550140');
    await expect(company.primaryAddPhone).toHaveCount(0);
  });

  test('C1b: an unknown company id shows the error card and a way back', async ({ page }) => {
    const company = new VendorDetailPage(page);
    await page.goto(routeUrl('company', { id: 'nonexistent-company-id-12345' }));

    await expect(company.errorCard).toBeVisible();
    await expect(company.errorCard).toContainText('does not exist');
    await expect(company.summary.root).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2, 3 - D2 / D1: which number the primary uses
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company page - primary phone rule', { tag: '@responsive' }, () => {
  test('C2: without a company phone the first contact person with a number is called', async ({
    page,
    testPrefix,
  }) => {
    const id = await createCompany(page, { name: `${testPrefix} Example Plumbing Ltd` });
    await createContact(page, id, { firstName: 'Alex', lastName: 'Silent' });
    await createContact(page, id, { firstName: 'Sam', lastName: 'Sample', phone: '555-0142' });
    const company = new VendorDetailPage(page);

    await company.goto(id);
    await expect(company.primaryCall).toHaveAttribute('href', 'tel:5550142');
    await expect(company.primaryCall).toHaveAccessibleName(/Sam Sample/);
    await expect(company.primaryAddPhone).toHaveCount(0);
  });

  test('C3: no number anywhere - "Add phone number" selects Overview, focuses Phone; Save makes it Call', async ({
    page,
    testPrefix,
  }) => {
    const id = await createCompany(page, { name: `${testPrefix} Example Tiling Ltd` });
    const company = new VendorDetailPage(page);

    // From another tab: the click selects Overview first
    await company.goto(id, 'work');
    await expect(company.tabs.tab('work')).toHaveAttribute('aria-selected', 'true');
    await expect(company.primaryCall).toHaveCount(0);
    await expect(company.primaryAddPhone).toHaveText('Add phone number');
    await company.primaryAddPhone.click();

    await expect(company.tabs.tab('overview')).toHaveAttribute('aria-selected', 'true');
    await expect(company.cardForm('company-phone-email')).toBeVisible();
    await expect(company.phoneField).toBeFocused();

    await company.phoneField.fill('555-0150');
    await company.saveCard('company-phone-email');

    await expect(company.primaryAddPhone).toHaveCount(0);
    await expect(company.primaryCall).toHaveAttribute('href', 'tel:5550150');
    await expect(company.detail('phone')).toContainText('555-0150');
  });

  test('C3b: on Overview "Add phone number" opens the Phone and e-mail card at once', async ({
    page,
    testPrefix,
  }) => {
    const id = await createCompany(page, { name: `${testPrefix} Example Glazing Ltd` });
    const company = new VendorDetailPage(page);

    await company.goto(id);
    await company.primaryAddPhone.click();
    await expect(company.phoneField).toBeFocused();
    // Nothing typed: Cancel closes without asking
    await company.cancelCard('company-phone-email');
    await expect(company.primaryAddPhone).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 - AC2: summary strip
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company page - summary strip (AC2)', { tag: '@responsive' }, () => {
  test('C4: the five facts show the seeded values and each fact opens its target', async ({
    page,
    testPrefix,
  }) => {
    const name = `${testPrefix} Example Tiling Ltd`;
    const id = await createCompany(page, { name, phone: '555-0140', tradeId: 'trade-tiling' });
    const pendingId = await createRecord(page, id, {
      invoiceNumber: `${testPrefix}-C4-INV`,
      amount: 1000,
      status: 'pending',
    });
    await createPaidProgressPayment(page, pendingId, 200);
    await createRecord(page, id, {
      invoiceNumber: `${testPrefix}-C4-OFR`,
      amount: 1200,
      status: 'quotation',
    });
    await createTaskFor(page, id, `${testPrefix} C4 open task`);
    await createTaskFor(page, id, `${testPrefix} C4 done task`, 'completed');
    // Two dates, three logs: On site counts distinct days
    await createDailyLog(page, id, '2026-02-10', `${testPrefix} C4 log a`);
    await createDailyLog(page, id, '2026-02-10', `${testPrefix} C4 log b`);
    await createDailyLog(page, id, '2026-02-12', `${testPrefix} C4 log c`);
    const company = new VendorDetailPage(page);

    await company.goto(id);
    await expect(company.summary.fact('trade')).toContainText('Tiling');
    expect(await company.summary.factIds()).toEqual([
      'trade',
      'stillToPay',
      'offers',
      'tasks',
      'onSite',
    ]);
    await expect(company.summary.fact('stillToPay')).toContainText(amount('800.00'));
    await expect(company.summary.figure('still-to-pay')).toHaveCount(1);
    await expect(company.summary.fact('offers')).toContainText(amount('1,200.00'));
    await expect(company.summary.fact('offers')).toContainText('paid');
    await expect(company.summary.fact('tasks')).toContainText('1 open');
    await expect(company.summary.fact('onSite')).toContainText('2 days');
    await expect(company.summary.fact('onSite')).toContainText('last');

    // Trade opens the Companies list filtered by that trade
    await expect(company.summary.fact('trade')).toHaveAttribute(
      'href',
      /\/companies\?.*tradeId=trade-tiling/,
    );

    // Every other fact selects its tab (replace navigation: `?tab=`)
    const targets: Array<[string, 'payments' | 'work' | 'diary']> = [
      ['stillToPay', 'payments'],
      ['offers', 'payments'],
      ['tasks', 'work'],
      ['onSite', 'diary'],
    ];
    for (const [fact, tab] of targets) {
      await company.goto(id);
      await company.summary.fact(fact).click();
      await expect(company.tabs.tab(tab)).toHaveAttribute('aria-selected', 'true');
      await expect(page).toHaveURL((url) => url.searchParams.get('tab') === tab);
    }
  });

  test('C4b: Trade link opens the filtered list', async ({ page, testPrefix }) => {
    const name = `${testPrefix} Example Painting Ltd`;
    const id = await createCompany(page, { name, tradeId: 'trade-tiling' });
    const company = new VendorDetailPage(page);
    const list = new VendorsPage(page);

    await company.goto(id);
    await company.summary.fact('trade').click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('companies') &&
        url.searchParams.get('tradeId') === 'trade-tiling',
    );
    await expect(list.heading).toBeVisible();
  });

  test('C4c: a company with nothing recorded shows dashes and "None" instead of numbers', async ({
    page,
    testPrefix,
  }) => {
    const id = await createCompany(page, { name: `${testPrefix} Example Empty Ltd` });
    const company = new VendorDetailPage(page);

    await company.goto(id);
    await expect(company.summary.fact('trade')).toContainText('Not set');
    await expect(company.summary.fact('stillToPay')).toContainText(amount('0.00'));
    await expect(company.summary.fact('offers')).toContainText('None');
    await expect(company.summary.fact('tasks')).toContainText('None open');
    await expect(company.summary.fact('onSite')).toContainText('None yet');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5 - AC3: contact persons
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company page - contact persons (AC3)', { tag: '@responsive' }, () => {
  test('C5: empty state, validation, create, edit and the row Call link', async ({
    page,
    testPrefix,
  }) => {
    const id = await createCompany(page, { name: `${testPrefix} Example Joinery Ltd` });
    const company = new VendorDetailPage(page);
    await company.goto(id);

    await expect(company.contacts.emptyMessage(/No contact persons yet/)).toBeVisible();
    await expect(company.primaryAddPhone).toBeVisible();

    // Validation: a name is required, the dialog stays open
    await company.openNewContact();
    await company.newContactDialog.save();
    await expect(company.newContactDialog.fieldError('firstName')).toHaveText(
      'Enter a first or last name.',
    );
    await expect(company.newContactDialog.dialog).toBeVisible();
    await company.newContactDialog.cancel();
    await company.newContactDialog.waitForClosed();

    // Create
    await company.addContact({
      firstName: 'Jane',
      lastName: 'Sample',
      role: 'Site manager',
      phone: '555-0145',
      email: 'jane.sample@example.com',
    });
    const row = company.contactRow('Jane Sample');
    await expect(row).toBeVisible();
    await expect(row).toContainText('Site manager');
    await expect(row).toContainText('555-0145');
    await expect(row.getByRole('link', { name: 'jane.sample@example.com' })).toHaveAttribute(
      'href',
      'mailto:jane.sample@example.com',
    );
    await expect(company.contacts.heading).toContainText('(1)');

    // The new person's number becomes the primary Call
    await expect(company.primaryCall).toHaveAttribute('href', 'tel:5550145');
    await expect(company.primaryAddPhone).toHaveCount(0);

    // The row Call link
    const contactId = (await row.getAttribute('data-testid'))!.replace('company-contacts-row-', '');
    await expect(page.getByTestId(`company-contacts-call-${contactId}`)).toHaveAttribute(
      'href',
      'tel:5550145',
    );

    // Edit
    await company.editContact(contactId, { lastName: 'Example', role: 'Foreman' });
    await expect(company.contactRow('Jane Example')).toContainText('Foreman');
    await expect(company.contactRow('Jane Sample')).toHaveCount(0);
  });

  test('C5b: Remove acts at once with an Undo toast; Undo restores the person', async ({
    page,
    testPrefix,
  }) => {
    const id = await createCompany(page, { name: `${testPrefix} Example Masonry Ltd` });
    const contactId = await createContact(page, id, {
      firstName: 'Casey',
      lastName: 'Sample',
      phone: '555-0146',
    });
    const company = new VendorDetailPage(page);
    await company.goto(id);

    await expect(company.contactRow('Casey Sample')).toBeVisible();
    await expect(company.primaryCall).toHaveAttribute('href', 'tel:5550146');

    await company.contacts.remove(contactId);
    await expect(company.contactRow('Casey Sample')).toHaveCount(0);
    await expect(company.toasts.undoToastWith(/Casey Sample removed/)).toBeVisible();
    // The page refreshed: the person's number no longer drives the primary
    await expect(company.primaryAddPhone).toBeVisible();

    await company.toasts.undoViaButton();
    await expect(company.contactRow('Casey Sample')).toBeVisible();
    await expect(company.primaryCall).toHaveAttribute('href', 'tel:5550146');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b - AC7: Overview cards
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company page - Overview cards (AC7)', { tag: '@responsive' }, () => {
  test('C6: each card edits and saves on its own; the header follows the new name and phone', async ({
    page,
    testPrefix,
  }) => {
    const name = `${testPrefix} Example Carpentry Ltd`;
    const id = await createCompany(page, {
      name,
      phone: '555-0140',
      email: 'old@example.com',
      address: '1 Sample Lane, Exampleville',
      notes: 'Original notes',
    });
    const company = new VendorDetailPage(page);
    await company.goto(id);

    await expect(company.detail('phone')).toContainText('555-0140');
    await expect(company.detail('email')).toContainText('old@example.com');
    await expect(company.detail('address')).toContainText('1 Sample Lane, Exampleville');
    await expect(company.detail('notes')).toContainText('Original notes');

    // Phone and e-mail
    await company.startEdit('company-phone-email');
    await company.phoneField.fill('555-0199');
    await company.emailField.fill('new@example.com');
    await company.saveCard('company-phone-email');
    await expect(company.detail('phone')).toContainText('555-0199');
    await expect(company.detail('email')).toContainText('new@example.com');
    await expect(company.primaryCall).toHaveAttribute('href', 'tel:5550199');

    // Address
    await company.startEdit('company-address');
    await company.addressField.fill('2 Sample Road, Exampleville');
    await company.saveCard('company-address');
    await expect(company.detail('address')).toContainText('2 Sample Road, Exampleville');

    // About: name and notes
    await company.startEdit('company-about');
    await company.nameField.fill(`${name} Renamed`);
    await company.notesField.fill('Updated notes');
    await company.saveCard('company-about');
    await expect(company.detail('name')).toContainText(`${name} Renamed`);
    await expect(company.detail('notes')).toContainText('Updated notes');
    await expect(company.header.heading).toHaveText(`${name} Renamed`);

    // Persisted
    await page.reload();
    await expect(company.header.heading).toHaveText(`${name} Renamed`);
    await expect(company.detail('phone')).toContainText('555-0199');
    await expect(company.detail('address')).toContainText('2 Sample Road, Exampleville');
  });

  test('C6b: an empty name and an invalid e-mail are reported on their fields and nothing is saved', async ({
    page,
    testPrefix,
  }) => {
    const name = `${testPrefix} Example Roofing Co`;
    const id = await createCompany(page, { name, email: 'ok@example.com' });
    const company = new VendorDetailPage(page);
    await company.goto(id);

    await company.startEdit('company-about');
    await company.nameField.fill('');
    await company.cardSave('company-about').click();
    await expect(company.cardForm('company-about')).toContainText('Enter a name.');
    await expect(company.cardForm('company-about')).toBeVisible();
    await company.discardCard('company-about');
    await expect(company.detail('name')).toContainText(name);

    await company.startEdit('company-phone-email');
    await company.emailField.fill('not-an-address');
    await company.cardSave('company-phone-email').click();
    await expect(company.cardForm('company-phone-email')).toContainText(
      'Enter a valid e-mail address.',
    );
    await company.discardCard('company-phone-email');
    await expect(company.detail('email')).toContainText('ok@example.com');
  });

  test('C6c: cancelling a card restores the stored value', async ({ page, testPrefix }) => {
    const id = await createCompany(page, {
      name: `${testPrefix} Example Cancel Co`,
      phone: '555-0147',
    });
    const company = new VendorDetailPage(page);
    await company.goto(id);

    await company.startEdit('company-phone-email');
    await company.phoneField.fill('555-0000');
    // A changed card asks before discarding
    await company.discardCard('company-phone-email');
    await expect(company.detail('phone')).toContainText('555-0147');
    await expect(company.primaryCall).toHaveAttribute('href', 'tel:5550147');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6 - AC4 / AC10: Payments
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company page - Payments (AC4)', { tag: '@responsive' }, () => {
  test('C7: totals, the three lists and the submitted note come from the money service', async ({
    page,
    testPrefix,
  }) => {
    const seed = await seedPayments(page, testPrefix, 'C7');
    const company = new VendorDetailPage(page);

    await company.goto(seed.companyId, 'payments');
    await company.waitForPaymentsLoaded();

    // 1000 pending less 200 paid = 800 still to pay; the submitted invoice never counts
    const api = await getCompany(page, seed.companyId);
    expect(Math.round(api.stillToPay * 100)).toBe(80000);
    await expect(company.stillToPayFigure).toContainText(amount('800.00'));
    await expect(company.paidFigure).toContainText(
      amount(
        api.paid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      ),
    );
    await expect(company.paymentsTotals).toContainText('Paid');
    await expect(company.paymentsTotals).toContainText('Still to pay');
    // The strip and the totals line agree
    await expect(company.stillToPayFigures.filter({ visible: true })).toHaveCount(2);
    await expect(company.summary.figure('still-to-pay')).toHaveText(/800\.00/);

    await expect(company.submittedNote).toContainText('1 submitted invoice is not counted');

    // Invoices: pending, submitted, paid (in that order); one offer; one progress payment
    await expect(company.invoices.heading).toContainText('(3)');
    await expect(company.invoices.rows).toHaveCount(3);
    await expect(company.invoices.rows.first()).toContainText(seed.pendingNumber);
    await expect(company.invoices.row(seed.pendingId)).toContainText('Still to pay');
    await expect(company.invoices.row(seed.pendingId)).toContainText('Due');
    await expect(company.invoices.row(seed.paidId)).toContainText(amount('300.00'));
    await expect(company.offers.heading).toContainText('(1)');
    await expect(company.offers.row(seed.offerId)).toContainText('Remaining on offer');
    await expect(company.progressPayments.heading).toContainText('(1)');
    await expect(company.progressPayments.row(seed.paymentId)).toContainText(seed.pendingNumber);
    await expect(company.progressPayments.row(seed.paymentId)).toContainText(amount('200.00'));
  });

  test('C7b: a row opens its invoice with Back to the company; the invoice company link returns', async ({
    page,
    testPrefix,
  }) => {
    const seed = await seedPayments(page, testPrefix, 'C7b');
    const company = new VendorDetailPage(page);
    const invoice = new InvoiceDetailPage(page);

    await company.goto(seed.companyId, 'payments');
    await company.waitForPaymentsLoaded();
    await company.invoices.link(seed.pendingId).click();

    await expect(page).toHaveURL(
      (url) => url.pathname === routeUrl('invoice', { id: seed.pendingId }),
    );
    await invoice.breadcrumbs.expectBack(seed.name);

    await invoice.companyLink.click();
    await expect(page).toHaveURL(
      (url) => url.pathname === routeUrl('company', { id: seed.companyId }),
    );
    await expect(company.header.heading).toHaveText(seed.name);
  });

  test('C7c: a progress payment row opens the invoice at that payment (?payment=)', async ({
    page,
    testPrefix,
  }) => {
    const seed = await seedPayments(page, testPrefix, 'C7c');
    const company = new VendorDetailPage(page);

    await company.goto(seed.companyId, 'payments');
    await company.waitForPaymentsLoaded();
    await company.progressPayments.link(seed.paymentId).click();

    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('invoice', { id: seed.pendingId }) &&
        url.searchParams.get('payment') === seed.paymentId,
    );
  });

  test('C7d: New invoice starts with the company; Cancel returns focus to the button', async ({
    page,
    testPrefix,
  }) => {
    const seed = await seedPayments(page, testPrefix, 'C7d');
    const company = new VendorDetailPage(page);
    const dialog = new InvoiceFormDialog(page, 'invoice');

    await company.goto(seed.companyId, 'payments');
    await company.waitForPaymentsLoaded();
    await company.newInvoiceButton.click();
    await dialog.waitForOpen();
    await expect(dialog.companyChip()).toContainText(seed.name);
    await expect(page).toHaveURL(
      (url) => url.pathname === routeUrl('company', { id: seed.companyId }),
    );

    await dialog.cancel();
    await dialog.waitForClosed();
    await expect(company.newInvoiceButton).toBeFocused();
  });

  test('C7e: a company without records shows one empty state with New invoice', async ({
    page,
    testPrefix,
  }) => {
    const id = await createCompany(page, { name: `${testPrefix} Example Fresh Ltd` });
    const company = new VendorDetailPage(page);

    await company.goto(id, 'payments');
    await company.waitForPaymentsLoaded();
    await expect(company.paymentsEmpty).toBeVisible();
    await expect(company.paymentsTotals).toHaveCount(0);
    await expect(company.newInvoiceButton).toBeVisible();
  });

  test('C7f: an offer is excluded from Still to pay and has no Still to pay line', async ({
    page,
    testPrefix,
  }) => {
    const id = await createCompany(page, { name: `${testPrefix} Example Offer Ltd` });
    const offerId = await createRecord(page, id, {
      invoiceNumber: `${testPrefix}-C7f-OFR`,
      amount: 900,
      status: 'quotation',
    });
    const company = new VendorDetailPage(page);

    await company.goto(id, 'payments');
    await company.waitForPaymentsLoaded();
    await expect(company.stillToPayFigure).toContainText(amount('0.00'));
    await expect(company.offers.row(offerId)).not.toContainText('Still to pay');
    await expect(company.submittedNote).toHaveCount(0);
  });
});

test.describe('Company page - deleting a record (AC10)', { tag: '@responsive' }, () => {
  test('C8: Escape keeps the record and returns focus to its menu; Delete removes it and focuses New invoice', async ({
    page,
    testPrefix,
  }) => {
    const seed = await seedPayments(page, testPrefix, 'C8');
    const company = new VendorDetailPage(page);

    await company.goto(seed.companyId, 'payments');
    await company.waitForPaymentsLoaded();

    // Escape: nothing is deleted, focus returns to the row menu trigger
    await company.openRecordDelete(seed.paidId);
    await expect(company.invoiceDeleteDialog.dialog).toContainText(`Delete ${seed.paidNumber}?`);
    await expect(company.invoiceDeleteDialog.cancelButton).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(company.invoiceDeleteDialog.dialog).toBeHidden();
    await expect(company.invoices.actionsTrigger(seed.paidId)).toBeFocused();
    await expect(company.invoices.rows).toHaveCount(3);

    // Delete: the row is gone and focus lands on the list's New invoice button
    await company.openRecordDelete(seed.paidId);
    await company.invoiceDeleteDialog.confirmAndWaitClosed();
    await expect(company.invoices.row(seed.paidId)).toHaveCount(0);
    await expect(company.invoices.rows).toHaveCount(2);
    await expect(company.invoices.addButton).toBeFocused();
  });

  test('C8b: deleting the last row of a list focuses the page heading; the figures follow', async ({
    page,
    testPrefix,
  }) => {
    const seed = await seedPayments(page, testPrefix, 'C8b');
    const company = new VendorDetailPage(page);

    await company.goto(seed.companyId, 'payments');
    await company.waitForPaymentsLoaded();

    // The offer is the only row of its list: focus falls back to the h1
    await company.openRecordDelete(seed.offerId);
    await company.invoiceDeleteDialog.confirmAndWaitClosed();
    await expect(company.offers.row(seed.offerId)).toHaveCount(0);
    await expect(company.offers.emptyMessage(/No offers from this company yet/)).toBeVisible();
    await expect(company.header.heading).toBeFocused();

    // Deleting the pending invoice takes its 800 out of Still to pay
    await company.openRecordDelete(seed.pendingId);
    await company.invoiceDeleteDialog.confirmAndWaitClosed();
    await expect(company.invoices.row(seed.pendingId)).toHaveCount(0);
    await expect(company.stillToPayFigure).toContainText(amount('0.00'));
    await expect(company.summary.fact('stillToPay')).toContainText(amount('0.00'));
    await expect(company.progressPayments.row(seed.paymentId)).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7 - AC5: Work, Site diary
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company page - Work and Site diary (AC5)', { tag: '@responsive' }, () => {
  test('C9: Work lists the company tasks, purchases and cost lines', async ({
    page,
    testPrefix,
  }) => {
    const id = await createCompany(page, { name: `${testPrefix} Example Electrics Ltd` });
    const taskId = await createTaskFor(page, id, `${testPrefix} C9 Task`);
    const purchaseId = await createPurchaseFor(page, id, `${testPrefix} C9 Purchase`);
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} C9 Savings`);
    const lineId = await createCostLine(page, {
      kind: 'work_item',
      hostId: taskId,
      budgetSourceId: sourceId,
      description: `${testPrefix} C9 wiring`,
      plannedAmount: 750,
      vendorId: id,
    });
    const company = new VendorDetailPage(page);

    await company.goto(id, 'work');
    await expect(company.tasks.heading).toContainText('(1)');
    await expect(company.tasks.row(taskId)).toContainText(`${testPrefix} C9 Task`);
    await expect(company.tasks.link(taskId)).toHaveAttribute(
      'href',
      routeUrl('workItem', { id: taskId }),
    );
    await expect(company.purchases.heading).toContainText('(1)');
    await expect(company.purchases.row(purchaseId)).toContainText(`${testPrefix} C9 Purchase`);
    await expect(company.purchases.link(purchaseId)).toHaveAttribute(
      'href',
      routeUrl('householdItem', { id: purchaseId }),
    );
    await expect(company.costLines.heading).toContainText('(1)');
    await expect(company.costLines.row(lineId)).toContainText(`${testPrefix} C9 wiring`);
    await expect(company.costLines.row(lineId)).toContainText(amount('750.00'));
    // The task's own title is the line's second fact
    await expect(company.costLines.row(lineId)).toContainText(`${testPrefix} C9 Task`);
  });

  test('C9b: empty Work lists say what is missing', async ({ page, testPrefix }) => {
    const id = await createCompany(page, { name: `${testPrefix} Example Idle Ltd` });
    const company = new VendorDetailPage(page);

    await company.goto(id, 'work');
    await expect(company.tasks.emptyMessage(/No tasks are assigned to this company/)).toBeVisible();
    await expect(
      company.purchases.emptyMessage(/No purchases name this company as supplier/),
    ).toBeVisible();
    await expect(company.costLines.emptyMessage(/No cost lines name this company/)).toBeVisible();
  });

  test('C10: Site diary lists the entries naming the company', async ({ page, testPrefix }) => {
    const id = await createCompany(page, { name: `${testPrefix} Example Scaffolding Ltd` });
    const entryId = await createDailyLog(page, id, '2026-02-10', `${testPrefix} C10 Log`);
    const company = new VendorDetailPage(page);

    await company.goto(id, 'diary');
    await expect(company.diary).toBeVisible();
    await expect(page.getByTestId(`diary-entry-${entryId}`)).toContainText(`${testPrefix} C10 Log`);
    // One entry: no "Show all"
    await expect(company.diaryShowAll).toHaveCount(0);
  });

  test('C10b: past 20 entries only the newest 20 show and "Show all in Site diary" opens the filtered diary', async ({
    page,
    testPrefix,
  }) => {
    test.setTimeout(90_000);
    const id = await createCompany(page, { name: `${testPrefix} Example Busy Site Ltd` });
    const entries: string[] = [];
    for (let day = 0; day < 21; day += 1) {
      const date = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
      entries.push(await createDailyLog(page, id, date, `${testPrefix} C10b Log ${day}`));
    }
    const company = new VendorDetailPage(page);

    await company.goto(id, 'diary');
    await expect(company.diary).toBeVisible();
    await expect(page.getByTestId(`diary-entry-${entries[20]}`)).toBeVisible();
    // The oldest of 21 is on the second page only
    await expect(page.getByTestId(`diary-entry-${entries[0]}`)).toHaveCount(0);
    await expect(company.tabs.tab('diary')).toContainText('21');

    await expect(company.diaryShowAll).toHaveText('Show all in Site diary');
    await company.diaryShowAll.click();
    await expect(page).toHaveURL(
      (url) => url.pathname === routeUrl('diary') && url.searchParams.get('companyId') === id,
    );
  });

  test('C10c: a company no entry names shows the empty Site diary message', async ({
    page,
    testPrefix,
  }) => {
    const id = await createCompany(page, { name: `${testPrefix} Example Quiet Ltd` });
    const company = new VendorDetailPage(page);

    await company.goto(id, 'diary');
    await expect(page.getByText('No site diary entry names this company yet.')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8 - AC6: Companies list money columns
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Companies list - Still to pay and Offers (AC6)', { tag: '@responsive' }, () => {
  test('L1: the figures equal the company page; Offers shows amount and paid, a dash without offers', async ({
    page,
    testPrefix,
  }) => {
    const list = new VendorsPage(page);
    const withMoney = `${testPrefix} List Money Ltd`;
    const bare = `${testPrefix} List Bare Ltd`;
    const moneyId = await createCompany(page, { name: withMoney });
    await createCompany(page, { name: bare });
    await createRecord(page, moneyId, {
      invoiceNumber: `${testPrefix}-L1-INV`,
      amount: 600,
      status: 'pending',
    });
    await createRecord(page, moneyId, {
      invoiceNumber: `${testPrefix}-L1-OFR`,
      amount: 1200,
      status: 'quotation',
    });

    await list.goto({ q: `${testPrefix} List` });
    await expect(list.row(withMoney)).toBeVisible();
    await expect(list.stillToPay(moneyId)).toContainText(amount('600.00'));
    await expect(list.stillToPay(moneyId)).toHaveAttribute('data-figure', 'still-to-pay');
    await expect(list.row(withMoney)).toContainText(amount('1,200.00'));
    await expect(list.row(withMoney)).toContainText('paid');
    await expect(list.row(bare)).toContainText('No offers');

    if ((await page.viewportSize())!.width >= 768) {
      await expect(list.tableContainer.locator('thead th')).toHaveText([
        /^Name/,
        /^Trade/,
        /^Phone/,
        /^Still to pay/,
        /^Offers/,
        /^Contact persons/,
        /^Last on site/,
        /^Actions$/,
      ]);
    }

    // The same figure on the company page
    const company = new VendorDetailPage(page);
    await list.nameLink(withMoney).click();
    await expect(company.header.heading).toHaveText(withMoney);
    await expect(company.summary.fact('stillToPay')).toContainText(amount('600.00'));
  });

  test('L2: sorting by Still to pay orders the companies in both directions', async ({
    page,
    testPrefix,
  }) => {
    const list = new VendorsPage(page);
    const names = {
      none: `${testPrefix} Sort Zero Ltd`,
      low: `${testPrefix} Sort Low Ltd`,
      high: `${testPrefix} Sort High Ltd`,
    };
    const noneId = await createCompany(page, { name: names.none });
    const lowId = await createCompany(page, { name: names.low });
    const highId = await createCompany(page, { name: names.high });
    await createRecord(page, lowId, {
      invoiceNumber: `${testPrefix}-L2-LOW`,
      amount: 300,
      status: 'pending',
    });
    await createRecord(page, highId, {
      invoiceNumber: `${testPrefix}-L2-HIGH`,
      amount: 900,
      status: 'pending',
    });
    expect(noneId).toBeTruthy();

    for (const [direction, expected] of [
      ['desc', [names.high, names.low, names.none]],
      ['asc', [names.none, names.low, names.high]],
    ] as const) {
      await list.goto({ q: `${testPrefix} Sort`, sortBy: 'still_to_pay', sortOrder: direction });
      await expect(list.row(names.high)).toBeVisible();
      expect(
        (await list.getVendorNames()).filter((n) => n.startsWith(`${testPrefix} Sort`)),
        `order ${direction}`,
      ).toEqual(expected);
    }
  });

  test('L3: clicking the Still to pay header sorts and toggles', async ({ page, testPrefix }) => {
    test.skip((page.viewportSize()?.width ?? 1440) < 768, 'the table header exists from 768px');
    const list = new VendorsPage(page);
    const lowId = await createCompany(page, { name: `${testPrefix} Header Low Ltd` });
    await createCompany(page, { name: `${testPrefix} Header Zero Ltd` });
    await createRecord(page, lowId, {
      invoiceNumber: `${testPrefix}-L3`,
      amount: 100,
      status: 'pending',
    });

    await list.goto({ q: `${testPrefix} Header` });
    const header = list.columnHeader(/^Still to pay/);
    await expect(header).toHaveAttribute('aria-sort', 'none');
    await header.click();
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    await expect(page).toHaveURL((url) => url.searchParams.get('sortBy') === 'still_to_pay');
    await header.click();
    await expect(header).toHaveAttribute('aria-sort', 'descending');
    await expect(page).toHaveURL((url) => url.searchParams.get('sortOrder') === 'desc');
    // The Offers column is not sortable
    await expect(list.columnHeader(/^Offers/)).not.toHaveAttribute('aria-sort');
    await expect(list.columnHeader(/^Offers/).locator('svg')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9 - AC9: layout
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company page - layout (AC9)', { tag: '@responsive' }, () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`C11: desktop 1280x800 keeps all five facts on one row in ${scheme} mode`, async ({
      page,
      testPrefix,
    }) => {
      test.skip(test.info().project.name !== 'desktop', 'sets its own viewport; run once');
      const seed = await seedPayments(page, testPrefix, `C11${scheme}`);
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 1280, height: 800 });
      const company = new VendorDetailPage(page);

      await company.goto(seed.companyId);
      const strip = await company.summary.stripBox();
      expect(strip.bottom, 'header and strip bottom').toBeLessThanOrEqual(450);
      expect(await company.summary.rowCount(), 'distinct fact rows').toBe(1);
      expect(await company.summary.columnCount(), 'distinct fact columns').toBe(5);
    });

    test(`C11: phone 390x844 fits header and strip in two columns in ${scheme} mode`, async ({
      page,
      testPrefix,
    }) => {
      test.skip(test.info().project.name !== 'mobile', 'sets its own viewport; run once');
      const seed = await seedPayments(page, testPrefix, `C11p${scheme}`);
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 390, height: 844 });
      const company = new VendorDetailPage(page);

      await company.goto(seed.companyId);
      const strip = await company.summary.stripBox();
      expect(strip.bottom, 'header and strip bottom').toBeLessThanOrEqual(844);
      expect(await company.summary.columnCount(), 'distinct fact columns').toBe(2);
      const boxes = await company.summary.boxes();
      expect(boxes[0]!.y, 'facts 0 and 1 share a row').toBeCloseTo(boxes[1]!.y, 0);
      expect(boxes[2]!.y, 'fact 2 sits below').toBeGreaterThan(boxes[0]!.y);
      // The tab list starts above the bottom bar
      const tablist = await company.tabs.tablist.boundingBox();
      const bottomBar = await page.getByTestId('bottom-bar').boundingBox();
      expect(tablist, 'tablist box').not.toBeNull();
      expect(bottomBar, 'bottom bar box').not.toBeNull();
      expect(tablist!.y, 'tablist top is inside the viewport').toBeLessThan(bottomBar!.y);
    });
  }

  test('C11b: no horizontal scroll on Overview, Payments and Work at the current viewport', async ({
    page,
    testPrefix,
  }) => {
    const seed = await seedPayments(page, testPrefix, 'C11b');
    const company = new VendorDetailPage(page);
    for (const tab of ['overview', 'payments', 'work'] as const) {
      await company.goto(seed.companyId, tab);
      await expect(company.tabs.tab(tab)).toHaveAttribute('aria-selected', 'true');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${tab}: horizontal overflow`).toBeLessThanOrEqual(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10 - History
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company page - History', { tag: '@responsive' }, () => {
  test('C12: a status change of the company invoice appears in History', async ({
    page,
    testPrefix,
  }) => {
    const id = await createCompany(page, { name: `${testPrefix} Example History Ltd` });
    const number = `${testPrefix}-C12-INV`;
    const invoiceId = await createRecord(page, id, {
      invoiceNumber: number,
      amount: 450,
      status: 'pending',
    });
    const paid = await page.request.patch(`${API.vendors}/${id}/invoices/${invoiceId}`, {
      data: { status: 'paid' },
    });
    expect(paid.ok(), `PATCH invoice paid: ${paid.status()}`).toBeTruthy();
    const company = new VendorDetailPage(page);

    await company.goto(id, 'history');
    await expect(company.tabs.tab('history')).toHaveAttribute('aria-selected', 'true');
    await expect(company.history).toContainText(number);
  });

  test('C12b: a company with no offers or invoices says so', async ({ page, testPrefix }) => {
    const id = await createCompany(page, { name: `${testPrefix} Example Blank Ltd` });
    const company = new VendorDetailPage(page);

    await company.goto(id, 'history');
    await expect(company.history).toContainText(
      "Nothing has happened to this company's offers and invoices yet.",
    );
  });
});
