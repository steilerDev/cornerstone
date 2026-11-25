import { useMemo } from 'react';
import { ObjectForm } from '../../components/ObjectForm/ObjectForm.js';
import type { ReferenceListFormRequest } from '../../components/ReferenceList/ReferenceList.js';
import {
  costCategoryFormPrefill,
  useCostCategoryFormSchema,
} from '../../objectForms/costCategoryForm.js';
import {
  orientationFormPrefill,
  useOrientationFormSchema,
} from '../../objectForms/orientationForm.js';
import {
  purchaseCategoryFormPrefill,
  usePurchaseCategoryFormSchema,
} from '../../objectForms/purchaseCategoryForm.js';

interface ReferenceFormProps {
  readonly request: ReferenceListFormRequest;
}

/** Project setup › Cost categories › New / Edit: the cost category schema in an ObjectForm. */
export function CostCategoryForm({ request }: ReferenceFormProps) {
  const schema = useCostCategoryFormSchema({
    mode: request.mode,
    ...(request.item ? { item: request.item } : {}),
    create: request.create,
    update: request.update,
  });
  const prefill = useMemo(() => costCategoryFormPrefill(request.item), [request.item]);
  return (
    <ObjectForm
      schema={schema}
      {...(prefill ? { prefill } : {})}
      onCreated={request.onDone}
      onCancel={request.onCancel}
      returnFocusRef={request.returnFocusRef}
      testId={request.testId}
    />
  );
}

/** Project setup › Purchase categories › New / Edit. */
export function PurchaseCategoryForm({ request }: ReferenceFormProps) {
  const schema = usePurchaseCategoryFormSchema({
    mode: request.mode,
    ...(request.item ? { item: request.item } : {}),
    create: request.create,
    update: request.update,
  });
  const prefill = useMemo(() => purchaseCategoryFormPrefill(request.item), [request.item]);
  return (
    <ObjectForm
      schema={schema}
      {...(prefill ? { prefill } : {})}
      onCreated={request.onDone}
      onCancel={request.onCancel}
      returnFocusRef={request.returnFocusRef}
      testId={request.testId}
    />
  );
}

/** Project setup › Photo orientations › New / Edit. */
export function OrientationForm({ request }: ReferenceFormProps) {
  const schema = useOrientationFormSchema({
    mode: request.mode,
    ...(request.item ? { item: request.item } : {}),
    create: request.create,
    update: request.update,
  });
  const prefill = useMemo(() => orientationFormPrefill(request.item), [request.item]);
  return (
    <ObjectForm
      schema={schema}
      {...(prefill ? { prefill } : {})}
      onCreated={request.onDone}
      onCancel={request.onCancel}
      returnFocusRef={request.returnFocusRef}
      testId={request.testId}
    />
  );
}
