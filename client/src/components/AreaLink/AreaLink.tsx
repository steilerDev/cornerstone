import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './AreaLink.module.css';

export interface AreaLinkProps {
  /** Kept for the P5.7 switch to the area page and for the default testid. */
  areaId: string;
  /** Visible text (area name or path). */
  children: ReactNode;
  tone?: 'default' | 'onPhoto';
  /** Host layout (flex / min-height in table headers). */
  className?: string;
  testId?: string;
}

/**
 * The one link from a photo surface to an area. The visible text comes first; a visually hidden
 * suffix names the destination. It passes the origin state so Back returns to the host page.
 * When route `area` is served (P5.7), this is the only place to change for the Photos page, the
 * spot viewer and the entry-page photo viewer (and `areaLinkSuffix` becomes ", open area").
 */
export function AreaLink({ areaId, children, tone = 'default', className, testId }: AreaLinkProps) {
  const { t } = useTranslation('photos');
  const originState = useOriginState();
  // A string name gets one exact accessible name ("Name, open in Areas"): a separate hidden
  // span would be read as its own box, with a space before the comma.
  const nameLabel =
    typeof children === 'string' ? `${children}${t('spots.areaLinkSuffix')}` : undefined;
  return (
    <NavAnchor
      // Interim until route `area` (P5.7) → routeUrl('area', { id: areaId })
      to={routeUrl('areas')}
      state={originState}
      className={[styles.link, tone === 'onPhoto' ? styles.onPhoto : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      aria-label={nameLabel}
      data-testid={testId ?? `area-link-${areaId}`}
    >
      {children}
      {nameLabel === undefined ? (
        <span className={sharedStyles.srOnly}>{t('spots.areaLinkSuffix')}</span>
      ) : null}
    </NavAnchor>
  );
}
