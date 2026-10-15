import { useTranslation } from 'react-i18next';
import { foldSearchText } from '@cornerstone/shared';
import type { UserResponse, VendorListItem } from '@cornerstone/shared';
import { useCompanyName } from '../../hooks/useCompanyName.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { searchCompanies } from '../../lib/vendorsApi.js';
import type { CompanyOption } from '../../objectForms/companyForm.js';
import { SearchPicker, type SearchPickerCreateAction } from '../SearchPicker/SearchPicker.js';

/**
 * Encodes a user or vendor assignment into a single string value.
 * Format: "user:<userId>" or "vendor:<vendorId>" or "" for unassigned.
 */
export function encodeAssignment(userId?: string, vendorId?: string): string {
  if (userId) return `user:${userId}`;
  if (vendorId) return `vendor:${vendorId}`;
  return '';
}

/**
 * Decodes an assignment string back into userId and vendorId.
 * Returns { userId: string | undefined, vendorId: string | undefined }.
 */
export function decodeAssignment(value: string): {
  userId: string | undefined;
  vendorId: string | undefined;
} {
  if (value.startsWith('user:')) {
    return { userId: value.slice(5), vendorId: undefined };
  }
  if (value.startsWith('vendor:')) {
    return { userId: undefined, vendorId: value.slice(7) };
  }
  return { userId: undefined, vendorId: undefined };
}

interface AssignmentOption {
  readonly id: string;
  readonly name: string;
  readonly kind: 'user' | 'vendor';
  readonly trade?: VendorListItem['trade'];
}

const NO_EXCLUDED: string[] = [];

export interface AssignmentPickerProps {
  users: UserResponse[];
  /** '' | 'user:<id>' | 'vendor:<id>' */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  /** The saved company of `value`, when the caller has it (e.g. workItem.assignedVendor). */
  knownVendor?: { id: string; name: string } | null;
  /** "New company ‹text›" row; receives the trimmed query and resolves the created company. */
  createAction?: SearchPickerCreateAction<CompanyOption>;
}

export function AssignmentPicker({
  users,
  value,
  onChange,
  disabled = false,
  id,
  knownVendor,
  createAction,
}: AssignmentPickerProps) {
  const { t } = useTranslation('common');
  const { t: tSettings } = useTranslation('settings');
  const { userId, vendorId } = decodeAssignment(value);
  // Never auto-unassign: an unknown company id is kept for the server to judge.
  const company = useCompanyName(vendorId ?? '', { known: knownVendor });

  const initialTitle = userId
    ? users.find((u) => u.id === userId)?.displayName
    : vendorId
      ? company.name
      : undefined;

  const searchFn = async (
    query: string,
    _excluded: string[],
    signal: AbortSignal,
  ): Promise<AssignmentOption[]> => {
    const wanted = foldSearchText(query);
    const people: AssignmentOption[] = users
      .filter((u) => !u.deactivatedAt && foldSearchText(u.displayName).includes(wanted))
      .map((u) => ({ id: encodeAssignment(u.id), name: u.displayName, kind: 'user' }));
    const companies: AssignmentOption[] = (await searchCompanies(query, signal)).map((v) => ({
      id: encodeAssignment(undefined, v.id),
      name: v.name,
      kind: 'vendor',
      trade: v.trade,
    }));
    return [...people, ...companies];
  };

  const mappedCreateAction: SearchPickerCreateAction<AssignmentOption> | undefined = createAction
    ? {
        getLabel: createAction.getLabel,
        show: createAction.show,
        showWhenEmpty: createAction.showWhenEmpty,
        onCreate: async (query) => {
          const created = await createAction.onCreate(query);
          return created
            ? { id: encodeAssignment(undefined, created.id), name: created.name, kind: 'vendor' }
            : null;
        },
      }
    : undefined;

  return (
    <SearchPicker<AssignmentOption>
      id={id}
      value={value}
      onChange={onChange}
      onSelectItem={(item) => {
        const picked = decodeAssignment(item.id);
        if (picked.vendorId) company.remember({ id: picked.vendorId, label: item.label });
      }}
      excludeIds={NO_EXCLUDED}
      disabled={disabled || company.isResolving}
      placeholder={t('aria.unassigned')}
      searchFn={searchFn}
      renderItem={(o) => ({ id: o.id, label: o.name })}
      renderSecondary={(o) =>
        o.kind === 'vendor' && o.trade
          ? getCategoryDisplayName(tSettings, o.trade.name, o.trade.translationKey)
          : null
      }
      showItemsOnFocus
      initialTitle={initialTitle}
      createAction={mappedCreateAction}
    />
  );
}

export default AssignmentPicker;
