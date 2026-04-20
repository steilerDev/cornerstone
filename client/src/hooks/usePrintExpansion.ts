import { useEffect, useCallback } from 'react';

/**
 * usePrintExpansion — forces a Set<string> state to contain all provided keys
 * during browser print (beforeprint) and restores the original state on afterprint.
 *
 * This hook is used to ensure all expandable rows in a table (like CostBreakdownTable)
 * are expanded when the user prints, so the printed output contains all details.
 * After printing is complete (or cancelled), the expansion state is restored.
 */
export function usePrintExpansion(
  expandedKeys: Set<string>,
  setExpandedKeys: (keys: Set<string>) => void,
  allKeys: Set<string>,
): void {
  const forceExpand = useCallback(() => {
    setExpandedKeys(new Set(allKeys));
  }, [setExpandedKeys, allKeys]);

  useEffect(() => {
    let snapshot: Set<string> | null = null;

    function handleBeforePrint() {
      snapshot = new Set(expandedKeys);
      forceExpand();
    }

    function handleAfterPrint() {
      if (snapshot !== null) {
        setExpandedKeys(snapshot);
        snapshot = null;
      }
    }

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [expandedKeys, forceExpand, setExpandedKeys]);
}
