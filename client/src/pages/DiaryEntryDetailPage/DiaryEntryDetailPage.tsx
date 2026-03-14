import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { DiaryEntryDetail } from '@cornerstone/shared';
import { getDiaryEntry } from '../../lib/diaryApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { formatDate, formatDateTime } from '../../lib/formatters.js';
import { DiaryEntryTypeBadge } from '../../components/diary/DiaryEntryTypeBadge/DiaryEntryTypeBadge.js';
import { DiaryMetadataSummary } from '../../components/diary/DiaryMetadataSummary/DiaryMetadataSummary.js';
import shared from '../../styles/shared.module.css';
import styles from './DiaryEntryDetailPage.module.css';

export default function DiaryEntryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [entry, setEntry] = useState<DiaryEntryDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      setError('Invalid diary entry ID');
      setIsLoading(false);
      return;
    }

    const loadEntry = async () => {
      setIsLoading(true);
      setError('');
      try {
        const data = await getDiaryEntry(id);
        setEntry(data);
      } catch (err) {
        if (err instanceof ApiClientError) {
          if (err.statusCode === 404) {
            setError('Diary entry not found');
          } else {
            setError(err.error.message);
          }
        } else {
          setError('Failed to load diary entry. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    void loadEntry();
  }, [id]);

  if (isLoading) {
    return <div className={shared.loading}>Loading entry...</div>;
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={shared.bannerError}>{error}</div>
        <Link to="/diary" className={shared.btnSecondary}>
          Back to Diary
        </Link>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className={styles.page}>
        <div className={shared.emptyState}>
          <p>Diary entry not found.</p>
          <Link to="/diary" className={shared.btnPrimary}>
            Back to Diary
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <button
        type="button"
        className={styles.backButton}
        onClick={() => navigate(-1)}
        title="Go back"
      >
        ← Back
      </button>

      <div className={styles.card}>
        <header className={styles.header}>
          <div className={styles.typeBadgeContainer}>
            <DiaryEntryTypeBadge entryType={entry.entryType} size="lg" />
          </div>
          <div className={styles.headerContent}>
            {entry.title && <h1 className={styles.title}>{entry.title}</h1>}
            <div className={styles.meta}>
              <span className={styles.date}>{formatDate(entry.entryDate)}</span>
              <span className={styles.time}>{formatDateTime(entry.createdAt)}</span>
              {entry.createdBy && (
                <span className={styles.author}>by {entry.createdBy.displayName}</span>
              )}
              {entry.isAutomatic && <span className={styles.badge}>Automatic</span>}
            </div>
          </div>
        </header>

        <div className={styles.body}>{entry.body}</div>

        {entry.metadata && (
          <div className={styles.metadataSection}>
            <DiaryMetadataSummary entryType={entry.entryType} metadata={entry.metadata} />
          </div>
        )}

        {entry.photoCount > 0 && (
          <div className={styles.photoSection}>
            <p className={styles.photoLabel}>📷 {entry.photoCount} photo(s) attached</p>
          </div>
        )}

        {entry.sourceEntityType && entry.sourceEntityId && (
          <div className={styles.sourceSection}>
            <p className={styles.sourceLabel}>Related to:</p>
            <SourceEntityLink sourceType={entry.sourceEntityType} sourceId={entry.sourceEntityId} />
          </div>
        )}

        <div className={styles.timestamps}>
          <div className={styles.timestamp}>
            <span className={styles.label}>Created:</span>
            <span>{formatDateTime(entry.createdAt)}</span>
          </div>
          {entry.updatedAt && (
            <div className={styles.timestamp}>
              <span className={styles.label}>Updated:</span>
              <span>{formatDateTime(entry.updatedAt)}</span>
            </div>
          )}
        </div>
      </div>

      <Link to="/diary" className={shared.btnSecondary}>
        Back to Diary
      </Link>
    </div>
  );
}

interface SourceEntityLinkProps {
  sourceType: string;
  sourceId: string;
}

function SourceEntityLink({ sourceType, sourceId }: SourceEntityLinkProps) {
  const getRoute = (): string | null => {
    switch (sourceType) {
      case 'work_item':
        return `/project/work-items/${sourceId}`;
      case 'invoice':
        return `/budget/invoices/${sourceId}`;
      case 'milestone':
        return `/project/milestones/${sourceId}`;
      case 'budget_source':
        return '/budget/sources';
      case 'subsidy_program':
        return '/budget/subsidies';
      default:
        return null;
    }
  };

  const getLabel = (): string => {
    switch (sourceType) {
      case 'work_item':
        return 'Work Item';
      case 'invoice':
        return 'Invoice';
      case 'milestone':
        return 'Milestone';
      case 'budget_source':
        return 'Budget Sources';
      case 'subsidy_program':
        return 'Subsidy Programs';
      default:
        return sourceType;
    }
  };

  const route = getRoute();
  const label = getLabel();

  if (!route) {
    return <span>{label}</span>;
  }

  return <Link to={route}>{label}</Link>;
}
