/** System states shown as chips on Settings > Integrations and Backups (#2217). */
export const INTEGRATION_STATUSES = ['connected', 'unreachable', 'on', 'off', 'notSetUp'] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

/** Outcome of the last automatic backup. */
export const BACKUP_RUN_OUTCOMES = ['succeeded', 'failed'] as const;
export type BackupRunOutcome = (typeof BACKUP_RUN_OUTCOMES)[number];

/**
 * Paperless chip: notSetUp when not configured; null while the probe runs;
 * connected/unreachable after. `'failed'` means the probe request itself failed.
 */
export function paperlessChipState(
  configured: boolean,
  probe: { reachable: boolean } | null | 'failed',
): IntegrationStatus | null {
  if (!configured) return 'notSetUp';
  if (probe === null) return null;
  if (probe === 'failed') return 'unreachable';
  return probe.reachable ? 'connected' : 'unreachable';
}
