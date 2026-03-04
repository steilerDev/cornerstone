import { useState, useRef, useEffect, useCallback } from 'react';
import type { HouseholdItemSummary, HouseholdItemStatus } from '@cornerstone/shared';
import { listHouseholdItems } from '../../lib/householdItemsApi.js';

import styles from './HouseholdItemPicker.module.css';

/** Maps household item status values to their CSS custom property for the left-border color. */
const STATUS_BORDER_COLORS: Record<HouseholdItemStatus, string> = {
  not_ordered: 'var(--color-status-not-started-text)',
  ordered: 'var(--color-status-in-progress-text)',
  in_transit: 'var(--color-status-in-progress-text)',
  delivered: 'var(--color-status-completed-text)',
};

interface HouseholdItemPickerProps {
  value: string;
  onChange: (id: string) => void;
  excludeIds: string[];
  disabled?: boolean;
  placeholder?: string;
  /** When true, opens dropdown with initial results on focus without requiring typing. */
  showItemsOnFocus?: boolean;
  /**
   * Title to display when `value` is pre-populated from an external source
   * (e.g. editing an existing record with a linked household item).
   * When provided and `value` is non-empty, the picker renders in selected-display mode
   * showing this title until the user clears or changes the selection.
   */
  initialTitle?: string;
}

export function HouseholdItemPicker({
  value,
  onChange,
  excludeIds,
  disabled = false,
  placeholder = 'Search household items...',
  showItemsOnFocus,
  initialTitle,
}: HouseholdItemPickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<HouseholdItemSummary[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<HouseholdItemSummary | null>(null);
  // Track whether the user has explicitly cleared an initialTitle-based selection
  const [initialTitleCleared, setInitialTitleCleared] = useState(false);

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
      setInitialTitleCleared(false);
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
      const response = await listHouseholdItems({ pageSize: 15 });
      const filtered = response.items.filter((item) => !excludeIds.includes(item.id));
      setResults(filtered);
    } catch {
      setError('Failed to load household items');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [excludeIds]);

  const searchHouseholdItems = useCallback(
    async (query: string) => {
      // If query is empty and dropdown is open, show initial results
      if (!query.trim()) {
        await fetchInitialResults();
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await listHouseholdItems({ q: query, pageSize: 15 });
        const filtered = response.items.filter((item) => !excludeIds.includes(item.id));
        setResults(filtered);
      } catch {
        setError('Failed to search household items');
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
      searchHouseholdItems(inputValue);
    }, 300);
  };

  const handleFocus = () => {
    if (showItemsOnFocus) {
      setIsOpen(true);
      fetchInitialResults();
    } else if (searchTerm.trim()) {
      setIsOpen(true);
    }
  };

  const handleSelect = (item: HouseholdItemSummary) => {
    setSelectedItem(item);
    onChange(item.id);
    setIsOpen(false);
    setSearchTerm('');
    setResults([]);
  };

  const handleClear = () => {
    setSelectedItem(null);
    setInitialTitleCleared(true);
    onChange('');
    setSearchTerm('');
    setResults([]);
    inputRef.current?.focus();
  };

  // Show initialTitle when value is pre-populated and not yet changed by the user
  if (initialTitle && value && !selectedItem && !initialTitleCleared) {
    return (
      <div className={styles.container} ref={containerRef}>
        <div className={styles.selectedDisplay}>
          <span className={styles.selectedTitle}>{initialTitle}</span>
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
          <span className={styles.selectedTitle}>{selectedItem.name}</span>
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
                <span className={styles.resultTitle}>{item.name}</span>
              </button>
            ))}

          {!isLoading && !error && results.length === 0 && searchTerm.trim() && (
            <div className={styles.stateMessage}>No matching household items found</div>
          )}

          {!isLoading && !error && results.length === 0 && !searchTerm.trim() && (
            <div className={styles.stateMessage}>Type to search household items</div>
          )}
        </div>
      )}
    </div>
  );
}
