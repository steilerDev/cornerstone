/**
 * Response shape for GET /api/config.
 * Returns deployment-level configuration the client needs before authentication.
 */
export interface AppConfigResponse {
  /** ISO 4217 currency code configured via CURRENCY env var. Default: 'EUR'. */
  currency: string;
}
