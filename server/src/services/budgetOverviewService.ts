import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import type { BudgetOverview, OversubscribedSubsidy } from '@cornerstone/shared';
import { computeMoney, toMajor } from './shared/moneyEngine.js';
import { loadMoneyInput, type ProjectMoney } from './moneyService.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Get the project-level budget overview: the grant summary only (#2237). Every other project
 * figure comes from the money service (`GET /api/budget/overview` returns it as `money`).
 *
 * Grant-derived fields come from the money service (ADR-039, #2228): counted
 * (approved/received) grants only, capped, recomputed per scenario:
 * expected -> totalReductions, best -> minTotalPayback, worst -> maxTotalPayback.
 */
export function getBudgetOverview(
  db: DbType,
  vatRate: number,
  project?: Pick<ProjectMoney, 'result'>,
): BudgetOverview {
  const { expectedGrants, grants } = (
    project ?? { result: computeMoney(loadMoneyInput(db, vatRate)) }
  ).result;

  const subsidyCountRow = db.get<{ activeSubsidyCount: number }>(
    sql`SELECT COUNT(*) AS activeSubsidyCount
    FROM subsidy_programs
    WHERE application_status != 'rejected'`,
  );

  const oversubscribedSubsidies: OversubscribedSubsidy[] = grants
    .filter((g) => g.capped)
    .map((g) => ({
      subsidyProgramId: g.input.id,
      name: g.input.name,
      maximumAmount: g.input.maximumAmount!,
      maxPayout: toMajor(g.payout.worst),
      uncappedMinPayback: toMajor(g.uncapped.best),
      uncappedMaxPayback: toMajor(g.uncapped.worst),
      minExcess: toMajor(Math.max(0, g.uncapped.best - g.payout.best)),
      maxExcess: toMajor(g.uncapped.worst - g.payout.worst),
    }));

  return {
    subsidySummary: {
      totalReductions: toMajor(expectedGrants.expected),
      activeSubsidyCount: subsidyCountRow!.activeSubsidyCount,
      minTotalPayback: toMajor(expectedGrants.best),
      maxTotalPayback: toMajor(expectedGrants.worst),
      oversubscribedSubsidies,
    },
  };
}
