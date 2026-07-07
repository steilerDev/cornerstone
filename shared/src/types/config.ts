/**
 * Response shape for GET /api/config.
 * Returns deployment-level configuration the client needs before authentication.
 */
export interface AppConfigResponse {
  /** ISO 4217 currency code configured via CURRENCY env var. Default: 'EUR'. */
  currency: string;
  /** VAT/sales-tax rate as a fraction (e.g. 0.19 = 19%) configured via VAT_RATE env var. Default: 0.19. */
  vatRate: number;
  /** Whether LLM auto-itemization is enabled (all LLM env vars are set). */
  autoItemizeEnabled: boolean;
}
