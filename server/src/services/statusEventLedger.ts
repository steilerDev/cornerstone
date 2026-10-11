/**
 * Status event ledger and collector (EPIC-21 story 1.3, ADR-040 W3/W4).
 *
 * The ledger remembers the latest status event this process wrote per subject, so a manual
 * A -> B -> A inside the undo window can retract the first event instead of writing a second.
 * It is in memory only: a restart clears it and the next event is written normally.
 *
 * The collector records the event ids written (and rows retracted) while an undoable operation
 * runs, so Undo can delete / re-insert exactly those rows. Services are synchronous
 * (better-sqlite3), so a module-level stack is safe.
 */

export interface LedgerEntry {
  eventId: string;
  from: string;
  to: string;
  userId: string | null;
  /** epoch ms */
  at: number;
}

/** A retracted diary_entries row (kept opaque for re-insertion) plus its ledger entry. */
export interface RetractedEvent {
  row: Record<string, unknown>;
  key: string;
  entry: LedgerEntry;
}

export interface Collection {
  written: string[];
  retracted: RetractedEvent[];
}

const ledger = new Map<string, LedgerEntry>();
const collections: Collection[] = [];

export function subjectKey(
  entryType: string,
  sourceEntityType: string | null,
  sourceEntityId: string | null,
): string {
  return `${entryType}|${sourceEntityType ?? ''}|${sourceEntityId ?? ''}`;
}

export function getLedgerEntry(key: string): LedgerEntry | undefined {
  return ledger.get(key);
}

export function recordLedgerEntry(key: string, entry: LedgerEntry): void {
  ledger.set(key, entry);
}

export function dropLedgerEntry(key: string): void {
  ledger.delete(key);
}

/** Remove the ledger entry whose event id is `eventId` (used by Undo). */
export function forgetEvent(eventId: string): void {
  for (const [key, entry] of ledger) {
    if (entry.eventId === eventId) ledger.delete(key);
  }
}

/** Put a ledger entry back (used by Undo when re-inserting a retracted event). */
export function restoreLedgerEntry(key: string, entry: LedgerEntry): void {
  ledger.set(key, entry);
}

export function beginCollection(): Collection {
  const collection: Collection = { written: [], retracted: [] };
  collections.push(collection);
  return collection;
}

export function endCollection(collection: Collection): void {
  const index = collections.lastIndexOf(collection);
  if (index !== -1) collections.splice(index, 1);
}

export function activeCollection(): Collection | undefined {
  return collections[collections.length - 1];
}

export function __resetLedgerForTests(): void {
  ledger.clear();
  collections.length = 0;
}
