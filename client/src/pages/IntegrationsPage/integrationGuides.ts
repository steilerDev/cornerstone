import { DOCS_BASE_URL } from '../../lib/externalLinks.js';
import type { IntegrationAnchor } from '../../navigation/IntegrationsLink.js';

/** Setup guide of each card: a path on the documentation site (no leading slash). */
export const INTEGRATION_GUIDE_PATHS: Record<IntegrationAnchor, string> = {
  paperless: 'guides/documents/setup',
  ai: 'guides/budget/auto-itemize',
  'single-sign-on': 'guides/users/oidc-setup',
  'calendar-contacts': 'guides/feeds',
  'automatic-backups': 'guides/backup',
  history: 'guides/diary/automatic-events',
  'currency-vat': 'getting-started/configuration',
  photos: 'getting-started/configuration',
  'public-address': 'getting-started/configuration',
};

export function integrationGuideUrl(anchor: IntegrationAnchor): string {
  return `${DOCS_BASE_URL}/${INTEGRATION_GUIDE_PATHS[anchor]}`;
}
