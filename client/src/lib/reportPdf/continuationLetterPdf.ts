/**
 * Continuation letter content builder (#2161): the one-page attachment letter that starts every
 * part after the first. Text only; strings arrive pre-translated (report language).
 */
import type { Content } from 'pdfmake/build/pdfmake';
import type { ReportContent } from '../reportContent/index.js';

export interface ContinuationLetterText {
  subject: string;
  body: string;
  invoicesHeading: string;
  invoiceLines: string[];
}

const MAX_INDIVIDUAL_LINES = 12;

export function buildContinuationLetterContent(
  content: ReportContent,
  letter: ContinuationLetterText,
): Content[] {
  const nodes: Content[] = [];
  const cl = content.coverLetter;

  if (cl?.sender) {
    nodes.push({ text: cl.sender, style: 'small', margin: [0, 0, 0, 4] });
  }
  if (cl?.recipient) {
    nodes.push({ text: cl.recipient, style: 'normal', margin: [0, 0, 0, 32] });
  }
  nodes.push({
    text: cl?.dateLine ?? content.sourceInfo.generatedAtText,
    style: 'normal',
    alignment: 'right',
    margin: [0, 0, 0, 20],
  });
  if (cl?.reference) {
    nodes.push({
      text: `${content.labels.coverLetterReferenceLabel}: ${cl.reference}`,
      style: 'small',
      margin: [0, 0, 0, 4],
    });
  }
  nodes.push({
    text: `${content.labels.coverLetterSubjectLabel}: ${letter.subject}`,
    style: 'letterSubject',
    margin: [0, 0, 0, 16],
  });
  if (cl) {
    nodes.push({ text: cl.opening, style: 'normal', margin: [0, 0, 0, 16] });
  }
  nodes.push({ text: letter.body, style: 'normal', margin: [0, 0, 0, 32] });

  nodes.push({
    text: letter.invoicesHeading,
    style: 'normal',
    bold: true,
    margin: [0, 0, 0, 8],
  });
  if (letter.invoiceLines.length <= MAX_INDIVIDUAL_LINES) {
    letter.invoiceLines.forEach((line, i) => {
      nodes.push({
        text: line,
        style: 'normal',
        margin: [0, 0, 0, i === letter.invoiceLines.length - 1 ? 32 : 2],
      });
    });
  } else {
    nodes.push({ ul: letter.invoiceLines, style: 'normal', margin: [0, 0, 0, 32] });
  }

  if (cl) {
    nodes.push({ text: cl.closing, style: 'normal', margin: [0, 0, 0, 54] });
    nodes.push({ text: cl.signature, style: 'normal', margin: [0, 0, 0, 0] });
  }

  // No trailing pageBreak: attachments are appended by pdf-lib, a break would add a blank page.
  return nodes;
}
