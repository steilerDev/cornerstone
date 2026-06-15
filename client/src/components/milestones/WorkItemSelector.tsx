import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { WorkItemSummary } from '@cornerstone/shared';
import { listWorkItems } from '../../lib/workItemsApi.js';
import styles from './WorkItemSelector.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SelectedWorkItem {
  id: string;
  name: string;
}

interface WorkItemSelectorProps {
  selectedItems: SelectedWorkItem[];
  onAdd: (item: SelectedWorkItem) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Portal dropdown
// ---------------------------------------------------------------------------

interface DropdownPortalProps {
  anchorRect: DOMRect;
  children: React.ReactNode;
}

function DropdownPortal({ anchorRect, children }: DropdownPortalProps) {
  // z-index must exceed --z-modal (1000) so the dropdown renders above the dialog overlay
  const style: React.CSSProperties = {
    position: 'fixed',
    top: anchorRect.bottom + 4,
    left: anchorRect.left,
    width: anchorRect.width,
    zIndex: 1100,
  };

  return createPortal(
    <div style={style} className={styles.portalWrapper}>
      {children}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Reusable work item selector with chip display and portal-based dropdown.
 * Used in MilestoneForm (create mode) and can replace linker search logic.
 *
 * The dropdown uses createPortal to document.body with position:fixed so it
 * is never clipped by overflow:hidden / overflow:auto ancestors (e.g. dialog body).
 */
export function WorkItemSelector({
  selectedItems,
  onAdd,
  onRemove,
  disabled = false,
}: WorkItemSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<WorkItemSummary[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update anchor rect for portal positioning
  const updateAnchorRect = useCallback(() => {
    if (containerRef.current) {
      setAnchorRect(containerRef.current.getBoundingClientRect());
    }
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        // Also check if the click was inside the portal dropdown
        const portalEl = document.querySelector('[data-work-item-selector-dropdown]');
        if (portalEl && portalEl.contains(event.target as Node)) {
          return;
        }
        setIsDropdownOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDropdownOpen]);

  // Recalculate position on scroll/resize while dropdown is open
  useEffect(() => {
    if (!isDropdownOpen) return;

    updateAnchorRect();

    window.addEventListener('scroll', updateAnchorRect, true);
    window.addEventListener('resize', updateAnchorRect);

    return () => {
      window.removeEventListener('scroll', updateAnchorRect, true);
      window.removeEventListener('resize', updateAnchorRect);
    };
  }, [isDropdownOpen, updateAnchorRect]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const searchWorkItems = useCallback(
    async (query: string) => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const response = await listWorkItems({ q: query || undefined, pageSize: 20 });
        // Exclude already-selected items from results using a snapshot of current IDs
        const currentSelectedIds = new Set(selectedItems.map((item) => item.id));
        setResults(response.items.filter((item) => !currentSelectedIds.has(item.id)));
      } catch {
        setSearchError('Failed to load work items');
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [selectedItems],
  );

  function openDropdown() {
    updateAnchorRect();
    setIsDropdownOpen(true);
  }

  function handleInputChange(value: string) {
    setSearchTerm(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void searchWorkItems(value);
    }, 250);
    openDropdown();
  }

  function handleInputFocus() {
    openDropdown();
    if (!searchTerm) {
      void searchWorkItems('');
    }
  }

  function handleSelect(item: WorkItemSummary) {
    onAdd({ id: item.id, name: item.title });
    setSearchTerm('');
    setIsDropdownOpen(false);
    inputRef.current?.focus();
  }

  function handleInputKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
    if (e.key === 'Backspace' && !searchTerm && selectedItems.length > 0) {
      // Remove last chip on Backspace with empty input
      const lastItem = selectedItems[selectedItems.length - 1];
      if (lastItem) onRemove(lastItem.id);
    }
  }

  const listboxId = 'work-item-selector-listbox';

  return (
    <div
      ref={containerRef}
      className={`${styles.chipContainer} ${isDropdownOpen ? styles.chipContainerFocused : ''}`}
      data-testid="work-item-selector"
    >
      {/* Empty placeholder */}
      {selectedItems.length === 0 && !searchTerm && (
        <span className={styles.chipsEmpty}>No work items selected</span>
      )}

      {/* Chips for selected items */}
      {selectedItems.map((item) => (
        <span key={item.id} className={styles.chip}>
          <span className={styles.chipLabel} title={item.name}>
            {item.name.length > 30 ? `${item.name.slice(0, 30)}\u2026` : item.name}
          </span>
          <button
            type="button"
            className={styles.chipRemove}
            onClick={() => onRemove(item.id)}
            disabled={disabled}
            aria-label={`Remove ${item.name}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              width="12"
              height="12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </span>
      ))}

      {/* Search input */}
      <input
        ref={inputRef}
        type="text"
        className={styles.chipInput}
        value={searchTerm}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={handleInputFocus}
        onKeyDown={handleInputKeyDown}
        placeholder={selectedItems.length === 0 ? 'Search work items\u2026' : 'Add more\u2026'}
        disabled={disabled}
        aria-label="Search work items to add"
        aria-haspopup="listbox"
        aria-expanded={isDropdownOpen}
        aria-controls={listboxId}
        autoComplete="off"
      />

      {/* Portal dropdown */}
      {isDropdownOpen && anchorRect !== null && (
        <DropdownPortal anchorRect={anchorRect}>
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Work item search results"
            className={styles.chipDropdown}
            data-work-item-selector-dropdown="true"
          >
            {isSearching && (
              <li className={styles.chipDropdownItem} role="option" aria-selected={false}>
                <span className={styles.chipDropdownLoading}>Searching\u2026</span>
              </li>
            )}
            {!isSearching && searchError !== null && (
              <li className={styles.chipDropdownItem} role="option" aria-selected={false}>
                <span className={styles.chipDropdownEmpty}>{searchError}</span>
              </li>
            )}
            {!isSearching && searchError === null && results.length === 0 && (
              <li className={styles.chipDropdownItem} role="option" aria-selected={false}>
                <span className={styles.chipDropdownEmpty}>
                  {searchTerm ? 'No matching work items' : 'No available work items'}
                </span>
              </li>
            )}
            {!isSearching &&
              searchError === null &&
              results.map((item) => (
                <li
                  key={item.id}
                  role="option"
                  aria-selected={false}
                  className={styles.chipDropdownItem}
                  onClick={() => handleSelect(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelect(item);
                    }
                  }}
                  tabIndex={0}
                >
                  <span className={styles.chipDropdownItemTitle}>{item.title}</span>
                  <span className={styles.chipDropdownItemStatus}>{item.status}</span>
                </li>
              ))}
          </ul>
        </DropdownPortal>
      )}
    </div>
  );
}
