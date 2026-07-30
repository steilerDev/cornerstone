/**
 * Cover letter PDF content builder.
 */
import type { TFunction } from 'i18next';
import type { Content } from 'pdfmake/build/pdfmake';
import type { SourceReportResponse, HouseholdSettings } from '@cornerstone/shared';
import { formatDateForPdf } from './shared.js';

export function buildCoverLetterContent(
  report: SourceReportResponse,
  household: HouseholdSettings | null,
  useCase: string,
  t: TFunction,
): Content[] {
  const today = formatDateForPdf(new Date());

  const content: Content[] = [];

  // Sender block
  if (household?.householdName || household?.householdAddress) {
    content.push({
      stack: [
        household?.householdName ? { text: household.householdName, style: 'normal' } : null,
        household?.householdAddress ? { text: household.householdAddress, style: 'normal' } : null,
      ].filter(Boolean) as Content[],
      margin: [0, 0, 0, 20],
    });
  }

  // Recipient block
  if (report.source.contactAddress) {
    content.push({
      text: report.source.contactAddress,
      style: 'normal',
      margin: [0, 0, 0, 20],
    });
  }

  // Date
  content.push({
    text: today,
    margin: [0, 0, 0, 20],
  });

  // Reference line
  if (report.source.reference) {
    content.push({
      text: `${t('sourceReports.coverLetter.reference')}: ${report.source.reference}`,
      style: 'small',
      margin: [0, 0, 0, 20],
    });
  }

  // Subject line
  const subject = t(`sourceReports.coverLetter.subject.${useCase}`);
  content.push({
    text: `${t('sourceReports.coverLetter.subjectLabel')}: ${subject}`,
    style: 'normal',
    margin: [0, 0, 0, 20],
  });

  // Body text
  const bodyKey = `sourceReports.coverLetter.body.${useCase}`;
  const body = t(bodyKey, { total: report.totalAmount });
  content.push({
    text: body,
    style: 'normal',
    margin: [0, 0, 0, 20],
  });

  // Signature
  if (household?.householdName) {
    content.push({
      text: household.householdName,
      style: 'normal',
      margin: [0, 40, 0, 0],
    });
  }

  // Page break before overview
  content.push({ text: '', pageBreak: 'after' });

  return content;
}
