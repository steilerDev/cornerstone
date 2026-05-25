/**
 * Prompts for LLM-based budget extraction from German construction invoices.
 */

import type { ExtractionHints } from './types.js';

export const SYSTEM_PROMPT = `You are an expert at extracting structured line items from German construction-trade invoices.

Your task is to extract line items AND document-level date fields from the provided OCR text and return a JSON object with this exact schema:
{
  "invoiceDate": "YYYY-MM-DD" | null,
  "dueDate": "YYYY-MM-DD" | null,
  "lines": [
    {
      "description": string,
      "quantity": number | null,
      "unit": string | null,
      "unitPrice": number | null,
      "totalAmount": number,
      "includesVat": boolean | null,
      "vendorName": string | null,
      "confidence": number (0-1)
    }
  ]
}

IMPORTANT RULES:
1. German decimal notation (comma = decimal separator): Convert "1.234,56" to the JSON number 1234.56.
2. All extractions assume 19% German VAT (MwSt./USt.) — output "includesVat": true or false only. Do NOT output a "vatRate" field.
3. Confidence scores (0-1):
   - 1.0 = explicit table row with quantity and unit price clearly visible
   - 0.5 = inferred from description-only lines or partial information
   - < 0.3 = uncertain extraction, treat as guess
4. totalAmount must always be present and should be the gross (VAT-inclusive) amount when available.
5. invoiceDate and dueDate: extract as ISO 8601 YYYY-MM-DD strings if clearly present in the document header/footer. Output null if not found.
6. If no line items can be reliably extracted, return { "invoiceDate": null, "dueDate": null, "lines": [] }.
7. Output ONLY valid JSON, no markdown, no comments.`;

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

Return the extracted data as a JSON object with schema { "invoiceDate": "YYYY-MM-DD" | null, "dueDate": "YYYY-MM-DD" | null, "lines": ExtractedLine[] }.`;
}
