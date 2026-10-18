import path from 'node:path';
import type {
  BackupSchedulerStatus,
  IntegrationEnv,
  IntegrationKey,
  IntegrationsStatusResponse,
} from '@cornerstone/shared';
import {
  INTEGRATION_ENV,
  effectivePhotoMaxFileSizeBytes,
  type AppConfig,
} from '../plugins/config.js';
import {
  buildDavUrl,
  buildOidcRedirectUri,
  hostOf,
  publicUrlWithoutCredentials,
} from './publicAddress.js';

/** A fresh copy of a card's env lists, so callers can never mutate the shared table. */
function envFor(key: IntegrationKey): IntegrationEnv {
  const env = INTEGRATION_ENV[key];
  return { required: [...env.required], optional: [...env.optional] };
}

/**
 * Build the Settings > Integrations status field by field. Never spread `config`: secrets
 * (Paperless token, LLM key, OIDC client id and secret) must not be referenced here.
 */
export function buildIntegrationsStatus(input: {
  config: AppConfig;
  scheduler: BackupSchedulerStatus;
  origin: string;
}): IntegrationsStatusResponse {
  const { config, scheduler, origin } = input;

  return {
    paperless: {
      configured: config.paperlessEnabled,
      host: config.paperlessEnabled
        ? hostOf(config.paperlessExternalUrl ?? config.paperlessUrl)
        : null,
      filterTag: config.paperlessFilterTag ?? null,
      env: envFor('paperless'),
    },
    ai: {
      configured: config.llmEnabled,
      provider: config.llmEnabled ? config.llmProvider : null,
      model: config.llmEnabled ? (config.llmModel ?? null) : null,
      host: config.llmEnabled ? hostOf(config.llmBaseUrl) : null,
      env: envFor('ai'),
    },
    singleSignOn: {
      configured: config.oidcEnabled,
      issuerHost: config.oidcEnabled ? hostOf(config.oidcIssuer) : null,
      jitProvisioning: config.oidcJitProvisioning,
      redirectUri: buildOidcRedirectUri(
        publicUrlWithoutCredentials(config.externalUrl) ?? undefined,
        origin,
      ).toString(),
      env: envFor('singleSignOn'),
    },
    calendarContacts: {
      davUrl: buildDavUrl(config.externalUrl, origin),
      env: envFor('calendarContacts'),
    },
    backups: {
      enabled: scheduler.enabled,
      cadence: config.backupCadence ?? null,
      retention: config.backupRetention ?? null,
      lastRun: scheduler.lastRun,
      nextRun: scheduler.nextRuns[0] ?? null,
      env: envFor('backups'),
    },
    diaryEvents: {
      // Until #2223 removes DIARY_AUTO_EVENTS: then this becomes `enabled: true` permanently
      // and `diaryEvents.env.optional` in INTEGRATION_ENV is emptied in the same PR.
      enabled: config.diaryAutoEvents,
      env: envFor('diaryEvents'),
    },
    money: {
      currency: config.currency,
      vatRate: config.vatRate,
      env: envFor('money'),
    },
    photos: {
      storagePath: path.resolve(config.photoStoragePath),
      maxFileSizeBytes: effectivePhotoMaxFileSizeBytes(config),
      env: envFor('photos'),
    },
    publicAddress: {
      externalUrl: publicUrlWithoutCredentials(config.externalUrl),
      trustProxy: config.trustProxy,
      secureCookies: config.secureCookies,
      env: envFor('publicAddress'),
    },
  };
}
