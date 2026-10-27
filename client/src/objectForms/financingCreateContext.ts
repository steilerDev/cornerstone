import { createContext } from 'react';
import type { RefObject } from 'react';
import type { OriginState } from '../navigation/origin.js';

export const FINANCING_FORM_KINDS = ['source', 'grant'] as const;
export type FinancingFormKind = (typeof FINANCING_FORM_KINDS)[number];

export interface FinancingCreateRequest {
  readonly kind: FinancingFormKind;
  /** Focus target on close when the opener is gone (New menu: the [data-create-trigger]). */
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  /** Origin for the created object's Back (default: the page behind). */
  readonly originState?: OriginState;
}

/** Opens the New funding source / New grant form in place; null outside the provider. */
export type OpenFinancingForm = (request: FinancingCreateRequest) => void;

export const FinancingCreateContext = createContext<OpenFinancingForm | null>(null);
