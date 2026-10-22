import type { TFunction } from 'i18next';
import type { ObjectListSearchingAll } from './types.js';

/** "Searching all · n more in ‹Chip›" for a list with a preselected chip (Invoices). */
export function searchingAllNote(t: TFunction, input: ObjectListSearchingAll): string {
  const count = input.outside;
  if (count === 0) return t('objectList.searchingAll.none');
  if (input.chips.length === 1) {
    return t('objectList.searchingAll.inChip', { count, chip: input.chips[0] });
  }
  if (input.chips.length === 2) {
    return t('objectList.searchingAll.inTwo', {
      count,
      first: input.chips[0],
      second: input.chips[1],
    });
  }
  return t('objectList.searchingAll.inOther', { count });
}
