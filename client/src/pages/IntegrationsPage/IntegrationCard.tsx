import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { IntegrationEnv } from '@cornerstone/shared';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import type { IntegrationAnchor } from '../../navigation/IntegrationsLink.js';
import { integrationGuideUrl } from './integrationGuides.js';
import styles from './IntegrationsPage.module.css';

export interface IntegrationFact {
  /** Stable name, used in the test id. */
  name: string;
  label: string;
  value: ReactNode;
}

export interface IntegrationCardProps {
  anchor: IntegrationAnchor;
  title: string;
  /** A Badge or a one-line Skeleton; omitted for cards without a status. */
  chip?: ReactNode;
  purpose: string;
  /** Warning shown above the facts (static, not a live region). */
  notice?: ReactNode;
  facts?: readonly IntegrationFact[];
  /** In-app pointer row after the facts. */
  after?: ReactNode;
  /** Environment names from the server; null while loading. */
  env: IntegrationEnv | null;
  hint: string;
  /** Show the docs link (default true). */
  docs?: boolean;
  loading: boolean;
  loadingLabel: string;
}

function EnvGroup({ label, names }: { label: string; names: readonly string[] }) {
  return (
    <div>
      <dt className={styles.envGroupLabel}>{label}</dt>
      <dd className={styles.envGroupValue}>
        <ul className={styles.envList}>
          {names.map((name) => (
            <li key={name}>
              <code className={styles.envName}>{name}</code>
            </li>
          ))}
        </ul>
      </dd>
    </div>
  );
}

/** One card of Settings › Integrations: heading, status chip, purpose, facts and setup block. */
export function IntegrationCard({
  anchor,
  title,
  chip,
  purpose,
  notice,
  facts,
  after,
  env,
  hint,
  docs = true,
  loading,
  loadingLabel,
}: IntegrationCardProps) {
  const { t } = useTranslation('settings');
  return (
    <section
      id={anchor}
      aria-labelledby={`${anchor}-heading`}
      className={styles.card}
      data-testid={`integration-${anchor}`}
    >
      <div className={styles.cardHeader}>
        <h2 id={`${anchor}-heading`} tabIndex={-1} className={styles.cardTitle}>
          {title}
        </h2>
        {chip}
      </div>
      <p className={styles.purpose}>{purpose}</p>
      {loading ? (
        <Skeleton lines={3} loadingLabel={loadingLabel} />
      ) : (
        <>
          {notice && <div className={styles.notice}>{notice}</div>}
          {facts && facts.length > 0 ? (
            <dl className={styles.facts}>
              {facts.map((fact) => (
                <div
                  key={fact.name}
                  className={styles.factRow}
                  data-testid={`integration-${anchor}-fact-${fact.name}`}
                >
                  <dt className={styles.factLabel}>{fact.label}</dt>
                  <dd className={styles.factValue}>{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {after}
          <div className={styles.setup}>
            <h3 className={styles.setupTitle}>{t('integrations.setup.heading')}</h3>
            <p className={styles.hint}>{hint}</p>
            {env &&
              (env.required.length + env.optional.length === 0 ? (
                <p className={styles.hint}>{t('integrations.setup.noServerSetup')}</p>
              ) : (
                <dl className={styles.envGroups} data-testid={`integration-${anchor}-env`}>
                  {env.required.length > 0 && (
                    <EnvGroup label={t('integrations.setup.required')} names={env.required} />
                  )}
                  {env.optional.length > 0 && (
                    <EnvGroup label={t('integrations.setup.optional')} names={env.optional} />
                  )}
                </dl>
              ))}
            {docs && (
              <a
                className={styles.docsLink}
                href={integrationGuideUrl(anchor)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('integrations.docs.linkLabel', { name: title })}
                data-testid={`integration-${anchor}-docs`}
              >
                {t('integrations.docs.link')}
                <span aria-hidden="true"> ↗</span>
              </a>
            )}
          </div>
        </>
      )}
    </section>
  );
}
