/**
 * Cover letter PDF content builder.
 * Consumes ReportContent.coverLetter (text only); no data derivation.
 */
import type { Content } from 'pdfmake/build/pdfmake';
import type { ReportContent } from '../reportContent/index.js';

export interface CoverLetterOptions {
  /** Multi-PDF notice (#2161) printed as the last body paragraph of part 1. */
  partsNotice?: string;
}

export function buildCoverLetterContent(
  reportContent: ReportContent,
  options?: CoverLetterOptions,
): Content[] {
  const content: Content[] = [];
  const coverLetter = reportContent.coverLetter;

  if (!coverLetter) {
    return content;
  }

  // Sender block — small return-address caption, tightly grouped with the recipient block below.
  if (coverLetter.sender) {
    content.push({
      text: coverLetter.sender,
      style: 'small',
      margin: [0, 0, 0, 4],
    });
  }

  // Recipient block — full postal address; generous gap marks the end of the address zone.
  if (coverLetter.recipient) {
    content.push({
      text: coverLetter.recipient,
      style: 'normal',
      margin: [0, 0, 0, 32],
    });
  }

  // Date — right-aligned, conventional business-letter placement.
  content.push({
    text: coverLetter.dateLine,
    style: 'normal',
    alignment: 'right',
    margin: [0, 0, 0, 20],
  });

  // Reference line — tightly grouped with the subject directly below.
  if (coverLetter.reference) {
    content.push({
      text: `${reportContent.labels.coverLetterReferenceLabel}: ${coverLetter.reference}`,
      style: 'small',
      margin: [0, 0, 0, 4],
    });
  }

  // Subject line — bold/larger so it reads as a subject, not a sixth identical paragraph.
  content.push({
    text: `${reportContent.labels.coverLetterSubjectLabel}: ${coverLetter.subject}`,
    style: 'letterSubject',
    margin: [0, 0, 0, 16],
  });

  // Opening salutation (#2159) — own line between subject and body; 16pt bottom margin mirrors the
  // subject→opening gap (≈ one blank line at 11pt/1.4, DIN 5008). Plain node: pdfmake 0.3 has no
  // keepWithNext, and it always lands on page 1 directly above the first body line.
  content.push({ text: coverLetter.opening, style: 'normal', margin: [0, 0, 0, 16] });

  // Body text — split on double newlines so AI-generated paragraphs render with spacing
  const partsNotice = options?.partsNotice;
  const lastBodyMargin = partsNotice ? 8 : 32;
  const paragraphs = coverLetter.body.split(/\n\n+/).filter(Boolean);
  if (paragraphs.length <= 1) {
    content.push({
      text: coverLetter.body,
      style: 'normal',
      margin: [0, 0, 0, lastBodyMargin],
    });
  } else {
    for (let i = 0; i < paragraphs.length; i++) {
      content.push({
        text: paragraphs[i]!,
        style: 'normal',
        margin: [0, 0, 0, i === paragraphs.length - 1 ? lastBodyMargin : 8],
      });
    }
  }

  if (partsNotice) {
    content.push({ text: partsNotice, style: 'normal', margin: [0, 0, 0, 32] });
  }

  // Signature block — closing + reserved blank space + name are ALWAYS emitted together (AC 2.4),
  // never gated behind `if (coverLetter.signature)`: pdfmake reserves the same line height for an
  // empty text node as a non-empty one, so the block's footprint stays constant regardless of
  // whether the user has cleared the signature field (verified empirically — see the UX spec §C).
  content.push({ text: coverLetter.closing, style: 'normal', margin: [0, 0, 0, 54] });
  content.push({ text: coverLetter.signature, style: 'normal', margin: [0, 0, 0, 0] });

  // Page break before overview
  content.push({ text: '', pageBreak: 'after' });

  return content;
}
