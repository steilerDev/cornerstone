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
  "chosenVendorName": string | null,
  "lines": [
    {
      "description": string,
      "quantity": number | null,
      "unit": string | null,
      "unitPrice": number | null,
      "totalAmount": number,
      "includesVat": boolean | null,
      "category": string | null,
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
9. category: extract ONE short noun phrase for the line's trade or material type (e.g., "Materials", "Labor", "Tile work", "Electrical", "Plumbing", "Roofing", "Painting", "Flooring"). Use English even on German invoices. Keep ≤ 30 characters. Output null if unclear.
10. chosenVendorName: If a list of available vendors is provided, extract the vendor name from the invoice and return the exact matching name from the list (case-sensitive match). Return null if no match found or no vendor list provided.
11. If no line items can be reliably extracted, return { "invoiceDate": null, "dueDate": null, "invoiceNumber": null, "notes": null, "chosenVendorName": null, "lines": [] }.
12. Output ONLY valid JSON, no markdown, no comments.
13. When "Document metadata (human-authored)" is provided, treat those fields as authoritative — they override anything inferred from OCR text alone. In particular: use the correspondent as the vendor name, the document type for context, tags as category hints, and the document date as a cross-check for invoiceDate.`;

export function buildUserPrompt(ocrText: string, hints: ExtractionHints): string {
  const vendorName = hints.vendorName ?? 'unknown';
  const invoiceTotal = hints.invoiceTotal != null ? hints.invoiceTotal : 'unknown';
  const invoiceDate = hints.invoiceDate ?? 'unknown';
  const locale = hints.locale ?? 'de-DE';

  let prompt = `Extract line items from the following German construction invoice:

Vendor: ${vendorName}
Invoice Total (gross): ${invoiceTotal}
Invoice Date: ${invoiceDate}
Locale: ${locale}`;

  // Add available vendors list if provided
  if (hints.availableVendors && hints.availableVendors.length > 0) {
    const vendorList = hints.availableVendors.map((v) => `- ${v.name}`).join('\n');
    prompt += `\n\nAvailable vendors (return one of these names verbatim as "chosenVendorName", or null if none match):\n${vendorList}`;
  }

  // Add human-authored Paperless metadata if provided
  if (hints.paperlessMetadata) {
    const meta = hints.paperlessMetadata;
    const metaParts: string[] = [];
    if (meta.title) metaParts.push(`Title: ${meta.title}`);
    if (meta.correspondent) metaParts.push(`Correspondent: ${meta.correspondent}`);
    if (meta.documentType) metaParts.push(`Document Type: ${meta.documentType}`);
    if (meta.tags && meta.tags.length > 0) metaParts.push(`Tags: ${meta.tags.join(', ')}`);
    if (meta.created) metaParts.push(`Document Date: ${meta.created}`);
    if (meta.originalFileName) metaParts.push(`Original Filename: ${meta.originalFileName}`);
    if (metaParts.length > 0) {
      prompt += `\n\nDocument metadata (human-authored — prioritize these over OCR-inferred values):\n${metaParts.map((p) => `- ${p}`).join('\n')}`;
    }
  }

  prompt += `\n\n---
${ocrText}
---

Return the extracted data as a JSON object with schema { "invoiceDate": "YYYY-MM-DD" | null, "dueDate": "YYYY-MM-DD" | null, "invoiceNumber": string | null, "notes": string | null, "chosenVendorName": string | null, "lines": ExtractedLine[] }.

IMPORTANT: Resolve relative payment terms into a concrete dueDate (ISO) using the invoiceDate above. If invoiceDate is null, set dueDate to null.`;

  return prompt;
}

export const MERGE_SYSTEM_PROMPT = `You are an expert at summarizing German construction-invoice line items into a single consolidated line for budgeting purposes.

You will be given: (1) a list of individual line item descriptions the user wants to merge into one, (2) an optional one-sentence summary of the overall document for context, and (3) a list of previously-extracted or available budget categories.

Return a JSON object with this exact schema:
{ "description": string, "category": string | null }

IMPORTANT RULES:
1. description: Write ONE concise, unified description (max 500 characters) that captures what all the merged line items represent together. Synthesize a single coherent phrase a homeowner would recognize on a budget line — do not simply concatenate the inputs.
2. category: Choose the SINGLE best-fitting category from the provided list of available categories, returned EXACTLY as given (case-sensitive match). If none fit well, or no categories were provided, return null. Do NOT invent a new category name.
3. Do NOT include any monetary amounts, quantities, or numeric values anywhere in your output — these are computed separately.
4. Output ONLY valid JSON, no markdown, no comments.`;

export function buildMergeUserPrompt(
  descriptions: string[],
  documentSummary: string | null | undefined,
  availableCategories: string[],
): string {
  const numbered = descriptions.map((d, i) => `${i + 1}. ${d}`).join('\n');
  let prompt = `Merge the following ${descriptions.length} line item descriptions into one consolidated description and choose the best category.\n\nLine item descriptions:\n${numbered}`;
  prompt += `\n\nOverall document summary (context only): ${documentSummary?.trim() || 'none'}`;
  if (availableCategories.length > 0) {
    prompt += `\n\nAvailable categories (return one of these names verbatim as "category", or null if none fit):\n${availableCategories.map((c) => `- ${c}`).join('\n')}`;
  } else {
    prompt += `\n\nNo categories are available — return "category": null.`;
  }
  prompt += `\n\nReturn the result as a JSON object with schema { "description": string, "category": string | null }.`;
  return prompt;
}
