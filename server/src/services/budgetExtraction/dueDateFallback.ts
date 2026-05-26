/**
 * Fallback due date computation for extraction results.
 *
 * When the LLM fails to extract an explicit due date, this helper attempts to infer one
 * from relative payment terms found in the notes field (e.g., "Net 30 days", "Zahlbar innerhalb 10 Tagen").
 */

import type { ExtractionResult } from './types.js';

/**
 * Post-processing fallback for dueDate extraction.
 *
 * Logic:
 * 1. If dueDate already set (non-null, non-empty) → return immediately.
 * 2. If invoiceDate is not set → return immediately.
 * 3. Parse notes (lowercase) for relative payment terms using regexes:
 *    - Immediate: "(zahlbar sofort|sofort fällig|payable immediately|net\s*0)" → N = 0
 *    - Relative German: "innerhalb\s+(?:von\s+)?(\d+)\s*tag" → N = match
 *    - Relative English: "(?:within|net)\s+(\d+)\s*(?:day|days)?" → N = match
 *    - Skonto clauses: "(?:sonst|then)\s*(?:netto)?\s*(\d+)\s*tag" (NET term, preferred) → N = match
 * 4. If N matched, compute invoiceDate + N days, set dueDate = YYYY-MM-DD.
 *
 * Mutates result in place.
 */
export function computeDueDateFallback(result: ExtractionResult): void {
  // If dueDate already set, nothing to do
  if (result.dueDate) {
    return;
  }

  // If invoiceDate is not set, we cannot compute a relative due date
  if (!result.invoiceDate) {
    return;
  }

  // If notes is absent, nothing to parse
  if (!result.notes) {
    return;
  }

  const notesLower = result.notes.toLowerCase();
  let dayOffset: number | null = null;

  // Check for immediate payment patterns
  if (/(zahlbar sofort|sofort fällig|payable immediately|net\s*0)/i.test(notesLower)) {
    dayOffset = 0;
  }

  // Check for skonto clauses preferentially (longer NET term)
  // Pattern: "X% Skonto innerhalb N Tagen, sonst netto N2 Tage" → use N2
  if (dayOffset === null) {
    const skontoMatch = notesLower.match(/(?:sonst|then)\s*(?:netto)?\s*(\d+)\s*tag/i);
    if (skontoMatch) {
      dayOffset = parseInt(skontoMatch[1]!, 10);
    }
  }

  // Check for relative German payment term patterns
  if (dayOffset === null) {
    const germanMatch = notesLower.match(/innerhalb\s+(?:von\s+)?(\d+)\s*tag/i);
    if (germanMatch) {
      dayOffset = parseInt(germanMatch[1]!, 10);
    }
  }

  // Check for relative English payment term patterns
  if (dayOffset === null) {
    const englishMatch = notesLower.match(/(?:within|net)\s+(\d+)\s*(?:day|days)?/i);
    if (englishMatch) {
      dayOffset = parseInt(englishMatch[1]!, 10);
    }
  }

  // If we found a day offset, compute dueDate = invoiceDate + dayOffset
  if (dayOffset !== null) {
    try {
      const invoiceDateObj = new Date(result.invoiceDate + 'T00:00:00Z');
      invoiceDateObj.setUTCDate(invoiceDateObj.getUTCDate() + dayOffset);

      // Format as YYYY-MM-DD
      const year = invoiceDateObj.getUTCFullYear();
      const month = String(invoiceDateObj.getUTCMonth() + 1).padStart(2, '0');
      const day = String(invoiceDateObj.getUTCDate()).padStart(2, '0');

      result.dueDate = `${year}-${month}-${day}`;
    } catch {
      // Silently ignore parsing errors
    }
  }
}
