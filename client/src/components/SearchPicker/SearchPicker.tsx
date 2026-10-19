import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  size,
  FloatingPortal,
} from '@floating-ui/react';
import { foldSearchText } from '@cornerstone/shared';
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback.js';
import { useClickOutside } from '../../hooks/useClickOutside.js';

import styles from './SearchPicker.module.css';

export interface SpecialOption {
  id: string;
  label: string;
}

export interface SearchPickerCreateAction<T> {
  /** Visible + accessible label for the create row; receives the trimmed query ('' when empty). */
  getLabel: (query: string) => string;
  /** Called on activation with the trimmed query. Resolve with the created item to select it
   *  (focus moves to the clear button) or null when cancelled (focus returns to the input).
   *  A rejection is treated as null. */
  onCreate: (query: string) => Promise<T | null>;
  /**
   * 'always' (default): the row is always last.
   * 'noExactMatch': only for a non-empty trimmed query, after loading, without an error, when no
   * result's label equals the query (folded on both sides). With zero results it replaces the
   * "No results" line.
   */
  show?: 'always' | 'noExactMatch';
  /**
   * With 'noExactMatch': also show the row while the query is empty (after loading, no error),
   * labelled by `getLabel('')` and created with an empty query (e.g. a name the caller knows).
   */
  showWhenEmpty?: boolean;
}

export interface SearchPickerInputAriaProps {
  'aria-required'?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  /** For inputs that have no visible label. */
  'aria-label'?: string;
}

export interface SearchPickerProps<T> {
  id?: string;
  value: string;
  onChange: (id: string) => void;
  onSelectItem?: (item: { id: string; label: string }) => void;
  excludeIds: string[];
  disabled?: boolean;
  placeholder?: string;
  searchFn: (query: string, excludeIds: string[], signal: AbortSignal) => Promise<T[]>;
  renderItem: (item: T) => { id: string; label: string };
  renderSecondary?: (item: T) => ReactNode;
  renderSelectedLabel?: (item: T) => string;
  getStatusBorderColor?: (item: T) => string | undefined;
  specialOptions?: SpecialOption[];
  showItemsOnFocus?: boolean;
  initialTitle?: string;
  emptyHint?: string;
  noResultsMessage?: string;
  loadErrorMessage?: string;
  searchErrorMessage?: string;
  createAction?: SearchPickerCreateAction<T>;
  inputAriaProps?: SearchPickerInputAriaProps;
  /** Same-line, right-aligned text after the title (e.g. an amount). */
  renderTrailing?: (item: T) => ReactNode;
  /** data-testid of a result option row. */
  getOptionTestId?: (item: T) => string;
  /**
   * Add mode: a selection (or a created item) calls onChange/onSelectItem but never shows a
   * selected display — the input stays, empties and keeps focus (quietly; no reopen).
   */
  clearOnSelect?: boolean;
  /**
   * Focus the picker when it mounts, without opening its dropdown (it opens on typing, click or
   * ArrowDown as usual). The input takes focus; with a selection shown, the Clear button does.
   */
  autoFocus?: boolean;
}

