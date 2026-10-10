import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { routeUrl } from '@cornerstone/shared';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';

/** Decorative lock (stroke icon, sized by EmptyState's .icon font-size). */
function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function NoAccessPage() {
  const { t } = useTranslation('common');
  useDocumentTitle(t('noAccess.title'), { section: false });
  return (
    <div data-testid="no-access-page">
      <EmptyState
        icon={<LockIcon />}
        messageAs="h1"
        message={t('noAccess.title')}
        description={t('noAccess.description')}
        action={{ label: t('noAccess.backLink'), href: routeUrl('home') }}
      />
    </div>
  );
}

export default NoAccessPage;
