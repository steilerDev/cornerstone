import { describe, it, expect } from '@jest/globals';
import {
  breakdownColumns,
  buildBreakdownTree,
  cellValue,
  isVisible,
  visibleTree,
} from './breakdownTree.js';
import type { BreakdownNode, ColumnLabels, TreeLabels } from './breakdownTree.js';
import {
  L1,
  L2,
  L3,
  L4,
  figures,
  makeBreakdown,
  makeEmptyBreakdown,
  sumFigures,
} from '../../test/breakdownFixtures.js';

const labels: TreeLabels = {
  noArea: 'No area',
  noCategory: 'No category',
  unassigned: 'Unassigned',
  tasks: 'Tasks',
  purchases: 'Purchases',
  withoutTask: 'Without a task',
  notYetSplit: 'Not yet split',
  untitledLine: 'No description',
  categoryName: (name, key) => (key ? `${name} [${key}]` : name),
};

const columnLabels: ColumnLabels = {
  expectedCost: 'Expected cost',
  grants: 'Grants',
  afterGrants: 'After grants',
  paid: 'Paid',
  stillToPay: 'Still to pay',
  notYetPaid: 'Not yet paid',
};

const keys = (nodes: readonly BreakdownNode[]) => nodes.map((n) => n.key);
const find = (nodes: readonly BreakdownNode[], key: string): BreakdownNode | undefined => {
  for (const node of nodes) {
    if (node.key === key) return node;
    const inner = find(node.children, key);
    if (inner) return inner;
  }
  return undefined;
};