export function SearchPicker<T>({
  id,
  value,
  onChange,
  onSelectItem,
  excludeIds,
  disabled = false,
  placeholder,
  searchFn,
  renderItem,
  renderSecondary,
  renderSelectedLabel,
  getStatusBorderColor,
  specialOptions,
  showItemsOnFocus,
  initialTitle,
  emptyHint,
  noResultsMessage,
  loadErrorMessage,
  searchErrorMessage,
  createAction,
  inputAriaProps,
  renderTrailing,
  getOptionTestId,
  clearOnSelect = false,
  autoFocus = false,
}: SearchPickerProps<T>) {
  const { t } = useTranslation('common');
  const resolvedPlaceholder = placeholder ?? t('search.placeholder');
  const resolvedEmptyHint = emptyHint ?? t('search.emptyHint');
  const resolvedNoResults = noResultsMessage ?? t('search.noResults');
  const resolvedLoadError = loadErrorMessage ?? t('search.loadError');
  const resolvedSearchError = searchErrorMessage ?? t('search.searchError');

  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<T[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<T | null>(null);
  // Track whether the user has explicitly cleared an initialTitle-based selection
  const [initialTitleCleared, setInitialTitleCleared] = useState(false);
  // Track whether the user has explicitly selected a special option
  const [specialSelected, setSpecialSelected] = useState(false);

  // The currently selected special option (if value matches one)
  // Only match a special option when the user explicitly chose one
  const selectedSpecial =
    specialSelected && specialOptions
      ? (specialOptions.find((opt) => opt.id === value) ?? null)
      : null;

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const clearButtonRef = useRef<HTMLButtonElement>(null);
  // Where focus is headed once the picker has re-rendered: the selection chip's Clear button
  // (after a selection) or the input (after Clear). Kept until that element has mounted, so a
  // parent that updates `value` asynchronously still gets the focus.
  const pendingFocusRef = useRef<'clear' | 'input' | null>(null);
  const pendingFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressFocusOpenRef = useRef(false);

  useEffect(() => {
    if (!autoFocus) return;
    if (inputRef.current) {
      suppressFocusOpenRef.current = true;
      inputRef.current.focus();
    } else {
      clearButtonRef.current?.focus();
    }
  }, [autoFocus]);
  const searchControllerRef = useRef<AbortController | null>(null);

  const { refs, floatingStyles, isPositioned } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    strategy: 'fixed',
    placement: 'bottom-start',
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ rects, elements }) {
          Object.assign(elements.floating.style, { width: `${rects.reference.width}px` });
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  // Close dropdown on click outside
  useClickOutside([containerRef, refs.floating], () => setIsOpen(false), isOpen);

  // Reset when value is cleared externally (e.g. after form submission)
  useEffect(() => {
    /* eslint-disable @eslint-react/set-state-in-effect -- syncing picker state with external value changes */
    if (value === '') {
      setSelectedItem(null);
      setSearchTerm('');
      setInitialTitleCleared(false);
    } else {
      if (specialOptions?.some((opt) => opt.id === value)) {
        setSpecialSelected(true);
      }
    }
    /* eslint-enable @eslint-react/set-state-in-effect */
  }, [value, specialOptions]);

  // Abort the in-flight search when the picker unmounts
  useEffect(
    () => () => {
      searchControllerRef.current?.abort();
    },
    [],
  );

  const fetchInitialResults = useCallback(async () => {
    searchControllerRef.current?.abort();
    const controller = new AbortController();
    searchControllerRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      const response = await searchFn('', excludeIds, controller.signal);
      if (searchControllerRef.current !== controller) return;
      setResults(response);
    } catch {
      if (searchControllerRef.current !== controller) return;
      setError(resolvedLoadError);
      setResults([]);
    } finally {
      if (searchControllerRef.current === controller) setIsLoading(false);
    }
  }, [excludeIds, searchFn, resolvedLoadError]);

  const performSearch = useCallback(
    async (query: string) => {
      // If query is empty and dropdown is open, show initial results
      if (!query.trim()) {
        await fetchInitialResults();
        return;
      }

      searchControllerRef.current?.abort();
      const controller = new AbortController();
      searchControllerRef.current = controller;
      setIsLoading(true);
      setError(null);

      try {
        const response = await searchFn(query, excludeIds, controller.signal);
        if (searchControllerRef.current !== controller) return;
        setResults(response);
      } catch {
        if (searchControllerRef.current !== controller) return;
        setError(resolvedSearchError);
        setResults([]);
      } finally {
        if (searchControllerRef.current === controller) setIsLoading(false);
      }
    },
    [excludeIds, fetchInitialResults, searchFn, resolvedSearchError],
  );

  const debouncedSearch = useDebouncedCallback(performSearch, 300);

  const handleInputChange = (inputValue: string) => {
    setSearchTerm(inputValue);
    setIsOpen(true);
    debouncedSearch.trigger(inputValue);
  };

  const handleFocus = () => {
    if (suppressFocusOpenRef.current) {
      suppressFocusOpenRef.current = false;
      return;
    }
    if (showItemsOnFocus || specialOptions || createAction) {
      setIsOpen(true);
      fetchInitialResults();
    } else if (searchTerm.trim()) {
      setIsOpen(true);
    }
  };

  // A click on the already focused, closed input opens it like focus would (no focus event fires)
  const handleClick = () => {
    if (isOpen) return;
    if (showItemsOnFocus || specialOptions || createAction) {
      setIsOpen(true);
      fetchInitialResults();
    } else if (searchTerm.trim()) {
      setIsOpen(true);
    }
  };

  const trimmedTerm = searchTerm.trim();
  const showCreateRow =
    createAction !== undefined &&
    (createAction.show !== 'noExactMatch' ||
      ((trimmedTerm !== '' || createAction.showWhenEmpty === true) &&
        !isLoading &&
        !error &&
        !results.some(
          (item) => foldSearchText(renderItem(item).label) === foldSearchText(trimmedTerm),
        )));
  const createLabel = createAction ? createAction.getLabel(trimmedTerm) : '';

  const getOptions = () =>
    Array.from(refs.floating.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);

  // Return focus to the input without triggering the open-on-focus refetch
  const focusInputQuietly = () => {
    suppressFocusOpenRef.current = true;
    inputRef.current?.focus();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (isOpen) {
        // Close only the dropdown; keep Escape from also closing an enclosing Modal
        e.preventDefault();
        e.stopPropagation();
      }
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const options = isOpen ? getOptions() : [];
      if (options.length > 0) {
        options[0]!.focus();
      } else if (!isOpen) {
        if (showItemsOnFocus || specialOptions || createAction) {
          setIsOpen(true);
          void fetchInitialResults();
        } else if (searchTerm.trim()) {
          setIsOpen(true);
        }
      }
    } else if (e.key === 'ArrowUp') {
      const options = isOpen ? getOptions() : [];
      if (options.length > 0) {
        e.preventDefault();
        options[options.length - 1]!.focus();
      }
    }
  };

  const handleListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const options = getOptions();
    const index = options.indexOf(document.activeElement as HTMLElement);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        options[Math.min(index + 1, options.length - 1)]?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (index <= 0) focusInputQuietly();
        else options[index - 1]?.focus();
        break;
      case 'Home':
        e.preventDefault();
        options[0]?.focus();
        break;
      case 'End':
        e.preventDefault();
        options[options.length - 1]?.focus();
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        focusInputQuietly();
        break;
    }
  };

  // Bounded: a parent that never accepts the value must not steal focus later.
  const armPendingFocus = (target: 'clear' | 'input') => {
    pendingFocusRef.current = target;
    if (pendingFocusTimerRef.current) clearTimeout(pendingFocusTimerRef.current);
    pendingFocusTimerRef.current = setTimeout(() => {
      pendingFocusRef.current = null;
      pendingFocusTimerRef.current = null;
    }, 3000);
  };

  const abortSearch = () => {
    debouncedSearch.cancel();
    searchControllerRef.current?.abort();
    searchControllerRef.current = null;
    setIsLoading(false);
  };

  const handleSelect = (item: T) => {
    const rendered = renderItem(item);
    abortSearch();
    if (clearOnSelect) {
      onChange(rendered.id);
      onSelectItem?.({ id: rendered.id, label: rendered.label });
      setIsOpen(false);
      setSearchTerm('');
      setResults([]);
      focusInputQuietly();
      return;
    }
    setSelectedItem(item);
    // Once the user selects an item, the pre-populated initialTitle is no longer the source of truth
    setInitialTitleCleared(true);
    armPendingFocus('clear');
    onChange(rendered.id);
    onSelectItem?.({ id: rendered.id, label: rendered.label });
    setIsOpen(false);
    setSearchTerm('');
    setResults([]);
  };

  const handleSelectSpecial = (opt: SpecialOption) => {
    abortSearch();
    armPendingFocus('clear');
    setSelectedItem(null); // clear any real item selection
    setSpecialSelected(true);
    onChange(opt.id);
    onSelectItem?.({ id: opt.id, label: opt.label });
    setIsOpen(false);
    setSearchTerm('');
    setResults([]);
  };

  const handleCreate = async () => {
    if (!createAction) return;
    const query = searchTerm.trim();
    setIsOpen(false);
    abortSearch();
    const created = await createAction.onCreate(query).catch(() => null);
    if (created) {
      handleSelect(created);
    } else {
      suppressFocusOpenRef.current = true;
      inputRef.current?.focus();
    }
  };

  // Land pending focus as soon as its target exists. While the chip has not rendered yet (the
  // parent updates `value` later, or never), focus stays on the input so it never falls to <body>.
  useLayoutEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    const done = () => {
      pendingFocusRef.current = null;
      if (pendingFocusTimerRef.current) clearTimeout(pendingFocusTimerRef.current);
      pendingFocusTimerRef.current = null;
    };
    if (target === 'clear' && clearButtonRef.current) {
      clearButtonRef.current.focus();
      done();
    } else if (target === 'input' && inputRef.current) {
      inputRef.current.focus();
      done();
    } else if (
      target === 'clear' &&
      inputRef.current &&
      (document.activeElement === document.body || document.activeElement === null)
    ) {
      focusInputQuietly();
    }
  });

  useEffect(
    () => () => {
      if (pendingFocusTimerRef.current) clearTimeout(pendingFocusTimerRef.current);
    },
    [],
  );

  const handleClear = () => {
    abortSearch();
    setSelectedItem(null);
    setInitialTitleCleared(true);
    setSpecialSelected(false);
    onChange('');
    setSearchTerm('');
    setResults([]);
    // The input is not mounted yet; focus it (opening the list as a normal focus does) after the re-render
    armPendingFocus('input');
  };

  const setInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      refs.setReference(node);
      (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
    },
    [refs],
  );

  // If a special option is selected, show it in a display similar to selectedItem
  if (selectedSpecial) {
    return (
      <div className={styles.container} ref={containerRef}>
        <div className={styles.selectedDisplay}>
          <span className={`${styles.selectedTitle} ${styles.selectedTitleSpecial}`}>
            {selectedSpecial.label}
          </span>
          <button
            ref={clearButtonRef}
            type="button"
            className={styles.clearButton}
            onClick={handleClear}
            aria-label={t('aria.clearSelection')}
            disabled={disabled}
          >
            &times;
          </button>
        </div>
      </div>
    );
  }

  // Show initialTitle when value is pre-populated and not yet changed by the user
  if (initialTitle && value && !initialTitleCleared) {
    return (
      <div className={styles.container} ref={containerRef}>
        <div className={styles.selectedDisplay}>
          <span className={styles.selectedTitle}>{initialTitle}</span>
          <button
            ref={clearButtonRef}
            type="button"
            className={styles.clearButton}
            onClick={handleClear}
            aria-label={t('aria.clearSelection')}
            disabled={disabled}
          >
            &times;
          </button>
        </div>
      </div>
    );
  }

  if (selectedItem && value !== '') {
    const borderColor = getStatusBorderColor?.(selectedItem);
    const label = renderSelectedLabel
      ? renderSelectedLabel(selectedItem)
      : renderItem(selectedItem).label;
    return (
      <div className={styles.container} ref={containerRef}>
        <div
          className={styles.selectedDisplay}
          style={borderColor ? { borderLeftColor: borderColor } : undefined}
        >
          <span className={styles.selectedTitle}>{label}</span>
          <button
            ref={clearButtonRef}
            type="button"
            className={styles.clearButton}
            onClick={handleClear}
            aria-label={t('aria.clearSelection')}
            disabled={disabled}
          >
            &times;
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <input
        id={id}
        ref={setInputRef}
        type="text"
        className={styles.input}
        placeholder={resolvedPlaceholder}
        value={searchTerm}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={handleFocus}
        onClick={handleClick}
        onKeyDown={handleInputKeyDown}
        disabled={disabled}
        {...inputAriaProps}
      />

      <FloatingPortal>
        {isOpen && (
          <div
            data-search-picker-dropdown
            ref={refs.setFloating}
            style={isPositioned ? floatingStyles : { ...floatingStyles, visibility: 'hidden' }}
            className={styles.portalDropdown}
            role="listbox"
            onKeyDown={handleListKeyDown}
          >
            {/* Special options at the top */}
            {specialOptions && specialOptions.length > 0 && (
              <>
                {specialOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className={`${styles.resultOption} ${styles.specialOption}`}
                    onClick={() => handleSelectSpecial(opt)}
                  >
                    <span className={`${styles.resultTitle} ${styles.specialOptionLabel}`}>
                      {opt.label}
                    </span>
                  </button>
                ))}
                {/* Divider between special options and search results */}
                {(isLoading || results.length > 0) && (
                  <div className={styles.optionsDivider} role="separator" />
                )}
              </>
            )}

            {isLoading && <div className={styles.stateMessage}>{t('searching')}</div>}

            {!isLoading && error && <div className={styles.errorMessage}>{error}</div>}

            {!isLoading &&
              !error &&
              results.length > 0 &&
              results.map((item) => {
                const rendered = renderItem(item);
                const secondary = renderSecondary?.(item);
                const trailing = renderTrailing?.(item);
                return (
                  <button
                    key={rendered.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className={`${styles.resultOption} ${
                      secondary !== undefined && secondary !== null
                        ? styles.resultOptionTwoLine
                        : ''
                    }`}
                    data-testid={getOptionTestId?.(item)}
                    onClick={() => handleSelect(item)}
                  >
                    {secondary !== undefined && secondary !== null ? (
                      <span className={styles.resultContent}>
                        <span className={styles.resultTitle}>{rendered.label}</span>
                        <span
                          className={styles.resultSecondary}
                          title={typeof secondary === 'string' ? secondary : undefined}
                        >
                          {secondary}
                        </span>
                      </span>
                    ) : (
                      <span className={styles.resultTitle}>{rendered.label}</span>
                    )}
                    {trailing !== undefined && trailing !== null && (
                      <span className={styles.resultTrailing}>{trailing}</span>
                    )}
                  </button>
                );
              })}

            {!isLoading &&
              !error &&
              results.length === 0 &&
              searchTerm.trim() &&
              !(showCreateRow && createAction?.show === 'noExactMatch') && (
                <div className={styles.stateMessage}>{resolvedNoResults}</div>
              )}

            {!isLoading && !error && results.length === 0 && !searchTerm.trim() && emptyHint && (
              <div className={styles.stateMessage}>{emptyHint}</div>
            )}

            {!isLoading &&
              !error &&
              results.length === 0 &&
              !searchTerm.trim() &&
              (!specialOptions || specialOptions.length === 0) &&
              !emptyHint && <div className={styles.stateMessage}>{resolvedEmptyHint}</div>}

            {createAction && showCreateRow && (
              <button
                type="button"
                role="option"
                aria-selected={false}
                className={`${styles.resultOption} ${styles.createOption}`}
                title={createLabel}
                onClick={() => void handleCreate()}
              >
                <span aria-hidden="true" className={styles.createOptionIcon}>
                  +
                </span>
                <span className={`${styles.resultTitle} ${styles.createOptionLabel}`}>
                  {createLabel}
                </span>
              </button>
            )}
          </div>
        )}
      </FloatingPortal>
    </div>
  );
}
