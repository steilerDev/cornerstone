import { describe, it, expect } from '@jest/globals';
import { SEARCH_MATCHED_FIELDS, SEARCH_RESULT_TYPES, routeUrl } from '@cornerstone/shared';
import type { SearchResultItem, SearchResultType } from '@cornerstone/shared';
import { navSections } from '../../navigation/navConfig.js';
import type { NavContext } from '../../navigation/navConfig.js';
import { resolveNavActive } from '../../navigation/navActive.js';
import { findSearchDestinations } from '../../navigation/searchDestinations.js';
import type { SearchDestination } from '../../navigation/searchDestinations.js';
import {
  enFormatters,
  enT,
  makeGroup,
  makeItem,
  makeResponse,
} from '../../test/commandSearchFixtures.js';
import {
  MAX_DESTINATIONS,
  buildOptions,
  destinationHref,
  destinationLabel,
  firstActivatableId,
  foundInField,
  isActivatable,
  itemOptionId,
  itemTitle,
  line2Parts,
  optionDomId,
} from './commandSearchModel.js';
import type { BuildInput, CommandOption } from './commandSearchModel.js';

const CTX: NavContext = { role: 'admin', paperlessConfigured: true };
const SECTIONS = navSections(CTX);
const DEPS = { t: enT, language: 'en', ...enFormatters };

function input(overrides: Partial<BuildInput> = {}): BuildInput {
  return {
    ...DEPS,
    liveQuery: 'zz',
    response: null,
    expanded: new Map(),
    ctx: CTX,
    sections: SECTIONS,
    active: null,
    paperlessBaseUrl: null,
    ...overrides,
  };
}

function textsOf(parts: ReturnType<typeof line2Parts>): string[] {
  return parts.map((p) =>
    p.kind === 'text' ? p.text : `path:${p.segments.map((s) => s.name).join('/')}`,
  );
}

describe('optionDomId', () => {
  it('joins the listbox id and the option id', () => {
    expect(optionDomId('lb', { id: 'work_item-1' })).toBe('lb-work_item-1');
  });

  it('replaces characters that are not valid in an id token', () => {
    expect(optionDomId('list:box', { id: 'a b/c.d' })).toBe('list_box-a_b_c_d');
  });

  it('keeps ids stable for the same input', () => {
    expect(optionDomId(':r1:', { id: 'x' })).toBe(optionDomId(':r1:', { id: 'x' }));
  });
});

describe('itemOptionId', () => {
  it('prefixes the item id with its type', () => {
    expect(itemOptionId('vendor', { id: 'v-1' })).toBe('vendor-v-1');
  });
});

describe('destinationHref / destinationLabel', () => {
  const schedule: SearchDestination = {
    route: 'scheduleGantt',
    term: 'Schedule',
    matched: 'Gantt',
    viaFormerName: true,
    rank: 0,
    labelKey: 'navigation.schedule',
  };

  it('builds the href from the route map', () => {
    expect(destinationHref(schedule)).toBe(routeUrl('scheduleGantt'));
  });

  it('adds the preselected query of the destination', () => {
    const href = destinationHref({
      route: 'invoices',
      query: { status: 'claimed' },
      term: 'Submitted',
      matched: 'Submitted',
      viaFormerName: false,
      rank: 0,
    });
    expect(href).toBe(routeUrl('invoices', undefined, { status: 'claimed' }));
    expect(href).toContain('status=claimed');
  });

  it('uses the NavConfig label key when the destination has one', () => {
    expect(destinationLabel(schedule, enT, 'en')).toBe('Schedule');
    expect(destinationLabel(schedule, (k) => `T:${k}`, 'de')).toBe('T:navigation.schedule');
  });

  it('uses the English glossary form for an extra without a label key', () => {
    const dest: SearchDestination = {
      route: 'diary',
      term: 'Defect',
      matched: 'Defect',
      viaFormerName: false,
      rank: 0,
    };
    expect(destinationLabel(dest, enT, 'en')).toBe('Defect');
  });

  it('uses the German glossary chip or singular under a de language', () => {
    const dest: SearchDestination = {
      route: 'diary',
      term: 'Defect',
      matched: 'Defect',
      viaFormerName: false,
      rank: 0,
    };
    const de = destinationLabel(dest, enT, 'de-DE');
    expect(de).not.toBe('Defect');
    expect(de.length).toBeGreaterThan(0);
  });

  it('falls back to the term itself when the glossary does not know it', () => {
    expect(
      destinationLabel(
        { route: 'diary', term: 'Not A Term', matched: 'x', viaFormerName: false, rank: 0 },
        enT,
        'en',
      ),
    ).toBe('Not A Term');
  });
});

