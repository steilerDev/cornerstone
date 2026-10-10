import type { InvoiceStatus } from '@cornerstone/shared';
import { TITLE_SEPARATOR } from '../navigation/pageIdentity.js';

export interface InvoiceTitleSource {
  readonly vendorName?: string | null;
  readonly invoiceNumber?: string | null;
  readonly status: InvoiceStatus;
}

export interface InvoiceTitleNouns {
  readonly invoice: string;
  readonly offer: string;
}

/**
 * Display title of an invoice or offer:
 * ‹company› · ‹number› | ‹company› · Invoice/Offer | ‹number› | Invoice/Offer.
 * Trims parts and never adds a '#'.
 */
export function invoiceDisplayTitle(src: InvoiceTitleSource, nouns: InvoiceTitleNouns): string {
  const noun = src.status === 'quotation' ? nouns.offer : nouns.invoice;
  const company = src.vendorName?.trim() ?? '';
  const number = src.invoiceNumber?.trim() ?? '';
  if (company && number) return `${company}${TITLE_SEPARATOR}${number}`;
  if (company) return `${company}${TITLE_SEPARATOR}${noun}`;
  if (number) return number;
  return noun;
}
