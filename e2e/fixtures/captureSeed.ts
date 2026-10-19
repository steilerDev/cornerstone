/**
 * Seed and read helpers shared by the capture-screen specs (#2221). Synthetic data only.
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import {
  createAreaViaApi,
  createOrientationViaApi,
  deleteAreaViaApi,
  deleteDiaryEntryViaApi,
  deleteOrientationViaApi,
} from './apiHelpers.js';

export interface ApiPhoto {
  id: string;
  originalFilename: string;
  areaId: string | null;
  orientationId: string | null;
  annotatedAt: string | null;
  caption: string | null;
}

export interface ApiDiaryEntry {
  id: string;
  title: string | null;
  body: string;
  status: 'draft' | 'saved';
  entryType: string;
  entryDate: string;
  metadata: Record<string, unknown> | null;
}

/** Today as YYYY-MM-DD in the runner's local time (matches `todayLocalIsoDate` in the app). */
export function todayIso(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Entry date for a seeded entry whose title must show as a title chip. The chips are the 6 newest
 * saved entries (by date) of the shared database, so a seed dated yesterday is pushed out by the
 * entries other parallel tests save today. A date a year or more ahead always ranks first, is
 * never "today" (no "Add to that entry instead" offer) and differs per call.
 */
export function titleSeedDate(): string {
  return todayIso(365 + Math.floor(Math.random() * 365));
}

/** A name that is unique per test run and worker. */
export function uniqueName(prefix: string, label: string): string {
  return `${prefix} ${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export async function currentUserId(page: Page): Promise<string> {
  const response = await page.request.get('/api/auth/me');
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { user: { id: string } | null };
  if (!body.user) throw new Error('No signed-in user');
  return body.user.id;
}

/**
 * Pre-fill the "recent areas / orientations" the chips are built from (localStorage, per user).
 * Call before `page.goto()`. Without it a chip is only on screen when it is among the 4 recent
 * areas or the first orientations, which a shared database does not guarantee.
 */
export async function seedRecentTags(
  page: Page,
  userId: string,
  recents: { areaIds?: string[]; orientationIds?: string[] },
): Promise<void> {
  await page.addInitScript(
    ({ userId: id, areaIds, orientationIds }) => {
      try {
        if (areaIds.length > 0) {
          localStorage.setItem(`cornerstone.capture.recentAreas.${id}`, JSON.stringify(areaIds));
        }
        if (orientationIds.length > 0) {
          localStorage.setItem(
            `cornerstone.capture.recentOrientations.${id}`,
            JSON.stringify(orientationIds),
          );
        }
      } catch {
        // Storage unavailable: the test then fails on a missing chip, which is the right signal.
      }
    },
    { userId, areaIds: recents.areaIds ?? [], orientationIds: recents.orientationIds ?? [] },
  );
}

export async function listEntryPhotos(page: Page, entryId: string): Promise<ApiPhoto[]> {
  const response = await page.request.get(
    `/api/photos?entityType=diary_entry&entityId=${encodeURIComponent(entryId)}`,
  );
  expect(response.ok(), `GET photos of entry ${entryId}`).toBeTruthy();
  return ((await response.json()) as { photos: ApiPhoto[] }).photos;
}

/**
 * 'ok' when the entry has exactly `count` photos and every one carries the area and orientation,
 * otherwise a short description of what differs (readable in a failed poll).
 * Poll it: a chip tapped while uploads run re-tags the finished ones with a follow-up request.
 */
export async function photosTagged(
  page: Page,
  entryId: string,
  count: number,
  tags: { areaId: string; orientationId: string },
): Promise<string> {
  const photos = await listEntryPhotos(page, entryId);
  const wrong = photos.filter(
    (p) => p.areaId !== tags.areaId || p.orientationId !== tags.orientationId,
  );
  if (photos.length === count && wrong.length === 0) return 'ok';
  return `${photos.length}/${count} photos, ${wrong.length} untagged or mis-tagged: ${JSON.stringify(
    wrong.map((p) => [p.areaId, p.orientationId]),
  )}`;
}

/**
 * 'ok' when the entry's photos, in capture order, carry exactly the expected (area, orientation)
 * pairs; otherwise a short diagnostic. Capture order is the file-name order (`capture-<ms>.jpg`
 * for shots, `<prefix>-<n>.png` for library files): the API lists by `sortOrder` (0 for every
 * capture photo) and then `createdAt`, which concurrent uploads can reorder. Poll it.
 */
export async function photosTaggedInOrder(
  page: Page,
  entryId: string,
  expected: ReadonlyArray<{ areaId: string; orientationId: string }>,
): Promise<string> {
  const photos = (await listEntryPhotos(page, entryId)).sort((a, b) =>
    a.originalFilename.localeCompare(b.originalFilename),
  );
  const actual = photos.map((p) => [p.areaId, p.orientationId]);
  const wanted = expected.map((e) => [e.areaId, e.orientationId]);
  if (JSON.stringify(actual) === JSON.stringify(wanted)) return 'ok';
  return `expected ${JSON.stringify(wanted)}, got ${JSON.stringify(actual)}`;
}

export async function getEntry(page: Page, id: string): Promise<ApiDiaryEntry> {
  const response = await page.request.get(`/api/diary-entries/${id}`);
  expect(response.ok(), `GET diary entry ${id}`).toBeTruthy();
  return (await response.json()) as ApiDiaryEntry;
}

/** Id of the area with exactly this name (areas created in the UI have no id in the test). */
export async function findAreaId(page: Page, name: string): Promise<string> {
  const response = await page.request.get('/api/areas');
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { areas: Array<{ id: string; name: string }> };
  const match = body.areas.find((area) => area.name === name);
  if (!match) throw new Error(`No area named "${name}"`);
  return match.id;
}

export async function entryStatus(page: Page, id: string): Promise<number> {
  return (await page.request.get(`/api/diary-entries/${id}`)).status();
}

/**
 * Collects everything a test creates so one `cleanup()` in `finally` removes it (entries first,
 * then areas and orientations, which entries' photos reference).
 */
export class CaptureSeed {
  private readonly entries: string[] = [];
  private readonly areas: string[] = [];
  private readonly orientations: string[] = [];

  constructor(
    private readonly page: Page,
    readonly prefix: string,
  ) {}

  trackEntry(id: string): string {
    this.entries.push(id);
    return id;
  }

  async area(label: string): Promise<{ id: string; name: string }> {
    const name = uniqueName(this.prefix, label);
    const id = await createAreaViaApi(this.page, { name });
    this.areas.push(id);
    return { id, name };
  }

  trackArea(id: string): void {
    this.areas.push(id);
  }

  async orientation(label: string): Promise<{ id: string; name: string }> {
    const name = uniqueName(this.prefix, label);
    const id = await createOrientationViaApi(this.page, { name });
    this.orientations.push(id);
    return { id, name };
  }

  async cleanup(): Promise<void> {
    for (const id of this.entries) await deleteDiaryEntryViaApi(this.page, id).catch(() => {});
    for (const id of this.areas) await deleteAreaViaApi(this.page, id).catch(() => {});
    for (const id of this.orientations) {
      await deleteOrientationViaApi(this.page, id).catch(() => {});
    }
  }
}
