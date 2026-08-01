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

export function markInvoicesClaimed(
  sourceId: string,
  invoiceIds: string[],
  depositIds: string[],
): Promise<MarkClaimedResponse> {
  return post<MarkClaimedResponse>('/source-reports/mark-claimed', {
    sourceId,
    invoiceIds,
    depositIds,
  });
}

export function generateReportContent(
  body: GenerateReportContentRequest,
): Promise<GenerateReportContentResponse> {
  return post<GenerateReportContentResponse>('/source-reports/generate-content', body);
}
