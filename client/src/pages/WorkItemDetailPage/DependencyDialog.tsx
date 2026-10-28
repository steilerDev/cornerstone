import type { RefObject } from 'react';
import { ObjectForm } from '../../components/ObjectForm/ObjectForm.js';
import { useDependencyFormSchema } from '../../objectForms/dependencyForm.js';
import type { DependencyDirection, DependencyFormRow } from '../../objectForms/dependencyForm.js';

export type DependencyDialogTarget =
  | { readonly mode: 'add'; readonly direction: DependencyDirection }
  | {
      readonly mode: 'edit';
      readonly direction: DependencyDirection;
      readonly row: DependencyFormRow;
    };

export interface DependencyDialogProps {
  readonly workItemId: string;
  readonly target: DependencyDialogTarget;
  readonly excludeIds: readonly string[];
  /** After a successful request: the page refresh. */
  readonly onSaved: () => Promise<unknown>;
  readonly onClose: () => void;
  /** The button that opened the dialog; Cancel and Save return focus to it. */
  readonly openerRef: RefObject<HTMLElement | null>;
}

/** The Add / Edit dependency dialog; mount it only while open. */
export function DependencyDialog({
  workItemId,
  target,
  excludeIds,
  onSaved,
  onClose,
  openerRef,
}: DependencyDialogProps) {
  const schema = useDependencyFormSchema({ ...target, workItemId, excludeIds, onSaved });
  return (
    <ObjectForm
      schema={schema}
      onCreated={onClose}
      onCancel={onClose}
      returnFocusRef={openerRef}
      testId="dependency-form"
    />
  );
}

export default DependencyDialog;
