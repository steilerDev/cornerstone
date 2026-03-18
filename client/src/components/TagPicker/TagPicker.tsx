import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TagResponse } from '@cornerstone/shared';
import { TagPill } from '../TagPill/TagPill.js';
import styles from './TagPicker.module.css';

interface TagPickerProps {
  availableTags: TagResponse[];
  selectedTagIds: string[];
  onSelectionChange: (tagIds: string[]) => void;
  onCreateTag?: (name: string, color: string | null) => Promise<TagResponse>;
  disabled?: boolean;
  onError?: (message: string) => void;
}

export function TagPicker({
  availableTags,
  selectedTagIds,
  onSelectionChange,
  onCreateTag,
  disabled = false,
  onError,
}: TagPickerProps) {
  const { t } = useTranslation('common');
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newTagColor, setNewTagColor] = useState<string>('#3b82f6');
  const [createError, setCreateError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
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

  const selectedTags = availableTags.filter((tag) => selectedTagIds.includes(tag.id));
  const unselectedTags = availableTags.filter((tag) => !selectedTagIds.includes(tag.id));

  // Filter tags by search term
  const filteredTags = unselectedTags.filter((tag) =>
    tag.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Check if search term is a potential new tag
  const exactMatch = availableTags.some(
    (tag) => tag.name.toLowerCase() === searchTerm.trim().toLowerCase(),
  );
  const canCreateNew = searchTerm.trim() && !exactMatch && onCreateTag;

  const handleTagSelect = (tagId: string) => {
    onSelectionChange([...selectedTagIds, tagId]);
    setSearchTerm('');
    inputRef.current?.focus();
  };

  const handleTagRemove = (tagId: string) => {
    onSelectionChange(selectedTagIds.filter((id) => id !== tagId));
  };

  const handleCreateTag = async () => {
    if (!onCreateTag || !canCreateNew) return;

    setIsCreating(true);
    setCreateError(null);

    try {
      const newTag = await onCreateTag(searchTerm.trim(), newTagColor);
      onSelectionChange([...selectedTagIds, newTag.id]);
      setSearchTerm('');
      setNewTagColor('#3b82f6'); // Reset to default
      inputRef.current?.focus();
    } catch {
      const errorMessage = t('tagPicker.createError');
      setCreateError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className={styles.container} ref={dropdownRef}>
      <div className={styles.selectedContainer}>
        {selectedTags.map((tag) => (
          <TagPill
            key={tag.id}
            name={tag.name}
            color={tag.color}
            onRemove={() => handleTagRemove(tag.id)}
          />
        ))}
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          placeholder={
            selectedTags.length === 0
              ? t('tagPicker.placeholderEmpty')
              : t('tagPicker.placeholderMore')
          }
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => setIsOpen(true)}
          disabled={disabled}
        />
      </div>

      {isOpen && (
        <div className={styles.dropdown}>
          {filteredTags.length > 0 && (
            <div className={styles.tagList}>
              {filteredTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className={styles.tagOption}
                  onClick={() => handleTagSelect(tag.id)}
                >
                  <TagPill name={tag.name} color={tag.color} />
                </button>
              ))}
            </div>
          )}

          {canCreateNew && (
            <div className={styles.createForm}>
              {createError && (
                <div className={styles.createError} role="alert">
                  {createError}
                </div>
              )}
              <div className={styles.createHeader}>
                {t('tagPicker.createHeader')} <strong>{searchTerm.trim()}</strong>
              </div>
              <div className={styles.colorPicker}>
                <label htmlFor="tagColor" className={styles.colorLabel}>
                  {t('tagPicker.colorLabel')}
                </label>
                <input
                  type="color"
                  id="tagColor"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className={styles.colorInput}
                  disabled={isCreating}
                />
              </div>
              <button
                type="button"
                className={styles.createButton}
                disabled={isCreating}
                onClick={handleCreateTag}
              >
                {isCreating ? t('tagPicker.creating') : t('tagPicker.createButton')}
              </button>
            </div>
          )}

          {filteredTags.length === 0 && !canCreateNew && (
            <div className={styles.emptyState}>
              {searchTerm ? t('tagPicker.noMatchingTags') : t('tagPicker.noMoreTags')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
