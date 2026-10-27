import type { AreaResponse, UserResponse } from '@cornerstone/shared';
import type { KnownCompany } from '../../hooks/useCompanyName.js';
import type { AreaBreadcrumbSegment } from '../AreaBreadcrumb/AreaBreadcrumb.js';
import type { SearchPickerInputAriaProps, SpecialOption } from '../SearchPicker/SearchPicker.js';
import type { EntityPickerKind, WhoKind } from './entityPickerKinds.js';

/** One pickable thing, whatever its kind. Defined here so no form module has to be imported. */
export interface EntityOption {
  /** The picker value (encoded for `who` and `taskOrPurchase`). */
  readonly id: string;
  /** Name or title: exact-match text and the selected fallback. */
  readonly label: string;
  /** who: the group the option belongs to. */
  readonly group?: WhoKind;
  /** area: root-first path, including the area itself. */
  readonly path?: readonly AreaBreadcrumbSegment[];
  /** company trade (display name), orientation description. */
  readonly secondary?: string;
  /** task / taskOrPurchase: the area path of the item. */
  readonly secondaryPath?: readonly AreaBreadcrumbSegment[];
  /** taskOrPurchase: "Task" or "Purchase". */
  readonly kindWord?: string;
  /** task: the status word. */
  readonly trailing?: string;
  /** taskOrPurchase: which kind of item the option stands for. */
  readonly itemType?: 'work_item' | 'household_item';
  /** document: the Paperless document behind the option. */
  readonly document?: {
    readonly title: string;
    readonly correspondent: string | null;
    readonly created: string | null;
  };
  /** The raw id behind an encoded value. */
  readonly entityId?: string;
}

export type EntityCreate =
  | 'auto'
  | 'off'
  /** A host function (e.g. an ObjectForm child step); resolve null after opening the child. */
  | ((query: string) => Promise<EntityOption | null>)
  /** A host-defined row (own label, optionally also shown while the field is empty). */
  | {
      readonly getLabel: (query: string) => string;
      readonly onCreate: (query: string) => Promise<EntityOption | null>;
      readonly show?: 'always' | 'noExactMatch';
      readonly showWhenEmpty?: boolean;
    };

interface EntityPickerCommonProps {
  /** '' = none. */
  readonly value: string;
  /** `option` is null on clear and when a special option was chosen. */
  readonly onChange: (value: string, option: EntityOption | null) => void;
  readonly id?: string;
  /** Name of the current value when the host already has it (skips the lookup). */
  readonly selectedLabel?: string;
  /** Option ids (as they appear in `value`) that cannot be picked. */
  readonly excludeIds?: readonly string[];
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly inputAriaProps?: SearchPickerInputAriaProps;
  /** Adds the special option with value '' ("No area", "No orientation", "Top level"). */
  readonly noneLabel?: string;
  /** Further special options (their ids bypass `excludeIds`); a pick calls `onChange(id, null)`. */
  readonly specialOptions?: readonly SpecialOption[];
  /**
   * 'auto' (default) offers the provider's "New ‹kind› ‹text›" row for company, who, area,
   * orientation, trade and category (none for the task kinds, none outside the providers);
   * 'off' offers none; a host function replaces the provider.
   */
  readonly create?: EntityCreate;
  /** Mirrors the provider's create dialog being open (hosts in a Modal pass dismissible={!creating}). */
  readonly onCreatingChange?: (creating: boolean) => void;
  /** company / who: mirrors the lookup of `value`'s company being pending (hosts disable Save). */
  readonly onResolvingChange?: (resolving: boolean) => void;
  /** company / who: the saved company of `value`, when the host has it. */
  readonly knownCompany?: KnownCompany | null;
  /** company / who: called once when the company of `value` no longer exists. */
  readonly onUnknownCompany?: () => void;
  /** Add mode: a pick calls onChange but the input stays, empty and focused. */
  readonly clearOnSelect?: boolean;
  readonly autoFocus?: boolean;
  readonly emptyHint?: string;
  readonly getOptionTestId?: (option: EntityOption) => string;
}

export type EntityPickerProps = EntityPickerCommonProps &
  (
    | { readonly kind: 'who'; readonly users: readonly UserResponse[] }
    | { readonly kind: 'area'; readonly areas: readonly AreaResponse[] }
    | { readonly kind: Exclude<EntityPickerKind, 'who' | 'area'> }
  );
