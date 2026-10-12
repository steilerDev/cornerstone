import { TRADE_ID_MAX_LENGTH, TRADE_IDS_MAX } from '@cornerstone/shared';
import { ValidationError } from '../../errors/AppError.js';

/**
 * Parses the `tradeIds` query parameter of GET /api/vendors and GET /api/search (#2213).
 * Comma-separated; entries are trimmed, empties dropped, duplicates removed (first-seen order).
 * One parser for both endpoints.
 * @throws ValidationError when more than 50 ids remain or an id is longer than 64 characters
 */
export function parseTradeIds(raw: string | undefined): string[] {
  const ids = [
    ...new Set(
      (raw ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== ''),
    ),
  ];
  if (ids.length > TRADE_IDS_MAX || ids.some((id) => id.length > TRADE_ID_MAX_LENGTH)) {
    throw new ValidationError('Invalid tradeIds', {
      tradeIds: `at most ${TRADE_IDS_MAX} ids, each 1-${TRADE_ID_MAX_LENGTH} characters`,
    });
  }
  return ids;
}
