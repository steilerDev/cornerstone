import type { BackupSchedulerLastRun } from './backup.js';

/** LLM providers the config accepts (LLM_PROVIDER, or auto-detected from LLM_BASE_URL). */
export const LLM_PROVIDERS = ['openai', 'anthropic', 'gemini', 'ollama', 'generic'] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

/** Environment variables a card names: required to switch it on, and optional tuning. */
export interface IntegrationEnv {
  required: string[];
  optional: string[];
}

export interface IntegrationsStatusResponse {
  paperless: {
    configured: boolean; // PAPERLESS_URL and PAPERLESS_API_TOKEN both set
    host: string | null; // host of PAPERLESS_EXTERNAL_URL, else of PAPERLESS_URL; null when not configured
    filterTag: string | null; // PAPERLESS_FILTER_TAG as configured
    env: IntegrationEnv;
  };
  ai: {
    configured: boolean; // LLM_BASE_URL, LLM_API_KEY and LLM_MODEL all set
    provider: LlmProvider | null; // null when not configured
    model: string | null;
    host: string | null; // host of LLM_BASE_URL
    env: IntegrationEnv;
  };
  singleSignOn: {
    configured: boolean; // issuer, client id and client secret all set
    issuerHost: string | null;
    jitProvisioning: boolean;
    redirectUri: string; // callback sent to the provider, without embedded credentials
    env: IntegrationEnv;
  };
  calendarContacts: {
    davUrl: string; // `${EXTERNAL_URL without credentials || request origin}/dav/`
    env: IntegrationEnv;
  };
  backups: {
    enabled: boolean;
    cadence: string | null;
    retention: number | null;
    lastRun: BackupSchedulerLastRun | null;
    nextRun: string | null; // ISO 8601 UTC
    env: IntegrationEnv;
  };
  diaryEvents: {
    enabled: boolean;
    env: IntegrationEnv;
  };
  money: {
    currency: string;
    vatRate: number;
    env: IntegrationEnv;
  };
  photos: {
    storagePath: string;
    maxFileSizeBytes: number;
    env: IntegrationEnv;
  };
  publicAddress: {
    externalUrl: string | null;
    trustProxy: boolean;
    secureCookies: boolean;
    env: IntegrationEnv;
  };
}

export type IntegrationKey = keyof IntegrationsStatusResponse;
