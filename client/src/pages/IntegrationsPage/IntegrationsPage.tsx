import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type {
  ErrorCode,
  IntegrationsStatusResponse,
  LlmProvider,
  PaperlessStatusResponse,
} from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { CALENDAR_SYNC_ANCHOR } from '../../components/DavAccessCard/calendarSyncAnchor.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useSectionHashFocus } from '../../hooks/useSectionHashFocus.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { getIntegrationsStatus } from '../../lib/integrationsApi.js';
import { paperlessChipState } from '../../lib/integrationStatus.js';
import { getPaperlessStatus } from '../../lib/paperlessApi.js';
import { INTEGRATION_ANCHORS } from '../../navigation/IntegrationsLink.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import sharedStyles from '../../styles/shared.module.css';
import { IntegrationCard } from './IntegrationCard.js';
import type { IntegrationFact } from './IntegrationCard.js';
import styles from './IntegrationsPage.module.css';

type LoadError = { kind: 'api'; code: ErrorCode } | { kind: 'network' } | { kind: 'unexpected' };
type Probe = PaperlessStatusResponse | 'failed' | null;

/** Provider brand names are proper names: never translated. */
const AI_PROVIDER_NAMES: Record<Exclude<LlmProvider, 'generic'>, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  ollama: 'Ollama',
};

const PLACEHOLDER = '—';

function toLoadError(err: unknown): LoadError {
  if (err instanceof ApiClientError) return { kind: 'api', code: err.error.code };
  if (err instanceof NetworkError) return { kind: 'network' };
  return { kind: 'unexpected' };
}

function Code({ children }: { children: string }) {
  return <code className={styles.codeValue}>{children}</code>;
}

/**
 * Settings › Integrations: a read-only page of nine cards showing how Cornerstone is connected.
 * Everything here is set by environment variables when Cornerstone starts; the server sends the
 * variable names, so no name is written in the client.
 */
