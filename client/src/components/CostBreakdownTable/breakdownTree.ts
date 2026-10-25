import type {
  BreakdownFigures,
  BreakdownItem,
  BreakdownItemKind,
  BreakdownLine,
  BudgetBreakdown,
} from '@cornerstone/shared';
import { ESTIMATE_SCENARIO } from './breakdownSettings.js';
import type {
  BreakdownEstimate,
  BreakdownPayment,
  BreakdownSettings,
  BreakdownView,
} from './breakdownSettings.js';

export type BreakdownNodeKind = 'group' | 'item' | 'line' | 'notYetSplit';

export interface BreakdownNode {
  /** `area:<id>` | `area:none` | `type:<type>` | `category:<id|none>` | `source:<id|none>` | `orphans` | `item:<kind>:<id>` | `line:<id>` | `not-yet-split` */
  readonly key: string;
  readonly kind: BreakdownNodeKind;
  readonly label: { readonly text: string; readonly userText: boolean };
  /** Item rows link to their page. */
  readonly item?: { readonly kind: BreakdownItemKind; readonly id: string };
  /** Line rows carry the state chip. */
  readonly line?: BreakdownLine;
  readonly figures: BreakdownFigures;
  readonly children: readonly BreakdownNode[];
}

export type BreakdownColumnId =
  'expectedCost' | 'grants' | 'afterGrants' | 'paid' | 'stillToPay' | 'notYetPaid';

export interface BreakdownColumn {
  readonly id: BreakdownColumnId;
  readonly label: string;
}

/** Injected strings: this module has no i18n import. */
export interface TreeLabels {
  readonly noArea: string;
  readonly noCategory: string;
  readonly unassigned: string;
  readonly tasks: string;
  readonly purchases: string;
  readonly withoutTask: string;
  readonly notYetSplit: string;
  readonly untitledLine: string;
  readonly categoryName: (name: string, translationKey: string | null) => string;
}

export type ColumnLabels = Record<BreakdownColumnId, string>;

const plain = (text: string) => ({ text, userText: false });
const user = (text: string) => ({ text, userText: true });

function lineNode(line: BreakdownLine, labels: TreeLabels): BreakdownNode {
  return {
    key: `line:${line.id}`,
    kind: 'line',
    label: line.description ? user(line.description) : plain(labels.untitledLine),
    line,
    figures: line.figures,
    children: [],
  };
}

function itemNode(
  item: BreakdownItem,
  linesByItem: ReadonlyMap<string, BreakdownLine[]>,
  labels: TreeLabels,
): BreakdownNode {
  return {
    key: `item:${item.kind}:${item.id}`,
    kind: 'item',
    label: user(item.name),
    item: { kind: item.kind, id: item.id },
    figures: item.figures,
    children: (linesByItem.get(`${item.kind}:${item.id}`) ?? []).map((l) => lineNode(l, labels)),
  };
}

function orphansNode(b: BudgetBreakdown, labels: TreeLabels): BreakdownNode[] {
  if (b.orphanLines === null) return [];
  return [
    {
      key: 'orphans',
      kind: 'group',
      label: plain(labels.withoutTask),
      figures: b.orphanLines,
      children: b.lines.filter((l) => l.itemId === null).map((l) => lineNode(l, labels)),
    },
  ];
}

function groupLines(lines: readonly BreakdownLine[]): Map<string, BreakdownLine[]> {
  const grouped = new Map<string, BreakdownLine[]>();
  for (const line of lines) {
    if (line.itemId === null) continue;
    const key = `${line.kind}:${line.itemId}`;
    const list = grouped.get(key);
    if (list) list.push(line);
    else grouped.set(key, [line]);
  }
  return grouped;
}

function areaTree(b: BudgetBreakdown, labels: TreeLabels): BreakdownNode[] {
  const linesByItem = groupLines(b.lines);
  const build = (row: BudgetBreakdown['byArea'][number]): BreakdownNode => ({
    key: `area:${row.areaId}`,
    kind: 'group',
    label: user(row.name),
    figures: row.figures,
    children: [
      ...b.items
        .filter((item) => item.areaId === row.areaId)
        .map((item) => itemNode(item, linesByItem, labels)),
      ...b.byArea.filter((a) => a.parentId === row.areaId).map(build),
    ],
  });

  const roots = b.byArea.filter((a) => a.parentId === null).map(build);

  if (b.noArea !== null) {
    roots.push({
      key: 'area:none',
      kind: 'group',
      label: plain(labels.noArea),
      figures: b.noArea,
      children: [
        ...b.items
          .filter((item) => item.areaId === null)
          .map((item) => itemNode(item, linesByItem, labels)),
        ...orphansNode(b, labels),
      ],
    });
  }
  return roots;
}

