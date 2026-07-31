/**
 * Apply user overrides to baseline ReportContent.
 * Pure function: returns a new ReportContent without mutating the input.
 * Recognized override keys: coverLetter.{sender,recipient,reference,subject,body}, row.<id>.{usageText,attachmentsNote}
 * Unknown keys are silently ignored.
 * When sender is overridden, signature is recomputed automatically.
 */

import type { ReportContent, ReportContentOverrides } from './types.js';

export function applyOverrides(
  content: ReportContent,
  overrides: ReportContentOverrides,
): ReportContent {
  if (!overrides || Object.keys(overrides).length === 0) {
    return content;
  }

  // Deep clone to avoid mutations
  const result: ReportContent = {
    ...content,
    coverLetter: content.coverLetter ? { ...content.coverLetter } : null,
    rows: content.rows.map((row) => ({ ...row })),
    summaryRows: [...content.summaryRows],
    footnotes: [...content.footnotes],
    sourceInfo: { ...content.sourceInfo },
  };

  let senderChanged = false;

  // Apply cover letter overrides
  if (result.coverLetter) {
    if ('coverLetter.sender' in overrides) {
      result.coverLetter.sender = overrides['coverLetter.sender'];
      senderChanged = true;
    }
    if ('coverLetter.recipient' in overrides) {
      result.coverLetter.recipient = overrides['coverLetter.recipient'];
    }
    if ('coverLetter.reference' in overrides) {
      result.coverLetter.reference = overrides['coverLetter.reference'];
    }
    if ('coverLetter.subject' in overrides) {
      result.coverLetter.subject = overrides['coverLetter.subject'];
    }
    if ('coverLetter.body' in overrides) {
      result.coverLetter.body = overrides['coverLetter.body'];
    }

    // Recompute signature if sender changed
    if (senderChanged) {
      result.coverLetter.signature = result.coverLetter.sender.split('\n')[0]?.trim() ?? '';
    }
  }

  // Apply row overrides
  for (let i = 0; i < result.rows.length; i++) {
    const row = result.rows[i];
    if (!row) continue;

    const usageKey = `row.${row.invoiceId}.usageText`;
    const attachmentsKey = `row.${row.invoiceId}.attachmentsNote`;

    if (usageKey in overrides) {
      row.usageText = overrides[usageKey] || '';
    }
    if (attachmentsKey in overrides) {
      row.attachmentsNote = overrides[attachmentsKey] || null;
    }
  }

  return result;
}