export function IntegrationsPage() {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const fmt = useFormatters();
  const variants = useStatusBadgeVariants();
  const pageTitle = tCommon('navigation.integrations');
  useDocumentTitle(pageTitle);

  const [data, setData] = useState<IntegrationsStatusResponse | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [probe, setProbe] = useState<Probe>(null);
  const [rechecking, setRechecking] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const mountedRef = useRef(true);
  const retryInFlightRef = useRef(false);
  const recheckInFlightRef = useRef(false);
  const errorHeadingRef = useRef<HTMLHeadingElement | HTMLParagraphElement>(null);
  const focusPaperlessAfterRetryRef = useRef(false);
  const announceFrameRef = useRef(0);

  // One always-mounted polite region. Clearing first makes a repeated message read again.
  const announce = useCallback((message: string) => {
    window.cancelAnimationFrame(announceFrameRef.current);
    setAnnouncement('');
    announceFrameRef.current = window.requestAnimationFrame(() => setAnnouncement(message));
  }, []);

  const runProbe = useCallback(async (): Promise<PaperlessStatusResponse | 'failed'> => {
    try {
      return await getPaperlessStatus();
    } catch {
      return 'failed';
    }
  }, []);

  /** Loads the integrations; returns true on success. Stale results after unmount are dropped. */
  const load = useCallback(async (): Promise<boolean> => {
    try {
      const response = await getIntegrationsStatus();
      if (!mountedRef.current) return false;
      setData(response);
      setLoadError(null);
      if (response.paperless.configured) {
        const result = await runProbe();
        if (mountedRef.current) setProbe(result);
      }
      return true;
    } catch (err) {
      if (mountedRef.current) setLoadError(toLoadError(err));
      return false;
    }
  }, [runProbe]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      window.cancelAnimationFrame(announceFrameRef.current);
    };
  }, [load]);

  const hasLoadError = loadError !== null;

  // When the error first appears, focus its heading (after focusPageHeadingWhenReady's frame).
  useEffect(() => {
    if (!hasLoadError) return;
    const frame = window.requestAnimationFrame(() => errorHeadingRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [hasLoadError]);

  // After a successful retry the error panel is gone: focus never falls to <body>.
  useEffect(() => {
    if (data === null || !focusPaperlessAfterRetryRef.current) return;
    focusPaperlessAfterRetryRef.current = false;
    const frame = window.requestAnimationFrame(() =>
      document.getElementById('paperless-heading')?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [data]);

  useSectionHashFocus(INTEGRATION_ANCHORS, data !== null || loadError !== null);

  const handleRetry = async () => {
    if (retryInFlightRef.current) return;
    retryInFlightRef.current = true;
    announce(t('integrations.loadError.retrying'));
    try {
      focusPaperlessAfterRetryRef.current = true;
      const ok = await load();
      if (!mountedRef.current) return;
      if (!ok) {
        focusPaperlessAfterRetryRef.current = false;
        announce(t('integrations.loadError.retryFailed'));
      }
    } finally {
      retryInFlightRef.current = false;
    }
  };

  const handleRecheck = async () => {
    if (recheckInFlightRef.current) return;
    recheckInFlightRef.current = true;
    setRechecking(true);
    try {
      const result = await runProbe();
      if (!mountedRef.current) return;
      setProbe(result);
      const connected = result !== 'failed' && result.reachable;
      announce(
        connected
          ? t('integrations.paperless.connectedAnnouncement')
          : t('integrations.paperless.stillUnreachableAnnouncement'),
      );
      // The button unmounts when the check succeeds: keep focus inside the page.
      if (connected) {
        window.requestAnimationFrame(() => document.getElementById('paperless-heading')?.focus());
      }
    } finally {
      recheckInFlightRef.current = false;
      if (mountedRef.current) setRechecking(false);
    }
  };

  const loadErrorReason = useMemo(() => {
    if (!loadError) return undefined;
    if (loadError.kind === 'api') return translateApiError(loadError.code, tErrors);
    if (loadError.kind === 'network') return tCommon('requestErrors.network');
    return tCommon('requestErrors.unexpected');
  }, [loadError, tErrors, tCommon]);

  const loadingLabel = (name: string) => t('integrations.loading', { name });
  const yesNo = (value: boolean) => (value ? t('integrations.yes') : t('integrations.no'));
  const chip = (anchor: string, value: string) => (
    <Badge variants={variants.integration} value={value} testId={`integration-${anchor}-status`} />
  );

  // ── Card content ───────────────────────────────────────────────────────────────────────
  const renderPaperless = () => {
    const paperless = data?.paperless;
    const state = paperless ? paperlessChipState(paperless.configured, probe) : null;
    const probeRunning = paperless?.configured === true && state === null;
    let chipNode: ReactNode;
    if (paperless) {
      chipNode = probeRunning ? (
        <Skeleton
          lines={1}
          className={styles.chipSkeleton}
          loadingLabel={t('integrations.paperless.checking')}
        />
      ) : (
        state && chip('paperless', state)
      );
    }
    let notice: ReactNode;
    if (paperless?.configured && state === 'unreachable') {
      notice = (
        <>
          <p className={styles.noticeText}>{t('integrations.paperless.unreachable')}</p>
          <button
            type="button"
            className={styles.recheckButton}
            aria-disabled={rechecking ? 'true' : undefined}
            onClick={() => void handleRecheck()}
            data-testid="integration-paperless-recheck"
          >
            {rechecking
              ? t('integrations.paperless.rechecking')
              : t('integrations.paperless.recheck')}
          </button>
        </>
      );
    } else if (
      paperless?.filterTag != null &&
      probe !== null &&
      probe !== 'failed' &&
      probe.reachable &&
      probe.filterTag === null
    ) {
      notice = (
        <p className={styles.noticeText} data-testid="integration-paperless-tag-notice">
          {t('integrations.paperless.tagNotFound', { tag: paperless.filterTag })}
        </p>
      );
    }
    const facts: IntegrationFact[] = paperless?.configured
      ? [
          {
            name: 'address',
            label: t('integrations.paperless.address'),
            value: paperless.host ?? PLACEHOLDER,
          },
          {
            name: 'filter-tag',
            label: t('integrations.paperless.filterTag'),
            value: paperless.filterTag ?? t('integrations.paperless.filterTagNone'),
          },
        ]
      : [];
    return (
      <IntegrationCard
        anchor="paperless"
        title={t('integrations.paperless.title')}
        chip={chipNode}
        purpose={t('integrations.paperless.purpose')}
        notice={notice}
        facts={facts}
        env={paperless?.env ?? null}
        hint={t('integrations.paperless.hint')}
        loading={data === null}
        loadingLabel={loadingLabel(t('integrations.paperless.title'))}
      />
    );
  };

  const renderAi = () => {
    const ai = data?.ai;
    const provider = ai?.provider ?? null;
    const facts: IntegrationFact[] = ai?.configured
      ? [
          {
            name: 'provider',
            label: t('integrations.ai.provider'),
            value:
              provider === null
                ? PLACEHOLDER
                : provider === 'generic'
                  ? t('integrations.ai.providerGeneric')
                  : AI_PROVIDER_NAMES[provider],
          },
          { name: 'model', label: t('integrations.ai.model'), value: ai.model ?? PLACEHOLDER },
          { name: 'address', label: t('integrations.ai.address'), value: ai.host ?? PLACEHOLDER },
        ]
      : [];
    return (
      <IntegrationCard
        anchor="ai"
        title={t('integrations.ai.title')}
        chip={ai && chip('ai', ai.configured ? 'on' : 'off')}
        purpose={t('integrations.ai.purpose')}
        facts={facts}
        env={ai?.env ?? null}
        hint={t('integrations.ai.hint')}
        loading={data === null}
        loadingLabel={loadingLabel(t('integrations.ai.title'))}
      />
    );
  };

  const renderSingleSignOn = () => {
    const sso = data?.singleSignOn;
    const facts: IntegrationFact[] = [];
    if (sso?.configured) {
      facts.push(
        {
          name: 'sign-in-service',
          label: t('integrations.singleSignOn.signInService'),
          value: sso.issuerHost ?? PLACEHOLDER,
        },
        {
          name: 'new-accounts',
          label: t('integrations.singleSignOn.newAccounts'),
          value: sso.jitProvisioning
            ? t('integrations.singleSignOn.newAccountsJit')
            : t('integrations.singleSignOn.newAccountsLinkOnly'),
        },
      );
    }
    if (sso) {
      facts.push({
        name: 'redirect-address',
        label: t('integrations.singleSignOn.redirectAddress'),
        value: <Code>{sso.redirectUri}</Code>,
      });
    }
    return (
      <IntegrationCard
        anchor="single-sign-on"
        title={t('integrations.singleSignOn.title')}
        chip={sso && chip('single-sign-on', sso.configured ? 'on' : 'off')}
        purpose={t('integrations.singleSignOn.purpose')}
        facts={facts}
        env={sso?.env ?? null}
        hint={t('integrations.singleSignOn.hint')}
        loading={data === null}
        loadingLabel={loadingLabel(t('integrations.singleSignOn.title'))}
      />
    );
  };

  const renderCalendarContacts = () => {
    const dav = data?.calendarContacts;
    return (
      <IntegrationCard
        anchor="calendar-contacts"
        title={t('integrations.calendarContacts.title')}
        chip={dav && chip('calendar-contacts', 'on')}
        purpose={t('integrations.calendarContacts.purpose')}
        facts={
          dav
            ? [
                {
                  name: 'server-address',
                  label: t('integrations.calendarContacts.serverAddress'),
                  value: <Code>{dav.davUrl}</Code>,
                },
              ]
            : []
        }
        after={
          <NavAnchor
            to={`${routeUrl('settingsProfile')}#${CALENDAR_SYNC_ANCHOR}`}
            className={styles.pointer}
            data-testid="integration-calendar-contacts-link"
          >
            {t('integrations.calendarContacts.accountLink')}
            <span aria-hidden="true"> ›</span>
          </NavAnchor>
        }
        env={dav?.env ?? null}
        hint={t('integrations.calendarContacts.hint')}
        loading={data === null}
        loadingLabel={loadingLabel(t('integrations.calendarContacts.title'))}
      />
    );
  };

  const renderBackups = () => {
    const backups = data?.backups;
    const facts: IntegrationFact[] = [];
    let notice: ReactNode;
    if (backups?.enabled && backups.cadence !== null) {
      facts.push(
        {
          name: 'schedule',
          label: t('integrations.automaticBackups.schedule'),
          value: <Code>{backups.cadence}</Code>,
        },
        {
          name: 'keeps',
          label: t('integrations.automaticBackups.keeps'),
          value:
            backups.retention === null
              ? t('integrations.automaticBackups.keepsAll')
              : t('integrations.automaticBackups.keepsLatest', { count: backups.retention }),
        },
        {
          name: 'last-run',
          label: t('integrations.automaticBackups.lastRun'),
          value: backups.lastRun ? (
            <>
              {fmt.formatDateTime(backups.lastRun.timestamp)}{' '}
              <Badge
                variants={variants.backupRun}
                value={backups.lastRun.success ? 'succeeded' : 'failed'}
              />
            </>
          ) : (
            t('integrations.automaticBackups.noRunsYet')
          ),
        },
      );
      if (backups.nextRun) {
        facts.push({
          name: 'next-run',
          label: t('integrations.automaticBackups.nextRun'),
          value: fmt.formatDateTime(backups.nextRun),
        });
      }
    } else if (backups && !backups.enabled && backups.cadence !== null) {
      facts.push({
        name: 'schedule',
        label: t('integrations.automaticBackups.schedule'),
        value: <Code>{backups.cadence}</Code>,
      });
      notice = (
        <p className={styles.noticeText}>{t('integrations.automaticBackups.invalidSchedule')}</p>
      );
    }
    return (
      <IntegrationCard
        anchor="automatic-backups"
        title={t('integrations.automaticBackups.title')}
        chip={backups && chip('automatic-backups', backups.enabled ? 'on' : 'off')}
        purpose={t('integrations.automaticBackups.purpose')}
        notice={notice}
        facts={facts}
        after={
          <NavAnchor
            to={routeUrl('settingsBackups')}
            className={styles.pointer}
            data-testid="integration-automatic-backups-link"
          >
            {t('integrations.automaticBackups.backupsLink')}
            <span aria-hidden="true"> ›</span>
          </NavAnchor>
        }
        env={backups?.env ?? null}
        hint={t('integrations.automaticBackups.hint')}
        loading={data === null}
        loadingLabel={loadingLabel(t('integrations.automaticBackups.title'))}
      />
    );
  };

  const renderHistory = () => {
    const history = data?.diaryEvents;
    return (
      <IntegrationCard
        anchor="history"
        title={t('integrations.history.title')}
        chip={chip('history', 'on')}
        purpose={t('integrations.history.purpose')}
        env={history?.env ?? null}
        hint={t('integrations.history.hint')}
        docs={false}
        loading={data === null}
        loadingLabel={loadingLabel(t('integrations.history.title'))}
      />
    );
  };

  const renderMoney = () => {
    const money = data?.money;
    const percent = money ? Math.round(money.vatRate * 10000) / 100 : 0;
    const facts: IntegrationFact[] = money
      ? [
          {
            name: 'currency',
            label: t('integrations.money.currency'),
            value: t('integrations.money.currencyValue', {
              code: money.currency,
              example: fmt.formatCurrency(1234.56),
            }),
          },
          {
            name: 'vat-rate',
            label: t('integrations.money.vatRate'),
            value: fmt.formatPercent(percent, Number.isInteger(percent) ? 0 : 2),
          },
        ]
      : [];
    return (
      <IntegrationCard
        anchor="currency-vat"
        title={t('integrations.money.title')}
        purpose={t('integrations.money.purpose')}
        facts={facts}
        env={money?.env ?? null}
        hint={t('integrations.money.hint')}
        loading={data === null}
        loadingLabel={loadingLabel(t('integrations.money.title'))}
      />
    );
  };

  const renderPhotos = () => {
    const photos = data?.photos;
    const facts: IntegrationFact[] = photos
      ? [
          {
            name: 'folder',
            label: t('integrations.photos.folder'),
            value: <Code>{photos.storagePath}</Code>,
          },
          {
            name: 'largest-photo',
            label: t('integrations.photos.largestPhoto'),
            value: fmt.formatFileSize(photos.maxFileSizeBytes),
          },
        ]
      : [];
    return (
      <IntegrationCard
        anchor="photos"
        title={t('integrations.photos.title')}
        purpose={t('integrations.photos.purpose')}
        facts={facts}
        env={photos?.env ?? null}
        hint={t('integrations.photos.hint')}
        loading={data === null}
        loadingLabel={loadingLabel(t('integrations.photos.title'))}
      />
    );
  };

  const renderPublicAddress = () => {
    const address = data?.publicAddress;
    const facts: IntegrationFact[] = address
      ? [
          {
            name: 'public-address',
            label: t('integrations.publicAddress.publicAddress'),
            value: address.externalUrl ?? t('integrations.publicAddress.notSet'),
          },
          {
            name: 'behind-proxy',
            label: t('integrations.publicAddress.behindProxy'),
            value: yesNo(address.trustProxy),
          },
          {
            name: 'secure-cookies',
            label: t('integrations.publicAddress.secureCookies'),
            value: address.secureCookies
              ? t('integrations.publicAddress.secureCookiesOn')
              : t('integrations.no'),
          },
        ]
      : [];
    return (
      <IntegrationCard
        anchor="public-address"
        title={t('integrations.publicAddress.title')}
        purpose={t('integrations.publicAddress.purpose')}
        facts={facts}
        env={address?.env ?? null}
        hint={t('integrations.publicAddress.hint')}
        loading={data === null}
        loadingLabel={loadingLabel(t('integrations.publicAddress.title'))}
      />
    );
  };

  return (
    <PageLayout maxWidth="narrow" title={pageTitle}>
      <p className={styles.intro} data-testid="integrations-intro">
        {t('integrations.intro')}
      </p>

      {loadError ? (
        <EmptyState
          messageAs="h2"
          messageRef={errorHeadingRef}
          message={t('integrations.loadError.heading')}
          description={loadErrorReason}
          action={{
            label: t('integrations.loadError.retry'),
            onClick: () => void handleRetry(),
          }}
        />
      ) : (
        <div className={styles.sections}>
          {renderPaperless()}
          {renderAi()}
          {renderSingleSignOn()}
          {renderCalendarContacts()}
          {renderBackups()}
          {renderHistory()}
          {renderMoney()}
          {renderPhotos()}
          {renderPublicAddress()}
        </div>
      )}

      <div role="status" className={sharedStyles.srOnly} data-testid="integrations-status">
        {announcement}
      </div>
    </PageLayout>
  );
}

export default IntegrationsPage;
