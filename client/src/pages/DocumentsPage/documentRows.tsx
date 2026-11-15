import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { PaperlessDocumentSearchResult, PaperlessTag } from '@cornerstone/shared';
import badgeStyles from '../../components/Badge/Badge.module.css';
import { Badge } from '../../components/Badge/Badge.js';
import type { BadgeVariantMap } from '../../components/Badge/Badge.js';
import type { ObjectListProps } from '../../components/ObjectList/ObjectList.js';
import type { ObjectListColumn } from '../../components/ObjectList/types.js';
import { useFormatters } from '../../lib/formatters.js';
import styles from './DocumentsPage.module.css';

type Document = PaperlessDocumentSearchResult;

type RowProps = Pick<
  ObjectListProps<Document>,
  'title' | 'titleHeader' | 'columns' | 'renderStatus' | 'statusHeader' | 'facts'
>;

/** Tags shown in a row before "+n". */
export const VISIBLE_TAG_COUNT = 3;

/** The first tags of a document and how many more there are. */
export function splitTags(tags: readonly PaperlessTag[]): {
  readonly shown: readonly PaperlessTag[];
  readonly rest: number;
} {
  return {
    shown: tags.slice(0, VISIBLE_TAG_COUNT),
    rest: Math.max(0, tags.length - VISIBLE_TAG_COUNT),
  };
}

/** URL of the Documents page with the panel open on `docId`, keeping every other param. */
export function documentRowUrl(searchParams: URLSearchParams, docId: number): string {
  const query: Record<string, string> = Object.fromEntries(searchParams);
  query.doc = String(docId);
  return routeUrl('documents', undefined, query);
}

export interface UseDocumentRowsOptions {
  /** Paperless document ids linked to any record (the Linked badge). */
  readonly linkedIds: ReadonlySet<number>;
  readonly searchParams: URLSearchParams;
}

/**
 * How the Documents list draws a row: the title (opens the details panel), Type, Tags, dates and
 * archive number columns, the Linked badge and the card's three facts. No row menu: a document
 * is created, edited and deleted in Paperless, not here.
 */
export function useDocumentRows({ linkedIds, searchParams }: UseDocumentRowsOptions): RowProps {
  const { t } = useTranslation('documents');
  const { formatDate } = useFormatters();

  const linkedVariants = useMemo(
    (): BadgeVariantMap => ({
      linked: { label: t('page.badge.linked'), className: badgeStyles.completed },
    }),
    [t],
  );

  const columns = useMemo(
    (): ObjectListColumn<Document>[] => [
      {
        key: 'type',
        label: t('page.columns.type'),
        render: (doc) => <span className={styles.muted}>{doc.documentType ?? '—'}</span>,
      },
      {
        key: 'tags',
        label: t('page.columns.tags'),
        width: 'wide',
        render: (doc) => {
          if (doc.tags.length === 0) return '—';
          const { shown, rest } = splitTags(doc.tags);
          return (
            <span className={styles.tagList}>
              {shown.map((tag) => (
                <span key={tag.id} className={styles.tagChip}>
                  {tag.name}
                </span>
              ))}
              {rest > 0 ? (
                <span className={styles.tagMore}>{t('page.tagsMore', { count: rest })}</span>
              ) : null}
            </span>
          );
        },
      },
      {
        key: 'created',
        label: t('page.columns.created'),
        sortValue: 'created',
        render: (doc) => formatDate(doc.created),
      },
      {
        key: 'added',
        label: t('page.columns.added'),
        sortValue: 'added',
        defaultVisible: false,
        render: (doc) => formatDate(doc.added),
      },
      {
        key: 'modified',
        label: t('page.columns.modified'),
        sortValue: 'modified',
        defaultVisible: false,
        render: (doc) => formatDate(doc.modified),
      },
      {
        key: 'archiveNumber',
        label: t('page.columns.archiveNumber'),
        sortValue: 'archive_serial_number',
        align: 'end',
        defaultVisible: false,
        render: (doc) => <span className={styles.number}>{doc.archiveSerialNumber ?? '—'}</span>,
      },
    ],
    [t, formatDate],
  );

  return {
    title: (doc) => ({
      text: doc.title,
      to: documentRowUrl(searchParams, doc.id),
      isUserText: true,
    }),
    titleHeader: t('page.columns.title'),
    columns,
    renderStatus: (doc) =>
      linkedIds.has(doc.id) ? <Badge variants={linkedVariants} value="linked" /> : null,
    statusHeader: t('page.columns.linked'),
    facts: (doc) => {
      const { shown, rest } = splitTags(doc.tags);
      const names = shown.map((tag) => tag.name).join(', ');
      const tagLine =
        shown.length === 0
          ? '—'
          : rest > 0
            ? `${names} ${t('page.tagsMore', { count: rest })}`
            : names;
      return [
        { key: 'type', content: doc.documentType ?? '—' },
        { key: 'created', content: formatDate(doc.created) },
        { key: 'tags', content: tagLine, keep: true },
      ];
    },
  };
}
