import { useTranslation } from 'react-i18next';
import type { UserResponse, Vendor } from '@cornerstone/shared';
import styles from './AssignmentPicker.module.css';

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

export interface AssignmentPickerProps {
  users: UserResponse[];
  vendors: Vendor[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
}

export function AssignmentPicker({
  users,
  vendors,
  value,
  onChange,
  disabled = false,
  id,
}: AssignmentPickerProps) {
  const { t } = useTranslation('common');

  // Filter out deactivated users
  const activeUsers = users.filter((u) => !u.deactivatedAt);

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={styles.select}
      aria-label={t('aria.selectAssignment')}
    >
      <option value="">{t('aria.unassigned')}</option>

      {activeUsers.length > 0 && (
        <optgroup label={t('assignmentPicker.usersGroup')}>
          {activeUsers.map((user) => (
            <option key={user.id} value={encodeAssignment(user.id)}>
              {user.displayName}
            </option>
          ))}
        </optgroup>
      )}

      {vendors.length > 0 && (
        <optgroup label={t('assignmentPicker.vendorsGroup')}>
          {vendors.map((vendor) => (
            <option key={vendor.id} value={encodeAssignment(undefined, vendor.id)}>
              {vendor.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

export default AssignmentPicker;