describe('itemTitle', () => {
  it('returns the label when it has text', () => {
    expect(itemTitle('work_item', makeItem({ label: '  Roof  ' }), DEPS)).toBe('Roof');
  });

  it('labels an invoice without a number "Invoice"', () => {
    expect(itemTitle('invoice', makeItem({ label: null, status: 'pending' }), DEPS)).toBe(
      'Invoice',
    );
  });

  it('labels a quotation without a number "Offer"', () => {
    expect(itemTitle('invoice', makeItem({ label: null, status: 'quotation' }), DEPS)).toBe(
      'Offer',
    );
  });

  it('treats a blank label like a missing one', () => {
    expect(itemTitle('invoice', makeItem({ label: '   ', status: 'paid' }), DEPS)).toBe('Invoice');
  });

  it('builds the untitled diary title from the type word and the day and month', () => {
    expect(
      itemTitle(
        'diary_entry',
        makeItem({ label: null, kind: 'site_visit', date: '2026-03-04' }),
        DEPS,
      ),
    ).toBe('Site visit · DM(2026-03-04)');
  });

  it('leaves the type word empty for an automatic diary entry type', () => {
    expect(
      itemTitle(
        'diary_entry',
        makeItem({ label: null, kind: 'work_item_status', date: '2026-03-04' }),
        DEPS,
      ),
    ).toBe(' · DM(2026-03-04)');
  });

  it('leaves the type word empty when the diary kind is missing', () => {
    expect(
      itemTitle('diary_entry', makeItem({ label: null, kind: null, date: '2026-03-04' }), DEPS),
    ).toBe(' · DM(2026-03-04)');
  });

  it('returns an empty string for other types without a label', () => {
    expect(itemTitle('work_item', makeItem({ label: null }), DEPS)).toBe('');
  });
});

describe('foundInField', () => {
  const VISIBLE_FOR_ALL: readonly string[] = [
    'title',
    'name',
    'invoiceNumber',
    'companyName',
    'tradeName',
  ];

  it.each(
    SEARCH_RESULT_TYPES.flatMap((type) =>
      SEARCH_MATCHED_FIELDS.map((field) => [type, field] as const),
    ),
  )('%s matched in %s', (type, field) => {
    const result = foundInField(type, makeItem({ matchedField: field }));
    if (VISIBLE_FOR_ALL.includes(field)) {
      expect(result).toBeNull();
    } else if (field === 'description' && type === 'budget_line') {
      expect(result).toBeNull();
    } else {
      expect(result).toBe(field);
    }
  });
});

