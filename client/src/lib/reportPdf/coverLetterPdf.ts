/**
 * Cover letter PDF content builder.
 * Consumes ReportContent.coverLetter (text only); no data derivation.
 */
import type { TFunction } from 'i18next';
import type { Content } from 'pdfmake/build/pdfmake';
import type { ReportContent } from '../reportContent/index.js';

export function buildCoverLetterContent(reportContent: ReportContent, t: TFunction): Content[] {
  const content: Content[] = [];
  const coverLetter = reportContent.coverLetter;

  if (!coverLetter) {
    return content;
  }

  // Sender block
  if (coverLetter.sender) {
    content.push({
      text: coverLetter.sender,
      style: 'normal',
      margin: [0, 0, 0, 20],
    });
  }

  // Recipient block
  if (coverLetter.recipient) {
    content.push({
      text: coverLetter.recipient,
      style: 'normal',
      margin: [0, 0, 0, 20],
    });
  }

  // Date
  content.push({
    text: coverLetter.dateLine,
    margin: [0, 0, 0, 20],
  });

  // Reference line
  if (coverLetter.reference) {
    content.push({
      text: `${t('sourceReports.coverLetter.reference')}: ${coverLetter.reference}`,
      style: 'small',
      margin: [0, 0, 0, 20],
    });
  }

  // Subject line
  content.push({
    text: `${t('sourceReports.coverLetter.subjectLabel')}: ${coverLetter.subject}`,
    style: 'normal',
    margin: [0, 0, 0, 20],
  });

  // Body text
  content.push({
    text: coverLetter.body,
    style: 'normal',
    margin: [0, 0, 0, 20],
  });

  // Signature
  if (coverLetter.signature) {
    content.push({
      text: coverLetter.signature,
      style: 'normal',
      margin: [0, 40, 0, 0],
    });
  }

  // Page break before overview
  content.push({ text: '', pageBreak: 'after' });

  return content;
}
