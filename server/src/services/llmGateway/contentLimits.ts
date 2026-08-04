/**
 * Single source of truth for AI-generated report-content length caps (AC 4.1, #1931).
 *
 * Both the prompt text (prompts.ts) that instructs the LLM what limit to respect, and the
 * response validator (openAICompatibleProvider.ts) that truncates an overlong response, import
 * these values — it is structurally impossible for the instructed limit and the enforced limit
 * to disagree, because there is only one number for each field.
 */
export const REPORT_CONTENT_LIMITS = {
  /** Cover letter subject line, characters. */
  letterSubject: 150,
  /** Cover letter body, characters. */
  letterBody: 2000,
  /** Per-invoice usage description, characters. */
  description: 200,
} as const;