describe('line2Parts', () => {
  it('lists sublabel, phone, date, area path and "Found in" in that order for a company', () => {
    const parts = line2Parts(
      'vendor',
      makeItem({ sublabel: 'Roofing', phone: '+49 30 1234', matchedField: 'phone' }),
      DEPS,
    );
    expect(textsOf(parts)).toEqual(['Roofing', '+49 30 1234', 'Found in Phone']);
  });

  it('marks only the sublabel for highlighting', () => {
    const parts = line2Parts(
      'vendor',
      makeItem({ sublabel: 'Roofing', phone: '+49 30 1234', matchedField: 'phone' }),
      DEPS,
    );
    const highlights = parts.map((p) => p.kind === 'text' && p.highlight);
    expect(highlights).toEqual([true, false, false]);
  });

  it('omits the phone for types other than companies', () => {
    const parts = line2Parts(
      'work_item',
      makeItem({ phone: '+49 1', matchedField: 'title' }),
      DEPS,
    );
    expect(parts).toEqual([]);
  });

  it('shows company and the formatted date for an invoice', () => {
    const parts = line2Parts(
      'invoice',
      makeItem({ sublabel: 'Acme Build', date: '2026-02-01', matchedField: 'invoiceNumber' }),
      DEPS,
    );
    expect(textsOf(parts)).toEqual(['Acme Build', 'D(2026-02-01)']);
  });

  it('shows the type word before the date for a diary entry', () => {
    const parts = line2Parts(
      'diary_entry',
      makeItem({ kind: 'daily_log', date: '2026-02-01', matchedField: 'body' }),
      DEPS,
    );
    expect(textsOf(parts)).toEqual(['Daily log', 'D(2026-02-01)', 'Found in Entry text']);
  });

  it('omits the type word for an automatic diary entry', () => {
    const parts = line2Parts(
      'diary_entry',
      makeItem({ kind: 'work_item_status', date: '2026-02-01' }),
      DEPS,
    );
    expect(textsOf(parts)).toEqual(['D(2026-02-01)']);
  });

  it('shows the date for a milestone and a document but not for a task', () => {
    expect(textsOf(line2Parts('milestone', makeItem({ date: '2026-05-05' }), DEPS))).toEqual([
      'D(2026-05-05)',
    ]);
    expect(
      textsOf(line2Parts('paperless_document', makeItem({ date: '2026-05-05' }), DEPS)),
    ).toEqual(['D(2026-05-05)']);
    expect(textsOf(line2Parts('work_item', makeItem({ date: '2026-05-05' }), DEPS))).toEqual([]);
  });

  it('emits an area-path part for tasks with an area path', () => {
    const parts = line2Parts(
      'work_item',
      makeItem({
        areaPath: [
          { id: 'a1', name: 'Ground floor' },
          { id: 'a2', name: 'Kitchen' },
        ],
      }),
      DEPS,
    );
    expect(textsOf(parts)).toEqual(['path:Ground floor/Kitchen']);
  });

  it('omits an empty area path', () => {
    expect(textsOf(line2Parts('work_item', makeItem({ areaPath: [] }), DEPS))).toEqual([]);
  });

  it.each([
    ['work_item', 'In task Bathroom plan'],
    ['household_item', 'In purchase Bathroom plan'],
    ['invoice', 'In invoice Bathroom plan'],
  ] as const)('writes the parent sentence for a %s parent', (parentType, sentence) => {
    const parts = line2Parts(
      'budget_line',
      makeItem({
        parent: { type: parentType, id: 'p1', label: 'Bathroom plan' },
        matchedField: 'description',
      }),
      DEPS,
    );
    expect(textsOf(parts)).toEqual([sentence]);
  });

  it('writes the unnamed-invoice sentence for an invoice parent without a label', () => {
    const parts = line2Parts(
      'budget_line',
      makeItem({ parent: { type: 'invoice', id: 'p1', label: null } }),
      DEPS,
    );
    expect(textsOf(parts)).toEqual(['In an invoice without a number']);
  });

  it('treats a blank parent label like a missing one', () => {
    const parts = line2Parts(
      'budget_line',
      makeItem({ parent: { type: 'invoice', id: 'p1', label: '  ' } }),
      DEPS,
    );
    expect(textsOf(parts)).toEqual(['In an invoice without a number']);
  });

  it('writes a trimmed parent sentence for a task parent without a label', () => {
    const parts = line2Parts(
      'budget_line',
      makeItem({ parent: { type: 'work_item', id: 'p1', label: null } }),
      DEPS,
    );
    expect(textsOf(parts)).toEqual(['In task']);
  });

  it('shows "Found in" for a field that the title does not show', () => {
    const parts = line2Parts('work_item', makeItem({ matchedField: 'notes' }), DEPS);
    expect(textsOf(parts)).toEqual(['Found in Notes']);
  });

  it('replaces the details by "can\'t be opened" and keeps "Found in" when disabled', () => {
    const parts = line2Parts(
      'paperless_document',
      makeItem({ sublabel: 'ignored', date: '2026-01-01', matchedField: 'fullText' }),
      DEPS,
      true,
    );
    expect(textsOf(parts)).toEqual(["Can't be opened from here", 'Found in Document text']);
  });

  it('omits the "can\'t be opened" text while the link base is still pending', () => {
    const parts = line2Parts(
      'paperless_document',
      makeItem({ matchedField: 'fullText' }),
      DEPS,
      true,
      false,
    );
    expect(textsOf(parts)).toEqual(['Found in Document text']);
  });

  it('returns nothing for a disabled row whose match is visible and cannot-open is hidden', () => {
    expect(
      line2Parts('paperless_document', makeItem({ matchedField: 'title' }), DEPS, true, false),
    ).toEqual([]);
  });

  it('skips a blank sublabel', () => {
    expect(textsOf(line2Parts('vendor', makeItem({ sublabel: '   ' }), DEPS))).toEqual([]);
  });
});