describe('buildBreakdownTree', () => {
  const b = makeBreakdown();

  describe('By area', () => {
    const tree = buildBreakdownTree(b, 'area', labels);

    it('puts root areas first, then No area, then Not yet split', () => {
      expect(keys(tree)).toEqual(['area:a-1', 'area:none', 'not-yet-split']);
    });

    it('lists an area own items before its child areas', () => {
      const ground = find(tree, 'area:a-1')!;
      expect(keys(ground.children)).toEqual(['item:household_item:hi-1', 'area:a-2']);
      expect(ground.figures).toBe(b.byArea[0]!.figures);
    });

    it('goes down to cost lines: area, task, line', () => {
      const kitchen = find(tree, 'area:a-2')!;
      const task = kitchen.children[0]!;
      expect(task).toMatchObject({
        key: 'item:work_item:wi-1',
        kind: 'item',
        item: { kind: 'work_item', id: 'wi-1' },
        label: { text: 'Install cabinets', userText: true },
      });
      expect(keys(task.children)).toEqual(['line:l-1', 'line:l-2']);
      expect(task.children[0]).toMatchObject({ kind: 'line', line: L1, figures: L1.figures });
    });

    it('puts items without an area and a Without a task group under No area', () => {
      const none = find(tree, 'area:none')!;
      expect(none.label).toEqual({ text: 'No area', userText: false });
      expect(keys(none.children)).toEqual(['item:work_item:wi-2', 'orphans']);
      const orphans = none.children[1]!;
      expect(orphans.label).toEqual({ text: 'Without a task', userText: false });
      expect(orphans.figures).toBe(b.orphanLines);
      expect(keys(orphans.children)).toEqual(['line:l-5']);
    });

    it('labels an untitled line with the fallback text and a real description as user text', () => {
      expect(find(tree, 'line:l-4')!.label).toEqual({ text: 'No description', userText: false });
      expect(find(tree, 'line:l-1')!.label).toEqual({ text: 'Cabinet supply', userText: true });
    });

    it('ends with a Not yet split leaf carrying the unsplit figures', () => {
      const last = tree[tree.length - 1]!;
      expect(last).toMatchObject({
        key: 'not-yet-split',
        kind: 'notYetSplit',
        label: { text: 'Not yet split', userText: false },
        children: [],
      });
      expect(last.figures).toBe(b.notYetSplit);
    });

    it('omits No area, the orphan group and Not yet split when the response has none', () => {
      const lean = makeBreakdown({
        noArea: null,
        orphanLines: null,
        notYetSplit: null,
        items: b.items.filter((i) => i.areaId !== null),
        lines: b.lines.filter((l) => l.itemId !== null && l.itemId !== 'wi-2'),
      });
      expect(keys(buildBreakdownTree(lean, 'area', labels))).toEqual(['area:a-1']);
    });

    it('keeps an area without items but with child areas', () => {
      const nested = makeBreakdown({
        items: [],
        lines: [],
        noArea: null,
        orphanLines: null,
        notYetSplit: null,
      });
      const ground = find(buildBreakdownTree(nested, 'area', labels), 'area:a-1')!;
      expect(keys(ground.children)).toEqual(['area:a-2']);
      expect(ground.children[0]!.children).toEqual([]);
    });
  });

  describe('By type', () => {
    it('groups tasks (with the Without a task group) and purchases', () => {
      const tree = buildBreakdownTree(b, 'type', labels);
      expect(keys(tree)).toEqual(['type:work_items', 'type:household_items', 'not-yet-split']);
      const tasks = tree[0]!;
      expect(tasks.label.text).toBe('Tasks');
      expect(keys(tasks.children)).toEqual([
        'item:work_item:wi-1',
        'item:work_item:wi-2',
        'orphans',
      ]);
      expect(tasks.figures).toBe(b.byType.work_items);
      const purchases = tree[1]!;
      expect(purchases.label.text).toBe('Purchases');
      expect(keys(purchases.children)).toEqual(['item:household_item:hi-1']);
      expect(keys(purchases.children[0]!.children)).toEqual(['line:l-3']);
    });

    it('omits a type that has no rows', () => {
      const onlyTasks = makeBreakdown({
        items: b.items.filter((i) => i.kind === 'work_item'),
        lines: b.lines.filter((l) => l.kind === 'work_item'),
        notYetSplit: null,
      });
      expect(keys(buildBreakdownTree(onlyTasks, 'type', labels))).toEqual(['type:work_items']);
    });

    it('omits the Without a task group when there are no orphan lines', () => {
      const noOrphans = makeBreakdown({ orphanLines: null, lines: [L1, L2, L3, L4] });
      const tasks = buildBreakdownTree(noOrphans, 'type', labels)[0]!;
      expect(keys(tasks.children)).toEqual(['item:work_item:wi-1', 'item:work_item:wi-2']);
    });
  });

  describe('By category', () => {
    const tree = buildBreakdownTree(b, 'category', labels);

    it('has one group per category in response order, with cost lines as children', () => {
      expect(keys(tree)).toEqual([
        'category:cat-1',
        'category:cat-2',
        'category:none',
        'not-yet-split',
      ]);
      expect(keys(tree[0]!.children)).toEqual(['line:l-1', 'line:l-3']);
      expect(keys(tree[2]!.children)).toEqual(['line:l-4', 'line:l-5']);
    });

    it('labels the null category with the fallback and real ones as user text', () => {
      expect(tree[0]!.label).toEqual({ text: 'Materials', userText: true });
      expect(tree[2]!.label).toEqual({ text: 'No category', userText: false });
    });

    it('resolves a translated category name through categoryName', () => {
      const translated = makeBreakdown({
        byCategory: [
          {
            budgetCategoryId: 'cat-1',
            name: 'Materials',
            translationKey: 'categories.materials',
            figures: sumFigures(L1.figures, L3.figures),
          },
        ],
      });
      expect(buildBreakdownTree(translated, 'category', labels)[0]!.label.text).toBe(
        'Materials [categories.materials]',
      );
    });

    it('marks a translated category plain and a category without a key as user text', () => {
      const mixed = makeBreakdown({
        byCategory: [
          {
            budgetCategoryId: 'c-t',
            name: 'Materials',
            translationKey: 'categories.materials',
            figures: L1.figures,
          },
          { budgetCategoryId: 'c-u', name: 'My custom', translationKey: null, figures: L2.figures },
          { budgetCategoryId: 'c-e', name: 'Empty key', translationKey: '', figures: L3.figures },
          { budgetCategoryId: null, name: null, translationKey: null, figures: L4.figures },
        ],
      });
      const [translated, custom, emptyKey, none] = buildBreakdownTree(mixed, 'category', labels);
      expect(translated!.label).toEqual({
        text: 'Materials [categories.materials]',
        userText: false,
      });
      expect(custom!.label).toEqual({ text: 'My custom', userText: true });
      expect(emptyKey!.label).toEqual({ text: 'Empty key', userText: true });
      expect(none!.label).toEqual({ text: 'No category', userText: false });
    });
  });

  describe('By funding source', () => {
    const tree = buildBreakdownTree(b, 'source', labels);

    it('has one group per source with cost lines, Unassigned last', () => {
      expect(keys(tree)).toEqual(['source:bs-a', 'source:bs-b', 'source:none', 'not-yet-split']);
      expect(keys(tree[0]!.children)).toEqual(['line:l-1', 'line:l-4', 'line:l-5']);
      expect(keys(tree[1]!.children)).toEqual(['line:l-2']);
      expect(tree[2]!.label).toEqual({ text: 'Unassigned', userText: false });
      expect(keys(tree[2]!.children)).toEqual(['line:l-3']);
    });

    it('labels a named source as user text', () => {
      expect(tree[0]!.label).toEqual({ text: 'Savings', userText: true });
    });

    it('does not append Not yet split when the response has none', () => {
      const none = buildBreakdownTree(makeBreakdown({ notYetSplit: null }), 'source', labels);
      expect(keys(none)).toEqual(['source:bs-a', 'source:bs-b', 'source:none']);
    });
  });

  it('returns an empty tree for an empty breakdown in every view', () => {
    const empty = makeEmptyBreakdown();
    for (const view of ['area', 'type', 'category', 'source'] as const) {
      expect(buildBreakdownTree(empty, view, labels)).toEqual([]);
    }
  });
});

