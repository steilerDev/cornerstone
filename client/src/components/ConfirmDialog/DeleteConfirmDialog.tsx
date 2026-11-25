import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { DeleteImpactEntityType } from '@cornerstone/shared';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { ConfirmDialog } from './ConfirmDialog.js';

export interface DeleteConfirmDialogProps {
  readonly entityType: DeleteImpactEntityType;
  readonly id: string | number;
  /** The record's display name: the same expression on the list and on the page. */
  readonly name: string;
  readonly busy: boolean;
  readonly error?: string | null;
  /** Set after a 409 from the DELETE. */
  readonly blocked?: boolean;
  /** Default true. False only when the DELETE answers with an Undo token (areas). */
  readonly irreversible?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly testIdPrefix: string;
}

/**
 * The one delete confirmation for a record others reference: "Delete ‹name›?", the server's
 * delete-impact counts, "This can't be undone." Mount it only while open (the counts load on mount).
 */
export function DeleteConfirmDialog({
  entityType,
  id,
  name,
  busy,
  error = null,
  blocked = false,
  irreversible = true,
  onConfirm,
  onCancel,
  returnFocusRef,
  testIdPrefix,
}: DeleteConfirmDialogProps) {
  const { t } = useTranslation('common');
  const consequences = useDeleteImpact(entityType, id);
  return (
    <ConfirmDialog
      title={t('confirmDialog.deleteTitle', { name })}
      consequences={consequences}
      irreversible={irreversible}
      tone="danger"
      confirmLabel={t('button.delete')}
      busyLabel={t('confirmDialog.deleting')}
      busy={busy}
      error={error}
      blocked={blocked}
      onConfirm={onConfirm}
      onCancel={onCancel}
      returnFocusRef={returnFocusRef}
      testIdPrefix={testIdPrefix}
    />
  );
}