describe('isActivatable / firstActivatableId', () => {
  const disabled = { kind: 'item', id: 'a', disabled: true } as unknown as CommandOption;
  const enabled = { kind: 'item', id: 'b', disabled: false } as unknown as CommandOption;
  const more = { kind: 'more', id: 'c' } as unknown as CommandOption;

  it('treats only disabled item rows as not activatable', () => {
    expect(isActivatable(disabled)).toBe(false);
    expect(isActivatable(enabled)).toBe(true);
    expect(isActivatable(more)).toBe(true);
  });

  it('picks the first activatable id and null for an empty or all-disabled list', () => {
    expect(firstActivatableId([disabled, enabled, more])).toBe('b');
    expect(firstActivatableId([disabled])).toBeNull();
    expect(firstActivatableId([])).toBeNull();
  });
});

describe('buildOptions', () => {
  it('returns nothing for a query that matches no destination and no response', () => {
    const built = buildOptions(input());
    expect(built.destinations).toEqual([]);
    expect(built.groups).toEqual([]);
    expect(built.flat).toEqual([]);
  });

  it('puts destinations first, capped at four, then groups in response order', () => {
    const response = makeResponse('inv', {
      work_item: makeGroup('work_item', [makeItem({ id: 'w1', label: 'Roof' })]),
      invoice: makeGroup('invoice', [makeItem({ id: 'i1', label: 'INV-1' })]),
      vendor: makeGroup('vendor', [makeItem({ id: 'v1', label: 'Acme' })]),
    });
    const built = buildOptions(input({ liveQuery: 'inv', response }));
    expect(built.destinations.length).toBeGreaterThan(0);
    expect(built.destinations.length).toBeLessThanOrEqual(MAX_DESTINATIONS);
    expect(built.groups.map((g) => g.type)).toEqual(['work_item', 'invoice', 'vendor']);
    const kinds = built.flat.map((o) => o.kind);
    const firstItem = kinds.indexOf('item');
    expect(kinds.slice(0, firstItem).every((k) => k === 'destination')).toBe(true);
    expect(built.flat.map((o) => o.id).slice(-3)).toEqual([
      'work_item-w1',
      'invoice-i1',
      'vendor-v1',
    ]);
  });

  it('shows at most four destinations even when more match', () => {
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const query = letters.find(
      (c) => findSearchDestinations(c, CTX, enT).length > MAX_DESTINATIONS,
    );
    expect(query).toBeDefined();
    const all = findSearchDestinations(query!, CTX, enT);
    const built = buildOptions(input({ liveQuery: query! }));
    expect(built.destinations).toHaveLength(MAX_DESTINATIONS);
    expect(built.destinations.map((d) => (d.kind === 'destination' ? d.dest.route : ''))).toEqual(
      all.slice(0, MAX_DESTINATIONS).map((d) => d.route),
    );
  });

  it('skips empty groups', () => {
    const response = makeResponse('roof', {
      milestone: makeGroup('milestone', [makeItem({ id: 'm1' })]),
    });
    const built = buildOptions(input({ response }));
    expect(built.groups.map((g) => g.type)).toEqual(['milestone']);
  });

  it('keeps an unavailable group without options', () => {
    const response = makeResponse('roof', {
      paperless_document: makeGroup('paperless_document', [], { status: 'unavailable' }),
    });
    const built = buildOptions(input({ response }));
    expect(built.groups).toHaveLength(1);
    expect(built.groups[0]).toMatchObject({
      type: 'paperless_document',
      status: 'unavailable',
      shown: 0,
      options: [],
    });
    expect(built.flat).toEqual([]);
  });

  it('adds a "show more" option with min(total, 20) - shown', () => {
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
    const response = makeResponse('roof', {
      work_item: makeGroup('work_item', items, { total: 12 }),
    });
    const group = buildOptions(input({ response })).groups[0]!;
    const last = group.options[group.options.length - 1]!;
    expect(last).toMatchObject({
      kind: 'more',
      id: 'more-work_item',
      type: 'work_item',
      count: 10,
    });
    expect(group.capped).toBe(false);
  });

  it('caps the "show more" count at 20 for a larger total', () => {
    const items = [makeItem(), makeItem(), makeItem(), makeItem(), makeItem()];
    const response = makeResponse('roof', {
      work_item: makeGroup('work_item', items, { total: 150 }),
    });
    const group = buildOptions(input({ response })).groups[0]!;
    expect(group.options[group.options.length - 1]).toMatchObject({ kind: 'more', count: 15 });
  });

  it('offers no "show more" at 20 shown and flags the group as capped', () => {
    const items = Array.from({ length: 20 }, (_, i) => makeItem({ id: `w${i}` }));
    const response = makeResponse('roof', {
      work_item: makeGroup('work_item', items, { total: 31 }),
    });
    const group = buildOptions(input({ response })).groups[0]!;
    expect(group.options.some((o) => o.kind === 'more')).toBe(false);
    expect(group.capped).toBe(true);
    expect(group.shown).toBe(20);
  });

  it('is not capped at 20 shown when the total is exactly 20', () => {
    const items = Array.from({ length: 20 }, (_, i) => makeItem({ id: `w${i}` }));
    const response = makeResponse('roof', {
      work_item: makeGroup('work_item', items, { total: 20 }),
    });
    expect(buildOptions(input({ response })).groups[0]!.capped).toBe(false);
  });

  it('has no "show more" when everything is shown', () => {
    const response = makeResponse('roof', {
      work_item: makeGroup('work_item', [makeItem(), makeItem()]),
    });
    expect(
      buildOptions(input({ response })).groups[0]!.options.some((o) => o.kind === 'more'),
    ).toBe(false);
  });

  it('uses the expanded items of a group instead of the response items', () => {
    const first = makeItem({ id: 'a' });
    const all = [first, makeItem({ id: 'b' }), makeItem({ id: 'c' })];
    const response = makeResponse('roof', {
      work_item: makeGroup('work_item', [first], { total: 3 }),
    });
    const built = buildOptions(input({ response, expanded: new Map([['work_item', all]]) }));
    const group = built.groups[0]!;
    expect(group.shown).toBe(3);
    expect(group.options.map((o) => o.id)).toEqual(['work_item-a', 'work_item-b', 'work_item-c']);
  });

  it('opens item rows through the route map', () => {
    const response = makeResponse('roof', {
      work_item: makeGroup('work_item', [makeItem({ id: 'w9' })]),
    });
    const option = buildOptions(input({ response })).flat[0]!;
    expect(option.kind).toBe('item');
    if (option.kind === 'item') {
      expect(option.target).toEqual({ kind: 'app', href: routeUrl('workItem', { id: 'w9' }) });
      expect(option.disabled).toBe(false);
      expect(option.pending).toBe(false);
    }
  });

  it('disables a document when Paperless has no link base', () => {
    const response = makeResponse('roof', {
      paperless_document: makeGroup('paperless_document', [makeItem({ id: 'd1' })]),
    });
    const option = buildOptions(input({ response, paperlessBaseUrl: null })).flat[0]!;
    expect(option).toMatchObject({ kind: 'item', disabled: true, pending: false, target: null });
  });

  it('marks a document as pending while the link base is not fetched yet', () => {
    const response = makeResponse('roof', {
      paperless_document: makeGroup('paperless_document', [makeItem({ id: 'd1' })]),
    });
    const option = buildOptions(input({ response, paperlessBaseUrl: undefined })).flat[0]!;
    expect(option).toMatchObject({ kind: 'item', disabled: true, pending: true });
  });

  it('makes a document an external link once the link base is known', () => {
    const response = makeResponse('roof', {
      paperless_document: makeGroup('paperless_document', [makeItem({ id: 'd1' })]),
    });
    const option = buildOptions(input({ response, paperlessBaseUrl: 'https://docs.example.test' }))
      .flat[0]!;
    expect(option).toMatchObject({
      kind: 'item',
      disabled: false,
      target: { kind: 'external', href: 'https://docs.example.test/documents/d1/details' },
    });
  });

  it('numbers destination ids by position and prefixes the route', () => {
    const built = buildOptions(input({ liveQuery: 'task' }));
    expect(built.destinations.length).toBeGreaterThan(0);
    built.destinations.forEach((option, index) => {
      expect(option.id).toBe(
        `dest-${option.kind === 'destination' ? option.dest.route : ''}-${index}`,
      );
    });
  });

  describe('destination replace rule (ADR-038 rule 8)', () => {
    function destinationTo(
      query: string,
      route: string,
      pathname: string,
    ): Extract<CommandOption, { kind: 'destination' }> {
      const active = resolveNavActive(pathname, SECTIONS);
      const built = buildOptions(input({ liveQuery: query, active }));
      const found = built.destinations.find(
        (d) => d.kind === 'destination' && d.dest.route === route,
      );
      expect(found).toBeDefined();
      return found as Extract<CommandOption, { kind: 'destination' }>;
    }

    it('replaces when on the Tasks list and going to the Schedule view of the same section', () => {
      expect(destinationTo('Gantt', 'scheduleGantt', routeUrl('workItems')).replace).toBe(true);
    });

    it('pushes from a task detail page, which is not an entry or a view', () => {
      expect(
        destinationTo('Gantt', 'scheduleGantt', routeUrl('workItem', { id: 'w1' })).replace,
      ).toBe(false);
    });

    it('pushes when the destination is in another section', () => {
      expect(destinationTo('Invoices', 'invoices', routeUrl('workItems')).replace).toBe(false);
    });

    it('pushes when no sidebar entry is active', () => {
      expect(destinationTo('Gantt', 'scheduleGantt', '/does-not-exist').replace).toBe(false);
    });

    it('carries the href and the localised title of the destination', () => {
      const dest = destinationTo('Gantt', 'scheduleGantt', routeUrl('workItems'));
      expect(dest.target).toBe(routeUrl('scheduleGantt'));
      expect(dest.title).toBe('Schedule');
    });
  });

  it('builds a typed option for every result type', () => {
    const groups: Partial<Record<SearchResultType, ReturnType<typeof makeGroup>>> = {};
    for (const type of SEARCH_RESULT_TYPES) {
      const item: SearchResultItem = makeItem({
        id: `${type}-x`,
        parent: type === 'budget_line' ? { type: 'work_item', id: 'w', label: 'W' } : null,
      });
      groups[type] = makeGroup(type, [item]);
    }
    const built = buildOptions(
      input({
        response: makeResponse('roof', groups),
        paperlessBaseUrl: 'https://docs.example.test',
      }),
    );
    expect(built.groups.map((g) => g.type)).toEqual([...SEARCH_RESULT_TYPES]);
    expect(built.flat.every((o) => o.kind === 'item' && !o.disabled)).toBe(true);
  });
});
