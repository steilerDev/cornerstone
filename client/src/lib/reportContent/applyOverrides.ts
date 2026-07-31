/**
 * Apply user overrides to baseline ReportContent.
 * Pure function: returns a new ReportContent without mutating the input.
 * Recognized override keys: coverLetter.{sender,recipient,reference,subject,body}, row.<id>.{usageText,attachmentsNote}
 * Unknown keys are silently ignored.
 * When sender is overridden, signature is recomputed automatically.
 */

import type { ReportContent, ReportContentOverrides } from './types.js';
import { overrideKey } from './overrideKeys.js';

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
    if (overrideKey.coverLetter.sender in overrides) {
      const senderOverride = overrides[overrideKey.coverLetter.sender];
      if (senderOverride !== undefined) {
        result.coverLetter.sender = senderOverride;
        senderChanged = true;
      }
    }
    if (overrideKey.coverLetter.recipient in overrides) {
      const recipientOverride = overrides[overrideKey.coverLetter.recipient];
      if (recipientOverride !== undefined) {
        result.coverLetter.recipient = recipientOverride;
      }
    }
    if (overrideKey.coverLetter.reference in overrides) {
      const referenceOverride = overrides[overrideKey.coverLetter.reference];
      if (referenceOverride !== undefined) {
        result.coverLetter.reference = referenceOverride;
      }
    }
    if (overrideKey.coverLetter.subject in overrides) {
      const subjectOverride = overrides[overrideKey.coverLetter.subject];
      if (subjectOverride !== undefined) {
        result.coverLetter.subject = subjectOverride;
      }
    }
    if (overrideKey.coverLetter.body in overrides) {
      const bodyOverride = overrides[overrideKey.coverLetter.body];
      if (bodyOverride !== undefined) {
        result.coverLetter.body = bodyOverride;
      }
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

    const rowKeys = overrideKey.row(row.invoiceId);

    if (rowKeys.usageText in overrides) {
      row.usageText = overrides[rowKeys.usageText] || '';
    }
    if (rowKeys.attachmentsNote in overrides) {
      row.attachmentsNote = overrides[rowKeys.attachmentsNote] || null;
    }
  }

  return result;
}
