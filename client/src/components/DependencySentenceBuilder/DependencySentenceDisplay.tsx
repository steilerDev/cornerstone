import { Link } from 'react-router-dom';
import type { DependencyResponse, DependencyType } from '@cornerstone/shared';
import { dependencyTypeToVerbs } from './dependencyVerbs.js';
import styles from './DependencySentenceDisplay.module.css';

interface DependencySentenceDisplayProps {
  predecessors: DependencyResponse[];
  successors: DependencyResponse[];
  /** Label for "this item" in group headers. Default: "this" */
  thisItemLabel?: string;
  onDelete: (type: 'predecessor' | 'successor', workItemId: string, title: string) => void;
}

interface DependencyGroup {
  dependencyType: DependencyType;
  items: DependencyResponse[];
}

function groupByType(deps: DependencyResponse[]): DependencyGroup[] {
  const map = new Map<DependencyType, DependencyResponse[]>();
  for (const dep of deps) {
    const list = map.get(dep.dependencyType) ?? [];
    list.push(dep);
    map.set(dep.dependencyType, list);
  }
  return Array.from(map.entries()).map(([dependencyType, items]) => ({ dependencyType, items }));
}

export function DependencySentenceDisplay({
  predecessors,
  successors,
  thisItemLabel = 'this',
  onDelete,
}: DependencySentenceDisplayProps) {
  const predecessorGroups = groupByType(predecessors);
  const successorGroups = groupByType(successors);

  if (predecessors.length === 0 && successors.length === 0) {
    return <p className={styles.emptyState}>No dependencies</p>;
  }

  return (
    <div className={styles.container}>
      {/* Predecessor groups: other → this */}
      {predecessorGroups.map((group) => {
        const { predecessorVerb, successorVerb } = dependencyTypeToVerbs(group.dependencyType);
        const header = `Must ${predecessorVerb} before ${thisItemLabel} can ${successorVerb}:`;
        return (
          <div key={`pred-${group.dependencyType}`} className={styles.group}>
            <p className={styles.groupHeader}>{header}</p>
            <ul className={styles.itemList}>
              {group.items.map((dep) => (
                <li key={dep.workItem.id} className={styles.item}>
                  <Link to={`/work-items/${dep.workItem.id}`} className={styles.itemLink}>
                    {dep.workItem.title}
                  </Link>
                  <button
                    type="button"
                    className={styles.deleteButton}
                    onClick={() => onDelete('predecessor', dep.workItem.id, dep.workItem.title)}
                    aria-label={`Remove dependency on ${dep.workItem.title}`}
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {/* Successor groups: this → other */}
      {successorGroups.map((group) => {
        const { predecessorVerb, successorVerb } = dependencyTypeToVerbs(group.dependencyType);
        const header = `This must ${predecessorVerb} before ... can ${successorVerb}:`;
        return (
          <div key={`succ-${group.dependencyType}`} className={styles.group}>
            <p className={styles.groupHeader}>{header}</p>
            <ul className={styles.itemList}>
              {group.items.map((dep) => (
                <li key={dep.workItem.id} className={styles.item}>
                  <Link to={`/work-items/${dep.workItem.id}`} className={styles.itemLink}>
                    {dep.workItem.title}
                  </Link>
                  <button
                    type="button"
                    className={styles.deleteButton}
                    onClick={() => onDelete('successor', dep.workItem.id, dep.workItem.title)}
                    aria-label={`Remove dependency on ${dep.workItem.title}`}
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
