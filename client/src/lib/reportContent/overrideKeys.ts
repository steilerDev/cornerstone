/**
 * Override key builders for type-safe field path construction.
 * Used in applyOverrides and ReportContentEditor to decouple string paths from manual construction.
 */

export const overrideKey = {
  coverLetter: {
    sender: 'coverLetter.sender',
    recipient: 'coverLetter.recipient',
    reference: 'coverLetter.reference',
    subject: 'coverLetter.subject',
    body: 'coverLetter.body',
  },
  row: (invoiceId: string) => ({
    usageText: `row.${invoiceId}.usageText`,
    attachmentsNote: `row.${invoiceId}.attachmentsNote`,
  }),
} as const;
