import { createContext } from 'react';
import type { RefObject } from 'react';
import type { OriginState } from '../navigation/origin.js';

export const INVOICE_FORM_KINDS = ['invoice', 'offer'] as const;
export type InvoiceFormKind = (typeof INVOICE_FORM_KINDS)[number];

/** The task or purchase a new invoice is for (creates one cost line for the full amount). */
export interface InvoiceFormItem {
  readonly type: 'work_item' | 'household_item';
  readonly id: string;
  readonly label: string;
}

export interface InvoiceCreateRequest {
  readonly kind: InvoiceFormKind;
  readonly company?: { readonly id: string; readonly name?: string };
  readonly item?: InvoiceFormItem;
  /** A Paperless document to start from (applied once Paperless is known to be available). */
  readonly documentId?: number;
  /** Origin for the created invoice's Back (default: the page behind). */
  readonly originState?: OriginState;
  /** Focus target on close when the opener is gone (New menu: the [data-create-trigger]). */
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

/** Opens the New invoice / New offer form in place; null outside an InvoiceCreateProvider. */
export type OpenInvoiceForm = (request: InvoiceCreateRequest) => void;

export const InvoiceCreateContext = createContext<OpenInvoiceForm | null>(null);
