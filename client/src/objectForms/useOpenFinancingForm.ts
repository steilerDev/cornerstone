import { use } from 'react';
import { FinancingCreateContext } from './financingCreateContext.js';
import type { OpenFinancingForm } from './financingCreateContext.js';

/**
 * Opens the New funding source / New grant form in place through `FinancingCreateProvider`; null
 * outside the provider (unit tests). This module never imports ObjectForm.
 */
export function useOpenFinancingForm(): OpenFinancingForm | null {
  return use(FinancingCreateContext);
}
