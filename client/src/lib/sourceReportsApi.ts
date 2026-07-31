import type {
  SourceReportResponse,
  SourceReportType,
  MarkClaimedResponse,
  GenerateReportContentRequest,
  GenerateReportContentResponse,
} from '@cornerstone/shared';
import { get, post } from './apiClient.js';

export function getSourceReport(
  type: SourceReportType,
  sourceId: string,
): Promise<SourceReportResponse> {
  return get<{ report: SourceReportResponse }>(
    `/source-reports?type=${type}&sourceId=${encodeURIComponent(sourceId)}`,
  ).then((r) => r.report);
}

export function markInvoicesClaimed(invoiceIds: string[]): Promise<MarkClaimedResponse> {
  return post<MarkClaimedResponse>('/source-reports/mark-claimed', { invoiceIds });
}

export function generateReportContent(
  body: GenerateReportContentRequest,
): Promise<GenerateReportContentResponse> {
  return post<GenerateReportContentResponse>('/source-reports/generate-content', body);
}
