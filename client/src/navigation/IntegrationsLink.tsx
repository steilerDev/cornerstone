import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import { useAuth } from '../contexts/AuthContext.js';
import { NavAnchor } from './NavAnchor.js';
import styles from './IntegrationsLink.module.css';

/** Section anchors of Settings › Integrations (one per card). */
export const INTEGRATION_ANCHORS = [
  'paperless',
  'ai',
  'single-sign-on',
  'calendar-contacts',
  'automatic-backups',
  'history',
  'currency-vat',
  'photos',
  'public-address',
] as const;
export type IntegrationAnchor = (typeof INTEGRATION_ANCHORS)[number];

export interface IntegrationsLinkProps {
  anchor: IntegrationAnchor;
  className?: string;
  testId?: string;
}

/**
 * "See Integrations": admin-only pointer to a card on Settings › Integrations. Renders nothing
 * for members, who cannot open that page.
 */
export function IntegrationsLink({ anchor, className, testId }: IntegrationsLinkProps): ReactNode {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  if (user?.role !== 'admin') return null;
  return (
    <NavAnchor
      to={`${routeUrl('settingsIntegrations')}#${anchor}`}
      className={className ? `${styles.link} ${className}` : styles.link}
      data-testid={testId}
    >
      {t('integrationsLink.label')}
    </NavAnchor>
  );
}
