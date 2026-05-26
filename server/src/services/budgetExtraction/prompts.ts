/**
 * Prompts for LLM-based budget extraction from German construction invoices.
 */

import type { ExtractionHints } from './types.js';

export const SYSTEM_PROMPT = `You are an expert at extracting structured line items from German construction-trade invoices.

Your task is to extract line items AND document-level metadata fields from the provided OCR text and return a JSON object with this exact schema:
{
  "invoiceDate": "YYYY-MM-DD" | null,
  "dueDate": "YYYY-MM-DD" | null,
  "invoiceNumber": string | null,
  "notes": string | null,
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
5. invoiceDate extraction:
   - German labels: "Rechnungsdatum", "Datum", "Belegdatum" — extract as ISO YYYY-MM-DD
   - Inline patterns: "vom DD.MM.YYYY" → convert DD.MM.YYYY to ISO YYYY-MM-DD
   - CRITICAL: Do NOT confuse "Lieferdatum" (delivery date) with invoiceDate
   - Output null if not clearly found
6. dueDate extraction:
   - Explicit labels ("Fälligkeitsdatum", "Zahlbar bis", "Due date") → use verbatim ISO date
   - Immediate payment ("Zahlbar sofort", "sofort fällig", "Payable immediately", "Net 0") → dueDate = invoiceDate
   - Relative terms ("Zahlbar innerhalb von N Tagen", "Net N days", "Within N days", "Zahlung innerhalb N Tage") → invoiceDate + N days (ISO YYYY-MM-DD)
   - Skonto clauses ("2% Skonto bei Zahlung innerhalb 8 Tagen, sonst netto 30 Tage") → use the NET term (longer window: invoiceDate + 30 days)
   - If invoiceDate is null OR no payment terms found → dueDate = null
7. invoiceNumber: extract the vendor's printed invoice identifier (e.g., "INV-2024-0123", "RE 2024-042") if clearly present. Output null if not found.
8. notes: write ONE short sentence (≤120 chars) summarizing what this invoice covers (e.g., "Bathroom tile installation, March 2024"). Keep it factual and brief. Output null if you cannot determine the content.
9. If no line items can be reliably extracted, return { "invoiceDate": null, "dueDate": null, "invoiceNumber": null, "notes": null, "lines": [] }.
10. Output ONLY valid JSON, no markdown, no comments.`;

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

Return the extracted data as a JSON object with schema { "invoiceDate": "YYYY-MM-DD" | null, "dueDate": "YYYY-MM-DD" | null, "invoiceNumber": string | null, "notes": string | null, "lines": ExtractedLine[] }.

IMPORTANT: Resolve relative payment terms into a concrete dueDate (ISO) using the invoiceDate above. If invoiceDate is null, set dueDate to null.`;
}
