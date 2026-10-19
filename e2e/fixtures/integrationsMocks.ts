/**
 * Synthetic response builders for Settings > Integrations (#2217).
 *
 * The E2E container runs with Paperless off, AI off and single sign-on on. Every other state is
 * produced by mocking `GET /api/settings/integrations` and `GET /api/paperless/status` with the
 * bodies below. All hosts end in `.example.test`; no value is real.
 */

import type { IntegrationsStatusResponse } from '@cornerstone/shared';

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object | null
      ? DeepPartial<NonNullable<T[K]>> | null
      : T[K];
};

/** A fully configured installation, every card populated. */
export const CONFIGURED_INTEGRATIONS: IntegrationsStatusResponse = {
  paperless: {
    configured: true,
    host: 'paperless.example.test',
    filterTag: 'cornerstone',
    env: {
      required: ['PAPERLESS_URL', 'PAPERLESS_API_TOKEN'],
      optional: ['PAPERLESS_EXTERNAL_URL', 'PAPERLESS_FILTER_TAG'],
    },
  },
  ai: {
    configured: true,
    provider: 'openai',
    model: 'example-model-1',
    host: 'llm.example.test',
    env: {
      required: ['LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL'],
      optional: ['LLM_PROVIDER', 'LLM_REQUEST_TIMEOUT_MS', 'LLM_MAX_TOKENS'],
    },
  },
  singleSignOn: {
    configured: true,
    issuerHost: 'login.example.test',
    jitProvisioning: false,
    redirectUri: 'https://house.example.test/api/auth/oidc/callback',
    env: {
      required: ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET'],
      optional: ['OIDC_JIT_PROVISIONING'],
    },
  },
  calendarContacts: {
    davUrl: 'https://house.example.test/dav/',
    env: { required: [], optional: [] },
  },
  backups: {
    enabled: true,
    cadence: '0 2 * * *',
    retention: 7,
    lastRun: { timestamp: '2026-03-22T10:00:00.000Z', success: true },
    nextRun: '2026-03-23T02:00:00.000Z',
    env: { required: ['BACKUP_CADENCE'], optional: ['BACKUP_DIR', 'BACKUP_RETENTION'] },
  },
  // History is always on (#2223): no variable, no setup.
  diaryEvents: { enabled: true, env: { required: [], optional: [] } },
  money: {
    currency: 'EUR',
    vatRate: 0.19,
    env: { required: [], optional: ['CURRENCY', 'VAT_RATE'] },
  },
  photos: {
    storagePath: '/app/data/photos',
    maxFileSizeBytes: 20 * 1024 * 1024,
    env: { required: [], optional: ['PHOTO_STORAGE_PATH', 'PHOTO_MAX_FILE_SIZE_MB'] },
  },
  publicAddress: {
    externalUrl: 'https://house.example.test',
    trustProxy: true,
    secureCookies: true,
    env: { required: [], optional: ['EXTERNAL_URL', 'TRUST_PROXY', 'SECURE_COOKIES'] },
  },
};

/** The configured body with the given cards merged over it (objects merge, arrays replace). */
export function integrationsBody(
  overrides: DeepPartial<IntegrationsStatusResponse> = {},
): IntegrationsStatusResponse {
  const merged = structuredClone(CONFIGURED_INTEGRATIONS) as unknown as Record<
    string,
    Record<string, unknown>
  >;
  for (const [card, patch] of Object.entries(overrides)) {
    Object.assign(merged[card]!, patch);
  }
  return merged as unknown as IntegrationsStatusResponse;
}

/** `GET /api/paperless/status` bodies. */
export const PAPERLESS_PROBE = {
  reachable: {
    configured: true,
    reachable: true,
    error: null,
    paperlessUrl: 'https://paperless.example.test',
    filterTag: 'cornerstone',
  },
  /** The error text is deliberately recognisable: it must never reach the DOM. */
  unreachable: {
    configured: true,
    reachable: false,
    error: 'secret-ish-detail paperless.example.test:8000',
    paperlessUrl: null,
    filterTag: null,
  },
  /** Reachable, but the configured filter tag does not exist in Paperless. */
  tagMissing: {
    configured: true,
    reachable: true,
    error: null,
    paperlessUrl: 'https://paperless.example.test',
    filterTag: null,
  },
} as const;
