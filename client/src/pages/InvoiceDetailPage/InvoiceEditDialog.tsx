import type { InvoiceDetail } from '@cornerstone/shared';
import { ObjectForm } from '../../components/ObjectForm/ObjectForm.js';
import { useInvoiceFormSchema } from '../../objectForms/invoiceForm.js';

export interface InvoiceEditDialogProps {
  readonly invoice: InvoiceDetail;
  /** After a successful save: the page refresh (the PATCH response lacks the money figures). */
  readonly onSaved: () => Promise<unknown>;
  readonly onClose: () => void;
}

/** Edit details of an offer or invoice: the same form as the create dialog. */
export function InvoiceEditDialog({ invoice, onSaved, onClose }: InvoiceEditDialogProps) {
  const schema = useInvoiceFormSchema({ mode: 'edit', invoice, onSaved });
  return (
    <ObjectForm schema={schema} onCreated={onClose} onCancel={onClose} testId="invoice-edit-form" />
  );
}
