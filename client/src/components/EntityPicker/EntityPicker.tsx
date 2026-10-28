import { useEffect, useId, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { WorkItemStatus } from '@cornerstone/shared';
import { useFormatters } from '../../lib/formatters.js';
import { useCompanyName } from '../../hooks/useCompanyName.js';
import { listAllLinkedDocumentIds } from '../../lib/documentLinksApi.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { useCompanyCreateAction } from '../../objectForms/useCompanyCreateAction.js';
import { useTagCreate } from '../../objectForms/useTagCreate.js';
import { AreaBreadcrumb } from '../AreaBreadcrumb/AreaBreadcrumb.js';
import { SearchPicker } from '../SearchPicker/SearchPicker.js';
import type { SearchPickerCreateAction, SpecialOption } from '../SearchPicker/SearchPicker.js';
import {
  ENTITY_CREATE_KINDS,
  areaPathSegments,
  decodeWho,
  encodeWho,
  filterNamedEntries,
  filterOptionsByLabel,
  loadGrantOptions,
  loadCategoryEntries,
  loadMilestoneOptions,
  loadTradeEntries,
  notExcluded,
  pathText,
  searchAreaOptions,
  searchCompanyOptions,
  searchDocumentOptions,
  searchOrientationOptions,
  searchTaskOptions,
  searchTaskOrPurchaseOptions,
  searchWhoOptions,
  whoKindOf,
} from './entityPickerKinds.js';
import type { EntityCreateKind, NamedEntry } from './entityPickerKinds.js';
import type { EntityOption, EntityPickerProps } from './types.js';

const NO_EXCLUDED: readonly string[] = [];
const NO_USERS: readonly never[] = [];
const NO_AREAS: readonly never[] = [];

function isCreateKind(kind: string): kind is EntityCreateKind {
  return (ENTITY_CREATE_KINDS as readonly string[]).includes(kind);
}

/**
 * The one entity picker: a configurable layer on `SearchPicker` that owns the per-kind search,
 * the option rows and the inline "New ‹kind› ‹text›" row. Company-like kinds search on the
 * server; trades and categories filter on the client because their defaults are translated
 * (a server LIKE could not match the German name of a built-in trade).
 */
export function EntityPicker(props: EntityPickerProps) {
  const {
    kind,
    value,
    onChange,
    id,
    selectedLabel,
    excludeIds = NO_EXCLUDED,
    disabled = false,
    placeholder,
    inputAriaProps,
    noneLabel,
    specialOptions,
    create = 'auto',
    onCreatingChange,
    knownCompany,
    onUnknownCompany,
    onResolvingChange,
    clearOnSelect,
    autoFocus,
    emptyHint,
    getOptionTestId,
  } = props;
  const users = props.kind === 'who' ? props.users : NO_USERS;
  const areas = props.kind === 'area' ? props.areas : NO_AREAS;

  const { t } = useTranslation('common');
  const { t: tSettings } = useTranslation('settings');
  const { t: tBudget } = useTranslation('budget');
  const autoId = useId();
  const inputId = id ?? autoId;

  const companyCreate = useCompanyCreateAction();
  const tagCreate = useTagCreate();
  // The options seen so far, so a picked value resolves back to its option.
  const seenRef = useRef(new Map<string, EntityOption>());
  const entriesRef = useRef<Promise<NamedEntry[]> | null>(null);
  const optionsRef = useRef<Promise<EntityOption[]> | null>(null);
  const linkedRef = useRef<Promise<ReadonlySet<number>> | null>(null);
  const { formatDate } = useFormatters();

  const creating = companyCreate.isCreating || tagCreate.isCreating;
  const onCreatingChangeRef = useRef(onCreatingChange);
  useEffect(() => {
    onCreatingChangeRef.current = onCreatingChange;
  });
  useEffect(() => {
    onCreatingChangeRef.current?.(creating);
  }, [creating]);

  // Never auto-clear an unknown company id: the host decides (onUnknownCompany).
  const companyId =
    kind === 'company' ? value : kind === 'who' ? (decodeWho(value).vendorId ?? '') : '';
  const company = useCompanyName(selectedLabel ? '' : companyId, {
    known: knownCompany,
    onUnknown: onUnknownCompany,
  });

  const onResolvingChangeRef = useRef(onResolvingChange);
  useEffect(() => {
    onResolvingChangeRef.current = onResolvingChange;
  });
  useEffect(() => {
    onResolvingChangeRef.current?.(company.isResolving);
  }, [company.isResolving]);

  const excluded = useMemo(() => [...excludeIds], [excludeIds]);
  const special = useMemo<SpecialOption[] | undefined>(() => {
    const list: SpecialOption[] = [];
    if (noneLabel !== undefined) list.push({ id: '', label: noneLabel });
    if (specialOptions) list.push(...specialOptions);
    return list.length > 0 ? list : undefined;
  }, [noneLabel, specialOptions]);

  const statusWord = (status: WorkItemStatus) =>
    t(I18N_UNION_KEYS.statusVocabularyTask.key(status));

  const loadEntries = (): Promise<NamedEntry[]> => {
    if (entriesRef.current === null) {
      const load = kind === 'trade' ? loadTradeEntries : loadCategoryEntries;
      const pending = load(tSettings);
      entriesRef.current = pending;
      pending.catch(() => {
        if (entriesRef.current === pending) entriesRef.current = null;
      });
    }
    return entriesRef.current;
  };

  // Milestones and grants: small lists, fetched once per mount and filtered on the client.
  const loadOptions = (): Promise<EntityOption[]> => {
    if (optionsRef.current === null) {
      const pending =
        kind === 'milestone' ? loadMilestoneOptions((iso) => formatDate(iso)) : loadGrantOptions();
      optionsRef.current = pending;
      pending.catch(() => {
        optionsRef.current = null;
      });
    }
    return optionsRef.current;
  };

  // Linked document ids load once per mount; a failure shows no filter and is retried next time.
  const loadLinkedIds = (): Promise<ReadonlySet<number>> => {
    if (linkedRef.current === null) {
      const pending = listAllLinkedDocumentIds().then(
        (ids) => new Set(ids),
        () => {
          linkedRef.current = null;
          return new Set<number>();
        },
      );
      linkedRef.current = pending;
    }
    return linkedRef.current;
  };

  const runSearch = async (query: string, signal: AbortSignal): Promise<EntityOption[]> => {
    switch (kind) {
      case 'company':
        return searchCompanyOptions(query, signal, tSettings, false);
      case 'who':
        return searchWhoOptions(query, signal, users, tSettings);
      case 'area':
        return searchAreaOptions(query, signal, areas);
      case 'orientation':
        return searchOrientationOptions(query);
      case 'trade':
      case 'category':
        return filterNamedEntries(await loadEntries(), query);
      case 'task':
        return searchTaskOptions(query, statusWord);
      case 'taskOrPurchase':
        return searchTaskOrPurchaseOptions(query, signal, {
          task: t('entityPicker.taskOrPurchase.kindTask'),
          purchase: t('entityPicker.taskOrPurchase.kindPurchase'),
        });
      case 'document':
        return searchDocumentOptions(query, await loadLinkedIds(), (iso) => formatDate(iso));
      case 'milestone':
      case 'grant':
        return filterOptionsByLabel(await loadOptions(), query);
    }
  };

  const searchFn = async (query: string, excludedIds: string[], signal: AbortSignal) => {
    const found = (await runSearch(query, signal)).filter((o) => notExcluded(o, excludedIds));
    for (const option of found) seenRef.current.set(option.id, option);
    return found;
  };

  const createLabel = (query: string): string => {
    if (isCreateKind(kind)) return t(I18N_UNION_KEYS.entityPickerNew.key(kind), { name: query });
    return tBudget('companies.picker.newNamed', { name: query });
  };

  // A host-provided create returns the new option: remember it so `onChange` can resolve it.
  const rememberCreated =
    (onCreate: (query: string) => Promise<EntityOption | null>) => async (query: string) => {
      const option = await onCreate(query);
      if (option) seenRef.current.set(option.id, option);
      return option;
    };

  const buildCreateAction = (): SearchPickerCreateAction<EntityOption> | undefined => {
    const creatable = kind === 'company' || kind === 'who' || isCreateKind(kind);
    if (!creatable || create === 'off') return undefined;
    if (typeof create === 'function') {
      return { getLabel: createLabel, show: 'noExactMatch', onCreate: rememberCreated(create) };
    }
    if (create !== 'auto') {
      return { show: 'noExactMatch', ...create, onCreate: rememberCreated(create.onCreate) };
    }
    if (kind === 'company' || kind === 'who') {
      const action = companyCreate.createAction;
      if (!action) return undefined;
      return {
        getLabel: action.getLabel,
        show: action.show,
        showWhenEmpty: action.showWhenEmpty,
        onCreate: async (query) => {
          const created = await action.onCreate(query);
          if (!created) return null;
          const option: EntityOption =
            kind === 'who'
              ? {
                  id: encodeWho({ vendorId: created.id }),
                  label: created.name,
                  group: 'company',
                  entityId: created.id,
                }
              : { id: created.id, label: created.name, entityId: created.id };
          seenRef.current.set(option.id, option);
          return option;
        },
      };
    }
    const request = tagCreate.request;
    if (!request) return undefined;
    return {
      getLabel: createLabel,
      show: 'noExactMatch',
      onCreate: async (query) => {
        const created = await request(
          kind as EntityCreateKind,
          document.getElementById(inputId),
          query,
        );
        if (created && (kind === 'trade' || kind === 'category')) entriesRef.current = null;
        if (!created) return null;
        const option: EntityOption = { id: created.id, label: created.name };
        seenRef.current.set(option.id, option);
        return option;
      },
    };
  };

  const placeholders = {
    company: t('entityPicker.placeholder.company'),
    who: t('entityPicker.placeholder.who'),
    area: t('aria.selectArea'),
    orientation: t('aria.selectOrientation'),
    trade: t('aria.selectTrade'),
    category: t('entityPicker.placeholder.category'),
    task: t('entityPicker.task.placeholder'),
    taskOrPurchase: t('entityPicker.placeholder.taskOrPurchase'),
    document: t('entityPicker.placeholder.document'),
    milestone: t('entityPicker.placeholder.milestone'),
    grant: t('entityPicker.placeholder.grant'),
  } satisfies Record<typeof kind, string>;

  let initialTitle: string | undefined;
  if (value !== '') {
    if (kind === 'area') {
      const path = areaPathSegments(areas, value);
      initialTitle = path.length > 0 ? pathText(path) : selectedLabel;
    } else if (kind === 'who' && whoKindOf(value) === 'member') {
      initialTitle =
        users.find((user) => user.id === decodeWho(value).userId)?.displayName ?? selectedLabel;
    } else if (kind === 'company' || kind === 'who') {
      initialTitle = selectedLabel ?? company.name;
    } else {
      initialTitle = selectedLabel;
    }
  }

  const renderSecondary = (option: EntityOption) => {
    const path = option.secondaryPath;
    const pathNode =
      path && path.length > 0 ? <AreaBreadcrumb variant="path" segments={path} /> : null;
    if (option.kindWord) {
      return (
        <>
          {option.kindWord}
          {pathNode && (
            <>
              {' · '}
              {pathNode}
            </>
          )}
        </>
      );
    }
    return pathNode ?? option.secondary ?? null;
  };

  const taskMessages: {
    emptyHint?: string;
    noResultsMessage: string;
    loadErrorMessage?: string;
    searchErrorMessage?: string;
  } | null =
    kind === 'task'
      ? {
          emptyHint: t('entityPicker.task.emptyHint'),
          noResultsMessage: t('entityPicker.task.noResults'),
          loadErrorMessage: t('entityPicker.task.loadError'),
          searchErrorMessage: t('entityPicker.task.searchError'),
        }
      : kind === 'taskOrPurchase'
        ? {
            emptyHint: t('entityPicker.typeMore'),
            noResultsMessage: t('entityPicker.taskOrPurchase.noResults'),
          }
        : kind === 'document'
          ? {
              emptyHint: t('entityPicker.document.linkedHidden'),
              noResultsMessage: t('entityPicker.document.noResults'),
              loadErrorMessage: t('entityPicker.document.loadError'),
              searchErrorMessage: t('entityPicker.document.loadError'),
            }
          : kind === 'milestone'
            ? { noResultsMessage: t('entityPicker.milestone.noResults') }
            : kind === 'grant'
              ? { noResultsMessage: t('entityPicker.grant.noResults') }
              : null;

  return (
    <SearchPicker<EntityOption>
      id={inputId}
      value={value}
      onChange={(next) => onChange(next, next === '' ? null : (seenRef.current.get(next) ?? null))}
      onSelectItem={(item) => {
        const rawId =
          kind === 'who' ? decodeWho(item.id).vendorId : kind === 'company' ? item.id : undefined;
        if (rawId) company.remember({ id: rawId, label: item.label });
      }}
      excludeIds={excluded}
      disabled={disabled || company.isResolving}
      placeholder={placeholder ?? placeholders[kind]}
      searchFn={searchFn}
      renderItem={(o) => ({ id: o.id, label: o.label })}
      renderSecondary={renderSecondary}
      renderTrailing={(o) => o.trailing ?? null}
      renderSelectedLabel={(o) => (o.path ? pathText(o.path) : o.label)}
      renderOptionLabel={
        kind === 'area' ? (o) => <AreaBreadcrumb variant="path" segments={o.path!} /> : undefined
      }
      getOptionAriaLabel={
        kind === 'area' ? (o) => o.path!.map((segment) => segment.name).join(', ') : undefined
      }
      groupBy={
        kind === 'who'
          ? (o) => {
              const group = o.group!;
              return { id: group, label: t(I18N_UNION_KEYS.whoGroup.key(group)) };
            }
          : undefined
      }
      getSelectedSuffix={
        kind === 'who'
          ? (item) => {
              const group = item?.group ?? whoKindOf(value);
              return group ? t(I18N_UNION_KEYS.whoKind.key(group)) : undefined;
            }
          : undefined
      }
      specialOptions={special}
      showItemsOnFocus={kind !== 'taskOrPurchase'}
      initialTitle={initialTitle}
      emptyHint={emptyHint ?? taskMessages?.emptyHint}
      noResultsMessage={taskMessages?.noResultsMessage}
      loadErrorMessage={taskMessages?.loadErrorMessage}
      searchErrorMessage={taskMessages?.searchErrorMessage}
      createAction={buildCreateAction()}
      inputAriaProps={inputAriaProps}
      getOptionTestId={getOptionTestId}
      clearOnSelect={clearOnSelect}
      autoFocus={autoFocus}
    />
  );
}

export default EntityPicker;
