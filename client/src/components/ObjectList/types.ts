import type { ReactNode } from 'react';
import type { DataTableSurface } from '../DataTable/dataTableTestId.js';

// types.ts holds types only. OBJECT_LIST_PAGE_SIZE = 100 lives in objectListUrl.ts.

export type ObjectListSurface = DataTableSurface; // 'table' | 'card'
export type SortOrder = 'asc' | 'desc';

export interface ObjectListChipOption {
  readonly value: string;
  readonly label: string;
  readonly testId?: string;
}
export interface ObjectListChipsConfig {
  /** URL parameter (default 'status'; Companies: its trade param). */
  readonly param?: string;
  /** 2–4 chips; "All" is added by ObjectList (value 'all'). */
  readonly options: readonly ObjectListChipOption[];
  /** Preselected chip (Invoices 'toPay'). Omitted: All is the start. */
  readonly defaultValue?: string;
  /** Accessible name of the chip group (default common objectList.chips.label "Filter by status"). */
  readonly ariaLabel?: string;
}

export interface ObjectListGroupMeta {
  readonly key: string;
  readonly label: string;
  /** e.g. the Late badge (icon + word); never colour alone. */
  readonly badge?: ReactNode;
  /** Done/Paid/Submitted bucket: starts collapsed while another non-empty group exists. */
  readonly done?: boolean;
}
export interface ObjectListGroupOption<T> {
  /** Never 'none'. */
  readonly value: string;
  readonly label: string;
  readonly groupOf: (item: T) => ObjectListGroupMeta;
  /** Group keys in display order; other keys follow A–Z by label (locale compare). */
  readonly order?: readonly string[];
  /** Server orders rows by this group and returns groupCounts, so it works above 100 rows (Tasks' Time window, P5.1). */
  readonly server?: boolean;
}
export interface ObjectListGroupConfig<T> {
  readonly options: readonly ObjectListGroupOption<T>[];
  /** Omitted = None. */
  readonly defaultValue?: string;
}

export interface ObjectListSortOption {
  readonly value: string;
  readonly label: string;
}
export interface ObjectListSortConfig {
  readonly options: readonly ObjectListSortOption[];
  /** Absent sortBy = this; the host maps it (e.g. Invoices' due-first server default). */
  readonly defaultValue: string;
  readonly defaultOrder: SortOrder;
}

export interface ObjectListFilterRenderContext {
  readonly value: string | null;
  readonly onChange: (next: string | null) => void;
  /** id for the field's first input (the fieldset legend labels the group). */
  readonly id: string;
}
export interface ObjectListFilterDef {
  /** URL parameter, written verbatim (existing serialisations keep working). */
  readonly param: string;
  readonly label: string;
  readonly render: (ctx: ObjectListFilterRenderContext) => ReactNode;
}

export interface ObjectListConfig<T> {
  /** Session-state and column-preference key (`table.${listKey}.columns`; reuse today's pageKey, e.g. 'work-items'). */
  readonly listKey: string;
  readonly testIdPrefix: string;
  readonly chips?: ObjectListChipsConfig;
  readonly groupBy?: ObjectListGroupConfig<T>;
  readonly sort: ObjectListSortConfig;
  readonly filters?: readonly ObjectListFilterDef[];
}

/** What the host's fetchPage receives. */
export interface ObjectListQuery {
  readonly q: string;
  /** Effective chip: explicit, else the default chip, else 'all'; 'all' while searching all. */
  readonly chip: string;
  /** q non-empty, no explicit chip, and the list has a default chip (Invoices). */
  readonly searchingAll: boolean;
  /** Only set when the active group option has `server: true`. */
  readonly serverGroup: string | null;
  readonly sortBy: string;
  readonly sortOrder: SortOrder;
  /** True when sortBy/sortOrder are the config default (absent from the URL). */
  readonly isDefaultSort: boolean;
  /** Active filter params (only the configured ones). */
  readonly filters: Readonly<Record<string, string>>;
}

export interface ObjectListPage<T, M = undefined> {
  readonly items: readonly T[];
  readonly totalItems: number;
  /** Server group counts for `serverGroup` (key → rows matching the query). */
  readonly groupCounts?: Readonly<Record<string, number>>;
  readonly meta?: M;
}

export interface ObjectListFact {
  readonly key: string;
  readonly content: ReactNode;
  /** Shrinks last (the area path). */
  readonly keep?: boolean;
}

export interface ObjectListColumn<T> {
  readonly key: string;
  readonly label: string;
  /** A sort option value; the header becomes a sort button cycling asc → desc → default. */
  readonly sortValue?: string;
  readonly render: (item: T) => ReactNode;
  readonly align?: 'start' | 'end';
  readonly width?: 'narrow' | 'medium' | 'wide';
  readonly defaultVisible?: boolean;
}

export interface ObjectListExpandable<T, C> {
  readonly getChildren: (item: T) => readonly C[];
  readonly getChildKey: (child: C, parent: T) => string;
  /** One <td> per visible column key, in order (ObjectList renders the leading cells and the trailing status/command/⋯ cells empty). */
  readonly renderChildCells: (
    child: C,
    parent: T,
    visibleColumnKeys: readonly string[],
  ) => ReactNode;
  readonly renderChildCard: (child: C, parent: T) => ReactNode;
  readonly isDefaultExpanded?: (item: T) => boolean;
  /** Translated, includes the child count. */
  readonly getExpandLabel: (item: T, expanded: boolean, childCount: number) => string;
}

export interface ObjectListLabels {
  /** Plural object name: the h1 ("Tasks"). */
  readonly title: string;
  /** "Search tasks": placeholder; the input's name is "‹search› in this list". */
  readonly search: string;
  /** "12 tasks" — announced after a settled load. */
  readonly resultCount: (count: number) => string;
  /** "Select all tasks"; required with bulkActions. */
  readonly selectAll?: string;
  readonly empty: string;
  readonly emptyDescription?: string;
  /** "No tasks match." */
  readonly noMatch: string;
  readonly loadFailed: string;
}

export interface ObjectListTitle {
  readonly text: string;
  readonly to: string;
  readonly isUserText?: boolean;
}

export interface ObjectListSearchingAll {
  /** Matches outside the default chip. */
  readonly outside: number;
  /** Labels of the chips holding them, in chip order. */
  readonly chips: readonly string[];
}