describe('breakdownColumns', () => {
  const ids = (payment: 'all' | 'paid' | 'outstanding', grants: boolean) =>
    breakdownColumns({ payment, grants }, columnLabels).map((c) => c.id);

  it('shows Expected cost, Paid and Still to pay under All', () => {
    expect(ids('all', false)).toEqual(['expectedCost', 'paid', 'stillToPay']);
  });

  it('adds Grants and After grants after Expected cost when the grants toggle is on under All', () => {
    expect(ids('all', true)).toEqual([
      'expectedCost',
      'grants',
      'afterGrants',
      'paid',
      'stillToPay',
    ]);
  });

  it('shows only Paid under Paid, whatever the grants toggle says', () => {
    expect(ids('paid', false)).toEqual(['paid']);
    expect(ids('paid', true)).toEqual(['paid']);
  });

  it('shows only Not yet paid under Not yet paid, whatever the grants toggle says', () => {
    expect(ids('outstanding', false)).toEqual(['notYetPaid']);
    expect(ids('outstanding', true)).toEqual(['notYetPaid']);
  });

  it('carries the injected header labels', () => {
    expect(breakdownColumns({ payment: 'all', grants: true }, columnLabels)).toEqual([
      { id: 'expectedCost', label: 'Expected cost' },
      { id: 'grants', label: 'Grants' },
      { id: 'afterGrants', label: 'After grants' },
      { id: 'paid', label: 'Paid' },
      { id: 'stillToPay', label: 'Still to pay' },
    ]);
  });
});

