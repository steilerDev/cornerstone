/**
 * Apply AI-generated content to baseline ReportContent.
 * Pure function: returns a new ReportContent without mutating the input.
 * AI content overlays descriptions onto rows by invoiceId matching, and cover letter subject/body.
 * Empty string '' in AI content falls back to baseline value.
 * aiContent === null returns content unchanged.
 */

import type { GenerateReportContentResponse } from '@cornerstone/shared';
import type { ReportContent } from './types.js';

export function applyAiContent(
  content: ReportContent,
  aiContent: GenerateReportContentResponse | null,
): ReportContent {
  if (!aiContent) {
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

  // Apply cover letter AI content
  if (result.coverLetter) {
    // letterSubject: empty string falls back to baseline
    if (aiContent.letterSubject !== '') {
      result.coverLetter.subject = aiContent.letterSubject;
    }

    // letterBody: empty string falls back to baseline
    if (aiContent.letterBody !== '') {
      result.coverLetter.body = aiContent.letterBody;
    }
  }

  // Apply row usageText AI content (match by invoiceId)
  for (let i = 0; i < result.rows.length; i++) {
    const row = result.rows[i];
    if (!row) continue;

    const aiDescription = aiContent.descriptions[row.invoiceId];
    if (aiDescription !== undefined && aiDescription !== '') {
      row.usageText = aiDescription;
    }
  }

  return result;
}
