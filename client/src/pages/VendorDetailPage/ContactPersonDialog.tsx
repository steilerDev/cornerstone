import type { RefObject } from 'react';
import { ObjectForm } from '../../components/ObjectForm/ObjectForm.js';
import { useContactPersonFormSchema } from '../../objectForms/contactPersonForm.js';
import type { ContactPersonFormMode } from '../../objectForms/contactPersonForm.js';

export interface ContactPersonDialogProps {
  readonly vendorId: string;
  readonly target: ContactPersonFormMode;
  /** After a successful request: the page refresh. */
  readonly onSaved: () => Promise<unknown>;
  readonly onClose: () => void;
  /** The button that opened the dialog; Cancel and Save return focus to it. */
  readonly openerRef: RefObject<HTMLElement | null>;
}

/** The New / Edit contact person dialog; mount it only while open. */
export function ContactPersonDialog({
  vendorId,
  target,
  onSaved,
  onClose,
  openerRef,
}: ContactPersonDialogProps) {
  const schema = useContactPersonFormSchema({ ...target, vendorId, onSaved });
  return (
    <ObjectForm
      schema={schema}
      onCreated={onClose}
      onCancel={onClose}
      returnFocusRef={openerRef}
      testId="contact-person-form"
    />
  );
}

export default ContactPersonDialog;
