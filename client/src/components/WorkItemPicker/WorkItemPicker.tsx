import { useState, useRef, useEffect, useCallback } from 'react';
import type { WorkItemSummary, WorkItemStatus } from '@cornerstone/shared';
import { listWorkItems } from '../../lib/workItemsApi.js';
import { StatusBadge } from '../StatusBadge/StatusBadge.js';
import styles from './WorkItemPicker.module.css';

/** Maps work item status values to their CSS custom property for the left-border color. */
const STATUS_BORDER_COLORS: Record<WorkItemStatus, string> = {
  not_started: 'var(--color-status-not-started-text)',
  in_progress: 'var(--color-status-in-progress-text)',
  completed: 'var(--color-status-completed-text)',
  blocked: 'var(--color-status-blocked-text)',
};

export interface SpecialOption {
  id: string;
  label: string;
}

interface WorkItemPickerProps {
  value: string;
  onChange: (id: string) => void;
  onSelectItem?: (item: { id: string; title: string }) => void;
  excludeIds: string[];
  disabled?: boolean;
  placeholder?: string;
  /** Options rendered at top of dropdown (e.g. "This item"). These bypass excludeIds. */
  specialOptions?: SpecialOption[];
  /** When true, opens dropdown with initial results on focus without requiring typing. */
  showItemsOnFocus?: boolean;
}

export function WorkItemPicker({
  value,
  onChange,
  onSelectItem,
  excludeIds,
  disabled = false,
  placeholder = 'Search work items...',
  specialOptions,
  showItemsOnFocus,
}: WorkItemPickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<WorkItemSummary[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<WorkItemSummary | null>(null);

  // The currently selected special option (if value matches one)
  const selectedSpecial = specialOptions?.find((opt) => opt.id === value) ?? null;

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Reset when value is cleared externally (e.g. after form submission)
  useEffect(() => {
    if (value === '') {
      setSelectedItem(null);
      setSearchTerm('');
    }
  }, [value]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const fetchInitialResults = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listWorkItems({ pageSize: 15 });
      const filtered = response.items.filter((item) => !excludeIds.includes(item.id));
      setResults(filtered);
    } catch {
      setError('Failed to load work items');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [excludeIds]);

  const searchWorkItems = useCallback(
    async (query: string) => {
      // If query is empty and dropdown is open, show initial results
      if (!query.trim()) {
        await fetchInitialResults();
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await listWorkItems({ q: query, pageSize: 15 });
        const filtered = response.items.filter((item) => !excludeIds.includes(item.id));
        setResults(filtered);
      } catch {
        setError('Failed to search work items');
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [excludeIds, fetchInitialResults],
  );

  const handleInputChange = (inputValue: string) => {
    setSearchTerm(inputValue);
    setIsOpen(true);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchWorkItems(inputValue);
    }, 300);
  };

  const handleFocus = () => {
    if (showItemsOnFocus || specialOptions) {
      setIsOpen(true);
      fetchInitialResults();
    } else if (searchTerm.trim()) {
      setIsOpen(true);
    }
  };

  const handleSelect = (item: WorkItemSummary) => {
    setSelectedItem(item);
    onChange(item.id);
    onSelectItem?.({ id: item.id, title: item.title });
    setIsOpen(false);
    setSearchTerm('');
    setResults([]);
  };

  const handleSelectSpecial = (opt: SpecialOption) => {
    setSelectedItem(null); // clear any real item selection
    onChange(opt.id);
    onSelectItem?.({ id: opt.id, title: opt.label });
    setIsOpen(false);
    setSearchTerm('');
    setResults([]);
  };

  const handleClear = () => {
    setSelectedItem(null);
    onChange('');
    setSearchTerm('');
    setResults([]);
    inputRef.current?.focus();
  };

  // If a special option is selected, show it in a display similar to selectedItem
  if (selectedSpecial) {
    return (
      <div className={styles.container} ref={containerRef}>
        <div className={styles.selectedDisplay}>
          <span className={`${styles.selectedTitle} ${styles.selectedTitleSpecial}`}>
            {selectedSpecial.label}
          </span>
          <button
            type="button"
            className={styles.clearButton}
            onClick={handleClear}
            aria-label="Clear selection"
            disabled={disabled}
          >
            &times;
          </button>
        </div>
      </div>
    );
  }

  if (selectedItem) {
    return (
      <div className={styles.container} ref={containerRef}>
        <div
          className={styles.selectedDisplay}
          style={{ borderLeftColor: STATUS_BORDER_COLORS[selectedItem.status] }}
        >
          <span className={styles.selectedTitle}>{selectedItem.title}</span>
          <button
            type="button"
            className={styles.clearButton}
            onClick={handleClear}
            aria-label="Clear selection"
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
        ref={inputRef}
        type="text"
        className={styles.input}
        placeholder={placeholder}
        value={searchTerm}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={handleFocus}
        disabled={disabled}
      />

      {isOpen && (
        <div className={styles.dropdown} role="listbox">
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

          {isLoading && <div className={styles.stateMessage}>Searching...</div>}

          {!isLoading && error && <div className={styles.errorMessage}>{error}</div>}

          {!isLoading &&
            !error &&
            results.length > 0 &&
            results.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={false}
                className={styles.resultOption}
                onClick={() => handleSelect(item)}
              >
                <span className={styles.resultTitle}>{item.title}</span>
                <StatusBadge status={item.status} />
              </button>
            ))}

          {!isLoading && !error && results.length === 0 && searchTerm.trim() && (
            <div className={styles.stateMessage}>No matching work items found</div>
          )}

          {!isLoading &&
            !error &&
            results.length === 0 &&
            !searchTerm.trim() &&
            (!specialOptions || specialOptions.length === 0) && (
              <div className={styles.stateMessage}>Type to search work items</div>
            )}
        </div>
      )}
    </div>
  );
}
