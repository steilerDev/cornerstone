import type { ReactNode } from 'react';
import type { UndoToken } from '@cornerstone/shared';
import type { OverflowMenuItem } from '../OverflowMenu/OverflowMenu.js';
import type { OriginState } from '../../navigation/origin.js';

export interface RelatedListRow {
  readonly id: string;
  /** User text. */
  readonly title: string;
  /** routeUrl(...) of the related object's page; omitted renders plain text. */
  readonly to?: string;
  /** Status Badge(s) from useStatusBadgeVariants. */
  readonly badges?: ReactNode;
  /** Muted fact line, e.g. "Finish to start, +2 days". */
  readonly facts?: ReactNode;
  /** Formatted money, right-aligned. The host adds data-figure when it is a registry figure. */
  readonly amount?: ReactNode;
  /** Host items shown before Remove. */
  readonly menuItems?: readonly OverflowMenuItem[];
  /** Default true. */
  readonly removable?: boolean;
  /** Default true when `onEdit` is set. */
  readonly editable?: boolean;
}

export type RelatedListAction =
  | {
      readonly kind: 'button';
      readonly label: string;
      readonly onActivate: (opener: HTMLButtonElement) => void;
      readonly disabledReason?: string;
    }
  | {
      readonly kind: 'picker';
      readonly label: string;
      readonly renderPicker: (api: { readonly close: () => void }) => ReactNode;
      readonly disabledReason?: string;
    };

export interface RelatedListProps {
  /** Glossary word from the host, e.g. "Dependencies". */
  readonly title: string;
  readonly headingLevel?: 2 | 3;
  /** null = loading. */
  readonly rows: readonly RelatedListRow[] | null;
  readonly loadError?: string | null;
  readonly onRetry?: () => void;
  readonly action?: RelatedListAction;
  /** One sentence; the empty state repeats the action. */
  readonly emptyMessage: string;
  /** Set when the relation has attributes. */
  readonly onEdit?: (row: RelatedListRow, opener: HTMLButtonElement) => void;
  /** Host DELETE; the host reloads its rows before resolving. */
  readonly onRemove?: (row: RelatedListRow) => Promise<UndoToken>;
  /** After a successful Undo: the host reloads. */
  readonly onRestored?: (row: RelatedListRow) => Promise<void> | void;
  /** Origin state for row links (useOriginState()). */
  readonly linkState?: OriginState;
  /** Default 10; more rows collapse behind "Show all (n)". */
  readonly collapsedLimit?: number;
  readonly testId: string;
}
