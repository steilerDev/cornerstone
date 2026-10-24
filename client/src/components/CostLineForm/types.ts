import type { ReactNode, RefObject } from 'react';
import type {
  CostLineHost,
  CostLineItemType,
  CostLineRow,
  CostLineTarget,
} from '../CostLineTable/types.js';

/** CostLineForm modes. */
export type CostLineFormMode =
  | { readonly kind: 'create' }
  | { readonly kind: 'edit'; readonly row: CostLineRow }
  | { readonly kind: 'assign'; readonly row: CostLineRow };

export interface CostLineFormProps {
  readonly host: CostLineHost;
  readonly mode: CostLineFormMode;
  /** Create mode only: prefill every field from this row (row ⋯ Duplicate). */
  readonly copyFrom?: CostLineRow;
  /** Called after a successful save (create: also after each Add-another save). */
  readonly onSaved: () => void;
  readonly onClose: () => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

export interface LinkInvoiceFormProps {
  readonly row: CostLineRow;
  /** Receives the display title of the offer or invoice the line was linked to ("Linked to ‹title›."). */
  readonly onSaved: (invoiceTitle: string) => void;
  readonly onClose: () => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

export interface CostLineGridDialogProps {
  readonly host: CostLineHost;
  /** 'split' = opened from the Not yet split row (title "Split ‹label›"). */
  readonly mode: 'add' | 'split';
  /** Document hosts: invoice amount − Σ itemized, from the lines response. */
  readonly remainingAmount?: number;
  readonly onSaved: (count: number) => void;
  readonly onClose: () => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

export interface CostLineExistingRef {
  readonly id: string;
  readonly type: CostLineItemType;
  readonly description: string | null;
  readonly gross: number;
}

export interface CostLineGridRowNotice {
  readonly tone: 'busy' | 'error';
  readonly text: string;
  readonly actions?: readonly { readonly id: string; readonly label: string }[];
}

/** One editable grid row; inputs keep their raw text. */
export interface CostLineGridRow {
  readonly rowId: string;
  readonly description: string;
  readonly quantity: string;
  readonly unit: string;
  readonly unitPrice: string;
  /** false = Net (default). */
  readonly includesVat: boolean;
  readonly target: CostLineTarget | null;
  readonly existingLine: CostLineExistingRef | null;
  readonly budgetCategoryId: string | null;
  readonly budgetSourceId: string | null;
  /** Only used with options.include. */
  readonly included: boolean;
  /** 0..1, AI rows only; the host renders it through renderRowExtra. */
  readonly aiCertainty?: number;
  /** Replaces the row's inputs (merge in progress / merge failed). */
  readonly notice?: CostLineGridRowNotice;
}

export type CostLineGridField =
  | 'description'
  | 'quantity'
  | 'unit'
  | 'unitPrice'
  | 'target'
  | 'budgetCategoryId'
  | 'budgetSourceId';

export type CostLineGridRowErrors = Partial<Record<CostLineGridField, string>>;

export interface CostLineGridOptions {
  /** Belongs to column + "Assign all to". */
  readonly targets: boolean;
  /** Belongs to required unless Assign all to is set. */
  readonly requireTarget: boolean;
  /** Gross must be > 0 (the line is linked to an offer/invoice). */
  readonly positiveGross: boolean;
  readonly columns?: readonly ('category' | 'fundingSource')[];
  /** Per-row Include toggle (Split with AI). */
  readonly include?: boolean;
  /** Per-row selection checkbox (Split with AI merge). */
  readonly select?: boolean;
  /** Row ⋯ "Use an existing cost line…". */
  readonly existingLines?: boolean;
}

export interface CostLineGridOption {
  readonly value: string;
  readonly label: string;
}

export interface CostLineGridProps {
  readonly rows: readonly CostLineGridRow[];
  readonly onRowsChange: (rows: readonly CostLineGridRow[]) => void;
  readonly options: CostLineGridOptions;
  readonly assignAll: CostLineTarget | null;
  readonly onAssignAllChange: (target: CostLineTarget | null) => void;
  /** Document hosts: the amount still to split; drives the footer row. */
  readonly remainingAmount?: number;
  readonly categoryOptions?: readonly CostLineGridOption[];
  readonly sourceOptions?: readonly CostLineGridOption[];
  /** true after a Save attempt: show every error, not only blurred cells. */
  readonly showAllErrors: boolean;
  readonly serverErrors?: ReadonlyMap<string, CostLineGridRowErrors>;
  /** Ctrl/⌘+S and Ctrl/⌘+Enter. */
  readonly onSaveShortcut?: () => void;
  /** Escape outside an open picker (host runs its discard guard). */
  readonly onEscape?: () => void;
  /** Polite announcements ("Row 4 removed", "Pasted 50 rows. …"); host owns the one role=status. */
  readonly onAnnounce: (message: string) => void;
  readonly selectedRowIds?: ReadonlySet<string>;
  readonly onToggleSelect?: (rowId: string) => void;
  /** Why a row linked to an existing cost line cannot be selected (its Select box is aria-disabled with this text). */
  readonly selectLinkedReason?: string;
  readonly onNoticeAction?: (rowId: string, actionId: string) => void;
  /** Extra muted content under a row's description (AI certainty on the Split with AI pages). */
  readonly renderRowExtra?: (row: CostLineGridRow) => ReactNode;
  readonly testIdPrefix?: string; // default 'cost-line-grid'
  /** Focus the first Description input on mount. */
  readonly autoFocus?: boolean;
  /** Receives the first row's Description input (a host dialog's initial focus). */
  readonly firstDescriptionRef?: RefObject<HTMLInputElement | null>;
}
