import { describe, it, expect } from '@jest/globals';
import {
  PRODUCT_NAME,
  TITLE_SEPARATOR,
  breadcrumbChain,
  composeDocumentTitle,
  isNavView,
  navLabelKeyForPath,
  navLabelKeyForRoute,
  navSectionForRoute,
  originLabelKeyForPath,
  pageLabelKeyForRoute,
  PAGE_LABEL_KEYS,
} from './pageIdentity.js';

describe('navLabelKeyForRoute', () => {
  it.each([
    ['workItems', 'navigation.tasks'],
    ['milestones', 'navigation.milestones'],
    ['scheduleGantt', 'navigation.schedule'],
    ['scheduleCalendar', 'navigation.calendar'],
    ['householdItems', 'navigation.purchases'],
    ['settingsManage', 'navigation.projectSetup'],
    ['settingsProfile', 'navigation.account'],
    // Interim aliases: the served page stands in for the planned NavConfig route.
    ['dashboard', 'navigation.home'],
    ['vendors', 'navigation.companies'],
  ])('maps the view %s to %s', (id, key) => {
    expect(navLabelKeyForRoute(id)).toBe(key);
  });

  it.each(['workItem', 'workItemNew', 'milestone', 'householdItem', 'vendor', 'login'])(
    'gives the object or auth page %s no label',
    (id) => {
      expect(navLabelKeyForRoute(id)).toBeNull();
    },
  );

  it('returns null for an unknown route id', () => {
    expect(navLabelKeyForRoute('doesNotExist')).toBeNull();
  });
});

describe('navLabelKeyForRoute and the interim Money views', () => {
  // The sidebar shows Funding sources, Grants and the Bank report as interim views, but page
  // identity keeps treating them as non-views: they have no NavConfig label of their own.
  it.each(['budgetSources', 'budgetSubsidies', 'bankReport'])(
    'gives the interim view %s no NavConfig label',
    (id) => {
      expect(navLabelKeyForRoute(id)).toBeNull();
      expect(isNavView(id)).toBe(false);
    },
  );

  it('still labels the three pages through the page labels', () => {
    expect(pageLabelKeyForRoute('budgetSources')).toBe('navigation.fundingSources');
    expect(originLabelKeyForPath('/budget/sources')).toBe('navigation.fundingSources');
    expect(navLabelKeyForPath('/budget/reports')).toBeNull();
  });

  it('leaves the Money trail unchanged for an interim page', () => {
    expect(breadcrumbChain('budgetSources', {}).map((c) => c.id)).toEqual(['budgetOverview']);
  });

  it('labels the real Money view Invoices in the first loop', () => {
    expect(navLabelKeyForRoute('invoices')).toBe('navigation.invoices');
  });
});

describe('navLabelKeyForPath', () => {
  it('resolves a served view path', () => {
    expect(navLabelKeyForPath('/schedule/calendar')).toBe('navigation.calendar');
    expect(navLabelKeyForPath('/project/overview')).toBe('navigation.home');
  });

  it('returns null for an object page, an unlabelled page and an unmatched path', () => {
    expect(navLabelKeyForPath('/project/work-items/w-1')).toBeNull();
    expect(navLabelKeyForPath('/budget/invoices/i-1')).toBeNull();
    expect(navLabelKeyForPath('/no/such/page')).toBeNull();
  });
});

describe('isNavView', () => {
  it.each(['workItems', 'milestones', 'scheduleGantt', 'scheduleCalendar', 'dashboard', 'vendors'])(
    'treats %s as a view',
    (id) => {
      expect(isNavView(id)).toBe(true);
    },
  );

  it.each(['workItem', 'workItemNew', 'milestone', 'vendor', 'householdItemEdit'])(
    'treats %s as a non-view',
    (id) => {
      expect(isNavView(id)).toBe(false);
    },
  );
});

describe('navSectionForRoute', () => {
  it.each([
    ['milestone', 'tasks'],
    ['householdItemEdit', 'purchases'],
    ['scheduleGantt', 'tasks'],
    ['vendor', 'companies'],
    ['settingsManage', 'settings'],
  ])('puts %s in the %s section', (id, section) => {
    expect(navSectionForRoute(id)?.id).toBe(section);
  });

  it('returns null for a route outside every section and for unknown ids', () => {
    expect(navSectionForRoute('login')).toBeNull();
    expect(navSectionForRoute('doesNotExist')).toBeNull();
  });
});

