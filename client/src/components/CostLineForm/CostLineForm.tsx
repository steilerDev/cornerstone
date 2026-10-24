import { ObjectForm } from '../ObjectForm/ObjectForm.js';
import { useCostLineSchema } from './costLineSchema.js';
import type { CostLineFormProps } from './types.js';
import { useCostLineOptions } from './useCostLineOptions.js';

/**
 * The one form for a single cost line: create (on a task, a purchase, or an offer or invoice),
 * edit and assign. It is an `ObjectForm` (Modal from 768px, full-screen Sheet below) with the
 * essentials first and "More details" for category, Basis, funding source and company. The grid
 * (`CostLineGridDialog`) is the many-lines path.
 */
export function CostLineForm(props: CostLineFormProps) {
  const { onClose, returnFocusRef } = props;
  const options = useCostLineOptions();
  const schema = useCostLineSchema(props, options);

  // Add another keeps the dialog open; `submit` already told the host (`onSaved`).
  return (
    <ObjectForm
      schema={schema}
      onCreated={onClose}
      onCancel={onClose}
      returnFocusRef={returnFocusRef}
      testId="cost-line-form"
    />
  );
}

export default CostLineForm;
