/**
 * Prompts for LLM-based budget extraction from German construction invoices.
 */

import type { ExtractionHints } from './types.js';

export const SYSTEM_PROMPT = `You are an expert at extracting structured line items from German construction-trade invoices.

Your task is to extract line items from provided OCR text and return a JSON object with the schema:
{
  "lines": [
    {
      "description": string,
      "quantity": number | null,
      "unit": string | null,
      "unitPrice": number | null,
      "totalAmount": number,
      "includesVat": boolean | null,
      "vatRate": number | null,
      "vendorName": string | null,
      "confidence": number (0-1)
    }
  ]
}

IMPORTANT RULES:
1. German decimal notation (comma = decimal separator): Convert "1.234,56" to the JSON number 1234.56.
2. German VAT (MwSt./USt.): If a line shows net price and a global VAT rate, set includesVat: false and vatRate as a decimal (e.g., 0.19 for 19%).
3. Confidence scores (0-1):
   - 1.0 = explicit table row with quantity and unit price clearly visible
   - 0.5 = inferred from description-only lines or partial information
   - < 0.3 = uncertain extraction, treat as guess
4. totalAmount must always be present and should be the gross (VAT-inclusive) amount when available.
5. If no line items can be reliably extracted, return { "lines": [] }.
6. Output ONLY valid JSON, no markdown, no comments.`;

export function buildUserPrompt(ocrText: string, hints: ExtractionHints): string {
  const vendorName = hints.vendorName ?? 'unknown';
  const invoiceTotal = hints.invoiceTotal != null ? hints.invoiceTotal : 'unknown';
  const invoiceDate = hints.invoiceDate ?? 'unknown';
  const locale = hints.locale ?? 'de-DE';

  return `Extract line items from the following German construction invoice:

Vendor: ${vendorName}
Invoice Total (gross): ${invoiceTotal}
Invoice Date: ${invoiceDate}
Locale: ${locale}

---
${ocrText}
---

Return the extracted lines as a JSON object with schema { "lines": ExtractedLine[] }.`;
}
