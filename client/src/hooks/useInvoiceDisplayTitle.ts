import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { invoiceDisplayTitle } from '../lib/invoiceTitle.js';
import type { InvoiceTitleSource } from '../lib/invoiceTitle.js';

/** Display title of an invoice/offer; null while the source is not loaded. */
export function useInvoiceDisplayTitle(src: InvoiceTitleSource | null | undefined): string | null {
  const { t } = useTranslation('common');
  const vendorName = src?.vendorName;
  const invoiceNumber = src?.invoiceNumber;
  const status = src?.status;
  const invoiceNoun = t('navigation.invoice');
  const offerNoun = t('navigation.offer');
  return useMemo(
    () =>
      status
        ? invoiceDisplayTitle(
            { vendorName, invoiceNumber, status },
            { invoice: invoiceNoun, offer: offerNoun },
          )
        : null,
    [vendorName, invoiceNumber, status, invoiceNoun, offerNoun],
  );
}
