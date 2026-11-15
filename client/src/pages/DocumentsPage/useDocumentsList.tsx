import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  PaperlessDocumentListQuery,
  PaperlessDocumentSearchResult,
  PaperlessDocumentType,
  PaperlessTag,
} from '@cornerstone/shared';
import { ObjectListCheckboxFilter } from '../../components/ObjectList/ObjectListCheckboxFilter.js';
import { ObjectListSelectFilter } from '../../components/ObjectList/ObjectListSelectFilter.js';
import { useObjectList } from '../../components/ObjectList/useObjectList.js';
import type { ObjectListController } from '../../components/ObjectList/useObjectList.js';
import type {
  ObjectListConfig,
  ObjectListLabels,
  ObjectListPage,
  ObjectListQuery,
} from '../../components/ObjectList/types.js';
import { toFetchFailure } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';
import {
  listPaperlessDocuments,
  listPaperlessDocumentTypes,
  listPaperlessTags,
} from '../../lib/paperlessApi.js';

type Document = PaperlessDocumentSearchResult;
type SortBy = NonNullable<PaperlessDocumentListQuery['sortBy']>;

const SORT_VALUES: readonly SortBy[] = [
  'added',
  'created',
  'modified',
  'title',
  'archive_serial_number',
];

const getKey = (doc: Document): string => String(doc.id);

/** A positive integer from a URL param; anything else is ignored. */
function positiveInt(value: string | undefined): number | undefined {
  return value !== undefined && /^[1-9]\d{0,14}$/.test(value) ? Number(value) : undefined;
}

/** The API query of one batch (exported for tests). */
export function documentsApiQuery(
  query: ObjectListQuery,
  page: number,
  pageSize: number,
): PaperlessDocumentListQuery {
  const sortBy = SORT_VALUES.find((value) => value === query.sortBy);
  return {
    query: query.q || undefined,
    tags: query.filters.tags || undefined,
    documentType: positiveInt(query.filters.type),
    excludeLinked: query.filters.unlinked === '1' || undefined,
    page,
    pageSize,
    sortBy,
    sortOrder: query.sortOrder,
  };
}

export interface UseDocumentsListResult {
  readonly list: ObjectListController<Document>;
  readonly config: ObjectListConfig<Document>;
  readonly labels: ObjectListLabels;
}

/**
 * The Documents list: URL state and batch-loaded rows (`useObjectList`), the ObjectList config
 * (Type, Tags and Hide-already-linked filters, sort) and the labels. The Type and Tags options
 * load once on mount; a failure shows under the select and never blocks the list.
 */
export function useDocumentsList(): UseDocumentsListResult {
  const { t } = useTranslation('documents');
  const { t: tCommon } = useTranslation('common');
  const [types, setTypes] = useState<readonly PaperlessDocumentType[]>([]);
  const [tags, setTags] = useState<readonly PaperlessTag[]>([]);
  const [typesFailure, setTypesFailure] = useState<FetchFailure | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPaperlessDocumentTypes()
      .then((response) => {
        if (!cancelled) setTypes(response.documentTypes);
      })
      .catch((err: unknown) => {
        if (!cancelled) setTypesFailure(toFetchFailure(err));
      });
    listPaperlessTags()
      .then((response) => {
        if (!cancelled) setTags(response.tags);
      })
      .catch(() => {
        // The Tags filter simply stays empty; the list works without it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const config = useMemo((): ObjectListConfig<Document> => {
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    const typeOptions = [...types]
      .sort(byName)
      .map((type) => ({ value: String(type.id), label: type.name }));
    const tagOptions = [...tags]
      .sort(byName)
      .map((tag) => ({ value: String(tag.id), label: tag.name }));
    return {
      listKey: 'documents',
      testIdPrefix: 'documents-library',
      sort: {
        options: [
          { value: 'added', label: t('page.sort.added') },
          { value: 'created', label: t('page.sort.created') },
          { value: 'modified', label: t('page.sort.modified') },
          { value: 'title', label: t('page.sort.title') },
          { value: 'archive_serial_number', label: t('page.sort.archiveSerialNumber') },
        ],
        defaultValue: 'added',
        defaultOrder: 'desc',
      },
      filters: [
        {
          param: 'type',
          label: t('page.filters.type'),
          render: (ctx) => (
            <ObjectListSelectFilter
              ctx={ctx}
              label={t('page.filters.type')}
              emptyLabel={t('page.filters.anyType')}
              options={typeOptions}
              failure={typesFailure}
              failureFallback={t('page.filters.optionsFailed')}
              testId="documents-library-filter-type"
            />
          ),
        },
        {
          param: 'tags',
          label: t('page.filters.tags'),
          render: (ctx) => (
            <ObjectListCheckboxFilter
              ctx={ctx}
              mode="multi"
              options={tagOptions}
              testIdPrefix="documents-library-filter-tag"
            />
          ),
        },
        {
          param: 'unlinked',
          label: t('page.filters.linkedLegend'),
          render: (ctx) => (
            <ObjectListCheckboxFilter
              ctx={ctx}
              mode="single"
              options={[{ value: '1', label: t('page.filters.hideLinked') }]}
              testIdPrefix="documents-library-filter-unlinked"
            />
          ),
        },
      ],
    };
  }, [t, types, tags, typesFailure]);

  // Full-text pages are not stable between requests, so a later batch drops rows already shown.
  const seenRef = useRef<Set<number>>(new Set());
  const fetchPage = useCallback(
    async (
      query: ObjectListQuery,
      page: number,
      pageSize: number,
    ): Promise<ObjectListPage<Document>> => {
      const response = await listPaperlessDocuments(documentsApiQuery(query, page, pageSize));
      if (page === 1) seenRef.current = new Set();
      const seen = seenRef.current;
      const items = response.documents.filter((doc) => !seen.has(doc.id));
      for (const doc of items) seen.add(doc.id);
      return { items, totalItems: response.pagination.totalItems };
    },
    [],
  );

  const list = useObjectList<Document>({ config, fetchPage, getKey });

  const labels = useMemo(
    (): ObjectListLabels => ({
      title: tCommon('navigation.documents'),
      search: t('page.search'),
      resultCount: (count) => t('page.count', { count }),
      empty: t('page.empty'),
      noMatch: t('page.noMatch'),
      loadFailed: t('page.loadFailed'),
    }),
    [t, tCommon],
  );

  return { list, config, labels };
}