describe('cellValue', () => {
  const f = figures(500, {
    best: 450,
    worst: 600,
    grantsBest: 40,
    grants: 50,
    grantsWorst: 60,
    paid: 120,
    stillToPay: 80,
  });

  it('reads the scenario of the estimate: Low is best, Expected, High is worst', () => {
    expect(cellValue(f, 'expectedCost', 'low')).toBe(450);
    expect(cellValue(f, 'expectedCost', 'expected')).toBe(500);
    expect(cellValue(f, 'expectedCost', 'high')).toBe(600);
    expect(cellValue(f, 'grants', 'low')).toBe(40);
    expect(cellValue(f, 'grants', 'high')).toBe(60);
    expect(cellValue(f, 'afterGrants', 'low')).toBe(410);
    expect(cellValue(f, 'afterGrants', 'high')).toBe(540);
    expect(cellValue(f, 'notYetPaid', 'low')).toBe(330);
    expect(cellValue(f, 'notYetPaid', 'high')).toBe(480);
  });

  it('reads Paid and Still to pay the same in every estimate', () => {
    for (const estimate of ['low', 'expected', 'high'] as const) {
      expect(cellValue(f, 'paid', estimate)).toBe(120);
      expect(cellValue(f, 'stillToPay', estimate)).toBe(80);
    }
  });

  it('returns a negative Not yet paid as it is (an overpaid record)', () => {
    expect(cellValue(figures(100, { paid: 150 }), 'notYetPaid', 'expected')).toBe(-50);
  });
});

describe('isVisible and visibleTree', () => {
  const tree = buildBreakdownTree(makeBreakdown(), 'area', labels);

  it('shows every row under All, even one with zero cost and zero payments', () => {
    const zero: BreakdownNode = { ...tree[0]!, figures: figures(0), children: [] };
    expect(isVisible(zero, 'all', 'expected')).toBe(true);
  });

  it('hides a row without Paid under Paid and keeps one with Paid', () => {
    expect(isVisible(find(tree, 'line:l-2')!, 'paid', 'expected')).toBe(false);
    expect(isVisible(find(tree, 'line:l-1')!, 'paid', 'expected')).toBe(true);
  });

  it('hides a row whose Not yet paid is 0 under Not yet paid (a fully paid line)', () => {
    expect(isVisible(find(tree, 'line:l-3')!, 'outstanding', 'expected')).toBe(false);
    expect(isVisible(find(tree, 'line:l-2')!, 'outstanding', 'expected')).toBe(true);
  });

  it('keeps a row with negative Not yet paid under Not yet paid', () => {
    const over: BreakdownNode = { ...tree[0]!, figures: figures(100, { paid: 150 }) };
    expect(isVisible(over, 'outstanding', 'expected')).toBe(true);
  });

  it('judges Not yet paid in the chosen estimate', () => {
    const node: BreakdownNode = {
      ...tree[0]!,
      figures: figures(500, { best: 400, worst: 600, paid: 400 }),
    };
    expect(isVisible(node, 'outstanding', 'expected')).toBe(true);
    expect(isVisible(node, 'outstanding', 'low')).toBe(false);
  });

  it('prunes hidden rows at every depth under Paid', () => {
    const pruned = visibleTree(tree, 'paid', 'expected');
    expect(keys(pruned)).toEqual(['area:a-1', 'area:none', 'not-yet-split']);
    expect(find(pruned, 'line:l-2')).toBeUndefined();
    expect(find(pruned, 'line:l-1')).toBeDefined();
    expect(find(pruned, 'line:l-4')).toBeUndefined();
    expect(find(pruned, 'line:l-5')).toBeDefined();
    expect(find(pruned, 'line:l-3')).toBeDefined();
  });

  it('returns the whole tree under All', () => {
    expect(visibleTree(tree, 'all', 'expected')).toEqual(tree);
  });

  it('drops a fully paid line under Not yet paid and keeps its group and the open lines', () => {
    const pruned = visibleTree(tree, 'outstanding', 'expected');
    expect(find(pruned, 'line:l-3')).toBeUndefined();
    expect(find(pruned, 'area:a-1')).toBeDefined();
    expect(find(pruned, 'line:l-4')).toBeDefined();
    expect(find(pruned, 'line:l-5')).toBeUndefined();
  });
});
