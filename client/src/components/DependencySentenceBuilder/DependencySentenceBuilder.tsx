import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { DependencyType } from '@cornerstone/shared';
import { EntityPicker } from '../EntityPicker/EntityPicker.js';
import type { EntityOption } from '../EntityPicker/types.js';
import { verbsToDependencyType } from './dependencyVerbs.js';
import type { DependencyVerb } from './dependencyVerbs.js';
import styles from './DependencySentenceBuilder.module.css';

interface DependencySentenceBuilderProps {
  /** The actual work item ID on detail page, or the sentinel string on create page. */
  thisItemId: string;
  /** Label shown for "This item" in the picker. Default: "This item". */
  thisItemLabel?: string;
  /** IDs to exclude from both pickers (existing dependency IDs + current item ID). */
  excludeIds: string[];
  disabled?: boolean;
  onAdd: (data: {
    predecessorId: string;
    successorId: string;
    dependencyType: DependencyType;
    otherItemTitle: string;
  }) => void;
}

export function DependencySentenceBuilder({
  thisItemId,
  thisItemLabel = 'This item',
  excludeIds,
  disabled = false,
  onAdd,
}: DependencySentenceBuilderProps) {
  const { t } = useTranslation('workItems');

  // Slot 1: predecessor (left side)
  const [slot1Id, setSlot1Id] = useState('');
  const [slot1Title, setSlot1Title] = useState('');

  // Slot 2: successor (right side), defaults to "This item"
  const [slot2Id, setSlot2Id] = useState(thisItemId);
  const [slot2Title, setSlot2Title] = useState(thisItemLabel);

  const [predecessorVerb, setPredecessorVerb] = useState<DependencyVerb>('finish');
  const [successorVerb, setSuccessorVerb] = useState<DependencyVerb>('start');

  const thisItemSpecialOption = useMemo(
    () => [{ id: thisItemId, label: thisItemLabel }],
    [thisItemId, thisItemLabel],
  );

  // Special option for slot1 is only shown if slot2 doesn't already have "This item"
  const slot1SpecialOptions = useMemo(
    () => (slot2Id === thisItemId ? [] : thisItemSpecialOption),
    [slot2Id, thisItemId, thisItemSpecialOption],
  );

  // Special option for slot2 is only shown if slot1 doesn't already have "This item"
  const slot2SpecialOptions = useMemo(
    () => (slot1Id === thisItemId ? [] : thisItemSpecialOption),
    [slot1Id, thisItemId, thisItemSpecialOption],
  );

  // Slot 1 excludes slot2's current selection (+ the main excludeIds list)
  const slot1ExcludeIds = useMemo(() => {
    const ids = new Set(excludeIds);
    if (slot2Id && slot2Id !== thisItemId) ids.add(slot2Id);
    return Array.from(ids);
  }, [excludeIds, slot2Id, thisItemId]);

  // Slot 2 excludes slot1's current selection (+ the main excludeIds list)
  const slot2ExcludeIds = useMemo(() => {
    const ids = new Set(excludeIds);
    if (slot1Id && slot1Id !== thisItemId) ids.add(slot1Id);
    return Array.from(ids);
  }, [excludeIds, slot1Id, thisItemId]);

  const canAdd = slot1Id !== '' && slot2Id !== '' && slot1Id !== slot2Id;

  const handleSlot1Change = (id: string, option: EntityOption | null) => {
    setSlot1Id(id);
    setSlot1Title(id === thisItemId ? thisItemLabel : (option?.label ?? ''));
  };

  const handleSlot2Change = (id: string, option: EntityOption | null) => {
    setSlot2Id(id);
    setSlot2Title(id === thisItemId ? thisItemLabel : (option?.label ?? ''));
  };

  const handleAdd = () => {
    const dependencyType = verbsToDependencyType(predecessorVerb, successorVerb);

    // Determine the "other item" title for display
    const otherItemTitle = slot1Id === thisItemId ? slot2Title : slot1Title;

    onAdd({
      predecessorId: slot1Id,
      successorId: slot2Id,
      dependencyType,
      otherItemTitle,
    });

    // Reset: slot1 → empty, slot2 → "This item", verbs → finish/start
    setSlot1Id('');
    setSlot1Title('');
    setSlot2Id(thisItemId);
    setSlot2Title(thisItemLabel);
    setPredecessorVerb('finish');
    setSuccessorVerb('start');
  };

  return (
    <div className={styles.container}>
      <div className={styles.sentence}>
        {/* Slot 1: predecessor */}
        <div className={styles.pickerSlot}>
          <EntityPicker
            kind="task"
            value={slot1Id}
            onChange={handleSlot1Change}
            excludeIds={slot1ExcludeIds}
            disabled={disabled}
            placeholder={t('detail.constraints.dependencyBuilder.searchPlaceholder')}
            specialOptions={slot1SpecialOptions}
          />
        </div>

        <span className={styles.conjunction}>{t('detail.constraints.dependencyBuilder.must')}</span>

        {/* Predecessor verb dropdown */}
        <select
          className={styles.verbSelect}
          value={predecessorVerb}
          onChange={(e) => setPredecessorVerb(e.target.value as DependencyVerb)}
          disabled={disabled}
          aria-label={t('detail.constraints.dependencyBuilder.predecessorVerbAriaLabel')}
        >
          <option value="finish">{t('detail.constraints.dependencyBuilder.finish')}</option>
          <option value="start">{t('detail.constraints.dependencyBuilder.start')}</option>
        </select>

        <span className={styles.conjunction}>
          {t('detail.constraints.dependencyBuilder.before')}
        </span>

        {/* Slot 2: successor */}
        <div className={styles.pickerSlot}>
          <EntityPicker
            kind="task"
            value={slot2Id}
            onChange={handleSlot2Change}
            excludeIds={slot2ExcludeIds}
            disabled={disabled}
            placeholder={t('detail.constraints.dependencyBuilder.searchPlaceholder')}
            specialOptions={slot2SpecialOptions}
          />
        </div>

        <span className={styles.conjunction}>{t('detail.constraints.dependencyBuilder.can')}</span>

        {/* Successor verb dropdown */}
        <select
          className={styles.verbSelect}
          value={successorVerb}
          onChange={(e) => setSuccessorVerb(e.target.value as DependencyVerb)}
          disabled={disabled}
          aria-label={t('detail.constraints.dependencyBuilder.successorVerbAriaLabel')}
        >
          <option value="start">{t('detail.constraints.dependencyBuilder.start')}</option>
          <option value="finish">{t('detail.constraints.dependencyBuilder.finish')}</option>
        </select>

        <button
          type="button"
          className={styles.addButton}
          onClick={handleAdd}
          disabled={!canAdd || disabled}
        >
          {t('common:button.add')}
        </button>
      </div>
    </div>
  );
}
