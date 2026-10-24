/**
 * The kind of document a cost line belongs to. A tuple (not a union literal) because `unionKeys.ts`
 * builds the per-kind keys of sentences whose German article differs ("das Angebot", "die Rechnung").
 */
export const COST_LINE_DOCUMENT_KINDS = ['offer', 'invoice'] as const;

export type CostLineDocumentKind = (typeof COST_LINE_DOCUMENT_KINDS)[number];