describe('breadcrumbChain', () => {
  it('gives a task its Tasks parent', () => {
    expect(breadcrumbChain('workItem', { id: 'w-1' })).toEqual([
      { id: 'workItems', href: '/project/work-items', labelKey: 'navigation.tasks' },
    ]);
  });

  it('lists a milestone chain root first', () => {
    const expected = [
      { id: 'workItems', href: '/project/work-items', labelKey: 'navigation.tasks' },
      { id: 'milestones', href: '/project/milestones', labelKey: 'navigation.milestones' },
    ];
    expect(breadcrumbChain('milestone', { id: '7' })).toEqual(expected);
    expect(breadcrumbChain('milestoneNew', {})).toEqual(expected);
  });

  it('resolves the purchase parent of the edit page with its params and no label key', () => {
    expect(breadcrumbChain('householdItemEdit', { id: 'h-1' })).toEqual([
      { id: 'householdItems', href: '/project/household-items', labelKey: 'navigation.purchases' },
      { id: 'householdItem', href: '/project/household-items/h-1', labelKey: null },
    ]);
  });

  it('gives views no chain', () => {
    expect(breadcrumbChain('workItems', {})).toEqual([]);
    expect(breadcrumbChain('scheduleCalendar', {})).toEqual([]);
  });

  it('skips planned (unserved) ancestors instead of showing them dead', () => {
    const chain = breadcrumbChain('bankReport', {});
    expect(chain.map((c) => c.id)).toEqual(['budgetOverview']);
  });

  it('skips an ancestor whose param is missing and does not throw', () => {
    expect(() => breadcrumbChain('householdItemEdit', {})).not.toThrow();
    expect(breadcrumbChain('householdItemEdit', {}).map((c) => c.id)).toEqual(['householdItems']);
  });

  it('skips an ancestor that routeUrl throws on (param explicitly undefined) and keeps the rest', () => {
    const params = { id: undefined } as unknown as Record<string, string>;
    expect(() => breadcrumbChain('householdItemEdit', params)).not.toThrow();
    expect(breadcrumbChain('householdItemEdit', params).map((c) => c.id)).toEqual([
      'householdItems',
    ]);
  });

  it('builds ancestor hrefs with the params URI-encoded', () => {
    const chain = breadcrumbChain('householdItemEdit', { id: 'a b' });
    expect(chain.find((c) => c.id === 'householdItem')?.href).toBe(
      '/project/household-items/a%20b',
    );
  });

  it('returns an empty chain for an unknown id', () => {
    expect(breadcrumbChain('doesNotExist', {})).toEqual([]);
  });
});

describe('composeDocumentTitle', () => {
  it('uses the U+00B7 separator with one space each side', () => {
    expect(TITLE_SEPARATOR).toBe(' · ');
    expect(PRODUCT_NAME).toBe('Cornerstone');
  });

  it('drops the section when it equals the page', () => {
    expect(
      composeDocumentTitle({ page: 'Tasks', section: 'Tasks', house: 'Synthetic House' }),
    ).toBe('Tasks · Synthetic House');
  });

  it('composes page, section and house', () => {
    expect(composeDocumentTitle({ page: 'New task', section: 'Tasks', house: null })).toBe(
      'New task · Tasks · Cornerstone',
    );
  });

  it('falls back to the product name for a blank house', () => {
    expect(composeDocumentTitle({ page: 'Tasks', section: null, house: '   ' })).toBe(
      'Tasks · Cornerstone',
    );
  });

  it('works without a page', () => {
    expect(composeDocumentTitle({ page: null, section: 'Money', house: 'X' })).toBe('Money · X');
  });

  it('collapses to the product name when everything is blank', () => {
    expect(composeDocumentTitle({ page: '  ', section: null, house: null })).toBe('Cornerstone');
    expect(composeDocumentTitle({})).toBe('Cornerstone');
  });

  it('trims every part', () => {
    expect(composeDocumentTitle({ page: ' A ', section: ' B ', house: ' C ' })).toBe('A · B · C');
  });
});

describe('pageLabelKeyForRoute', () => {
  it.each([
    ['bankReport', 'navigation.bankReport'],
    ['budgetSources', 'navigation.fundingSources'],
    ['budgetSubsidies', 'navigation.grants'],
  ])('maps the page %s to %s', (id, key) => {
    expect(pageLabelKeyForRoute(id)).toBe(key);
  });

  it('gives an object page and an unknown id no label without throwing', () => {
    expect(pageLabelKeyForRoute('invoice')).toBeNull();
    expect(() => pageLabelKeyForRoute('doesNotExist')).not.toThrow();
    expect(pageLabelKeyForRoute('doesNotExist')).toBeNull();
  });

  it('keeps the page labels out of the view set', () => {
    expect(Object.keys(PAGE_LABEL_KEYS).sort()).toEqual([
      'bankReport',
      'budgetSources',
      'budgetSubsidies',
    ]);
    for (const id of Object.keys(PAGE_LABEL_KEYS)) {
      expect(isNavView(id)).toBe(false);
    }
  });
});

describe('originLabelKeyForPath', () => {
  it('resolves a non-view page through the page labels', () => {
    expect(originLabelKeyForPath('/budget/reports')).toBe('navigation.bankReport');
    expect(originLabelKeyForPath('/budget/sources')).toBe('navigation.fundingSources');
  });

  it('lets the NavConfig label win over the page labels', () => {
    expect(originLabelKeyForPath('/budget/invoices')).toBe('navigation.invoices');
    expect(originLabelKeyForPath('/project/work-items')).toBe('navigation.tasks');
  });

  it('returns null for an object page and an unmatched path', () => {
    expect(originLabelKeyForPath('/budget/invoices/i-1')).toBeNull();
    expect(originLabelKeyForPath('/no/such/page')).toBeNull();
  });
});

describe('breadcrumbChain for Money pages', () => {
  it('lists Money and Invoices before the invoice on the Split with AI page', () => {
    expect(breadcrumbChain('invoiceAutoItemize', { id: 'i-1', documentId: '3' })).toEqual([
      { id: 'budgetOverview', href: '/budget/overview', labelKey: expect.any(String) },
      { id: 'invoices', href: '/budget/invoices', labelKey: 'navigation.invoices' },
      { id: 'invoice', href: '/budget/invoices/i-1', labelKey: null },
    ]);
  });

  it('gives Funding sources only the Money parent', () => {
    expect(breadcrumbChain('budgetSources', {}).map((c) => c.id)).toEqual(['budgetOverview']);
  });

  it('gives the Invoices view no chain', () => {
    expect(breadcrumbChain('invoices', {})).toEqual([]);
  });
});