function typeTree(b: BudgetBreakdown, labels: TreeLabels): BreakdownNode[] {
  const linesByItem = groupLines(b.lines);
  const nodes: BreakdownNode[] = [
    {
      key: 'type:work_items',
      kind: 'group',
      label: plain(labels.tasks),
      figures: b.byType.work_items,
      children: [
        ...b.items
          .filter((i) => i.kind === 'work_item')
          .map((i) => itemNode(i, linesByItem, labels)),
        ...orphansNode(b, labels),
      ],
    },
    {
      key: 'type:household_items',
      kind: 'group',
      label: plain(labels.purchases),
      figures: b.byType.household_items,
      children: b.items
        .filter((i) => i.kind === 'household_item')
        .map((i) => itemNode(i, linesByItem, labels)),
    },
  ];
  // A type without lines is omitted.
  return nodes.filter((node) => node.children.length > 0);
}

function categoryTree(b: BudgetBreakdown, labels: TreeLabels): BreakdownNode[] {
  return b.byCategory.map((row) => ({
    key: `category:${row.budgetCategoryId ?? 'none'}`,
    kind: 'group',
    label:
      row.name === null
        ? plain(labels.noCategory)
        : row.translationKey
          ? plain(labels.categoryName(row.name, row.translationKey))
          : user(row.name),
    figures: row.figures,
    children: b.lines
      .filter((l) => l.budgetCategoryId === row.budgetCategoryId)
      .map((l) => lineNode(l, labels)),
  }));
}

function sourceTree(b: BudgetBreakdown, labels: TreeLabels): BreakdownNode[] {
  return b.bySource.map((row) => ({
    key: `source:${row.budgetSourceId ?? 'none'}`,
    kind: 'group',
    label: row.name === null ? plain(labels.unassigned) : user(row.name),
    figures: row.figures,
    children: b.lines
      .filter((l) => l.budgetSourceId === row.budgetSourceId)
      .map((l) => lineNode(l, labels)),
  }));
}

/** The tree of one view down to cost lines, ending with "Not yet split" when it is non-zero. */
export function buildBreakdownTree(
  b: BudgetBreakdown,
  view: BreakdownView,
  labels: TreeLabels,
): BreakdownNode[] {
  let nodes: BreakdownNode[];
  if (view === 'area') nodes = areaTree(b, labels);
  else if (view === 'type') nodes = typeTree(b, labels);
  else if (view === 'category') nodes = categoryTree(b, labels);
  else nodes = sourceTree(b, labels);

  if (b.notYetSplit !== null) {
    nodes.push({
      key: 'not-yet-split',
      kind: 'notYetSplit',
      label: plain(labels.notYetSplit),
      figures: b.notYetSplit,
      children: [],
    });
  }
  return nodes;
}

/** Columns follow the payment basis; Grants and After grants only with All and the toggle on. */
export function breakdownColumns(
  settings: Pick<BreakdownSettings, 'payment' | 'grants'>,
  labels: ColumnLabels,
): BreakdownColumn[] {
  let ids: BreakdownColumnId[];
  if (settings.payment === 'paid') ids = ['paid'];
  else if (settings.payment === 'outstanding') ids = ['notYetPaid'];
  else if (settings.grants) ids = ['expectedCost', 'grants', 'afterGrants', 'paid', 'stillToPay'];
  else ids = ['expectedCost', 'paid', 'stillToPay'];
  return ids.map((id) => ({ id, label: labels[id] }));
}

export function cellValue(
  f: BreakdownFigures,
  column: BreakdownColumnId,
  estimate: BreakdownEstimate,
): number {
  const scenario = ESTIMATE_SCENARIO[estimate];
  switch (column) {
    case 'expectedCost':
      return f.expectedCost[scenario];
    case 'grants':
      return f.expectedGrants[scenario];
    case 'afterGrants':
      return f.afterGrants[scenario];
    case 'paid':
      return f.paid;
    case 'stillToPay':
      return f.stillToPay;
    case 'notYetPaid':
      return f.notYetPaid[scenario];
  }
}

/** A row whose basis figure is 0 is hidden: Paid under Paid, Not yet paid under Not yet paid. */
export function isVisible(
  node: BreakdownNode,
  payment: BreakdownPayment,
  estimate: BreakdownEstimate,
): boolean {
  if (payment === 'paid') return node.figures.paid !== 0;
  if (payment === 'outstanding') return cellValue(node.figures, 'notYetPaid', estimate) !== 0;
  return true;
}

/** The tree with hidden rows pruned (children are a subset of their group's figure). */
export function visibleTree(
  nodes: readonly BreakdownNode[],
  payment: BreakdownPayment,
  estimate: BreakdownEstimate,
): BreakdownNode[] {
  return nodes
    .filter((node) => isVisible(node, payment, estimate))
    .map((node) => ({ ...node, children: visibleTree(node.children, payment, estimate) }));
}
