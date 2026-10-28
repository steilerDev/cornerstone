import type { RefObject } from 'react';
import { ObjectForm } from '../../components/ObjectForm/ObjectForm.js';
import { useMilestoneLinkFormSchema } from '../../objectForms/milestoneLinkForm.js';

export interface MilestoneLinkDialogProps {
  readonly workItemId: string;
  readonly requiredIds: readonly string[];
  readonly linkedIds: readonly string[];
  /** After a successful request: reloads the relations and the page. */
  readonly onSaved: () => Promise<unknown>;
  readonly onClose: () => void;
  /** The button that opened the dialog; Cancel and Save return focus to it. */
  readonly openerRef: RefObject<HTMLElement | null>;
}

/** The Link milestone dialog; mount it only while open. */
export function MilestoneLinkDialog({
  workItemId,
  requiredIds,
  linkedIds,
  onSaved,
  onClose,
  openerRef,
}: MilestoneLinkDialogProps) {
  const schema = useMilestoneLinkFormSchema({ workItemId, requiredIds, linkedIds, onSaved });
  return (
    <ObjectForm
      schema={schema}
      onCreated={onClose}
      onCancel={onClose}
      returnFocusRef={openerRef}
      testId="milestone-link-form"
    />
  );
}

export default MilestoneLinkDialog;
