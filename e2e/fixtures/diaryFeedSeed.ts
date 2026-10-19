/**
 * Synthetic Site diary data for the feed, Filters and entry-page specs (#2225).
 *
 * Everything carries a per-call unique tag (`uniq`) in its title / area / company name, so a spec
 * can isolate its rows in the shared E2E database with `?q=<uniq>` and never asserts a global
 * count. Data is invented; nothing here comes from a real project.
 */

import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  createAreaViaApi,
  createDiaryEntryViaApi,
  createVendorViaApi,
  deleteAreaViaApi,
  deleteDiaryEntryViaApi,
  deleteVendorViaApi,
  uploadDiaryPhotoViaApi,
} from './apiHelpers.js';
import { todayIso } from './captureSeed.js';

export interface DiaryFeedSeed {
  /** Unique tag in every title, area name and company name below. */
  uniq: string;
  parentAreaName: string;
  areaName: string;
  /** "<parent> › <area>": how the row chip and the entry page show the area. */
  areaPath: string;
  areaId: string;
  parentAreaId: string;
  companyName: string;
  companyId: string;
  /** Today; a daily log with the company and 2 workers (no photos). */
  dailyLogId: string;
  dailyLogTitle: string;
  /** Today; a daily log with the company and 1 worker. */
  singleWorkerLogId: string;
  singleWorkerLogTitle: string;
  /** Today; a delivery whose free-text company is the company name in UPPER case. */
  deliveryId: string;
  deliveryTitle: string;
  /** 7 days ago (always "Last week": the same weekday one week back); a general note with 7 photos tagged with the area. */
  photoNoteId: string;
  photoNoteTitle: string;
  photoNotePhotoIds: string[];
  /** Delete everything in dependency order; safe to call once in `finally`. */
  cleanup: () => Promise<void>;
}

/** A short unique tag for one test (the `testPrefix` fixture is per worker, not per test). */
export function uniqueTag(testPrefix: string): string {
  return `${testPrefix}-${randomUUID().slice(0, 6)}`;
}

/** Monday (YYYY-MM-DD) of the ISO week containing `isoDay`. */
export function mondayOf(isoDay: string): string {
  const date = new Date(`${isoDay}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

/** Seed one company, a two-level area, and four entries (three today, one 7 days ago). */
export async function seedDiaryFeed(
  page: Page,
  testPrefix: string,
  options: { photoCount?: number } = {},
): Promise<DiaryFeedSeed> {
  const photoCount = options.photoCount ?? 7;
  const uniq = uniqueTag(testPrefix);
  const parentAreaName = `Wing ${uniq}`;
  const areaName = `Room ${uniq}`;
  const companyName = `Company ${uniq}`;

  const entryIds: string[] = [];
  const parentAreaId = await createAreaViaApi(page, { name: parentAreaName });
  const areaId = await createAreaViaApi(page, { name: areaName, parentId: parentAreaId });
  const companyId = await createVendorViaApi(page, { name: companyName });

  const today = todayIso();
  const dailyLogTitle = `${uniq} Daily log two workers`;
  const dailyLogId = await createDiaryEntryViaApi(page, {
    entryType: 'daily_log',
    entryDate: today,
    title: dailyLogTitle,
    body: 'Framing continued on the ground floor.',
    metadata: { vendorId: companyId, workersOnSite: 2 },
  });
  entryIds.push(dailyLogId);

  const singleWorkerLogTitle = `${uniq} Daily log one worker`;
  const singleWorkerLogId = await createDiaryEntryViaApi(page, {
    entryType: 'daily_log',
    entryDate: today,
    title: singleWorkerLogTitle,
    body: 'Cleanup after framing.',
    metadata: { vendorId: companyId, workersOnSite: 1 },
  });
  entryIds.push(singleWorkerLogId);

  const deliveryTitle = `${uniq} Delivery of timber`;
  const deliveryId = await createDiaryEntryViaApi(page, {
    entryType: 'delivery',
    entryDate: today,
    title: deliveryTitle,
    body: 'Timber arrived in the morning.',
    metadata: { vendor: companyName.toUpperCase(), materials: ['Timber'] },
  });
  entryIds.push(deliveryId);

  const photoNoteTitle = `${uniq} Photo note`;
  const photoNoteId = await createDiaryEntryViaApi(page, {
    entryType: 'general_note',
    entryDate: todayIso(-7),
    title: photoNoteTitle,
    body: 'Progress photos from the room.\nSecond line that the row does not show.',
  });
  entryIds.push(photoNoteId);
  const photoNotePhotoIds: string[] = [];
  for (let i = 0; i < photoCount; i++) {
    photoNotePhotoIds.push(await uploadDiaryPhotoViaApi(page, photoNoteId, { areaId }));
  }

  return {
    uniq,
    parentAreaName,
    areaName,
    areaPath: `${parentAreaName} › ${areaName}`,
    areaId,
    parentAreaId,
    companyName,
    companyId,
    dailyLogId,
    dailyLogTitle,
    singleWorkerLogId,
    singleWorkerLogTitle,
    deliveryId,
    deliveryTitle,
    photoNoteId,
    photoNoteTitle,
    photoNotePhotoIds,
    cleanup: async () => {
      for (const id of entryIds) await deleteDiaryEntryViaApi(page, id).catch(() => undefined);
      await deleteAreaViaApi(page, areaId).catch(() => undefined);
      await deleteAreaViaApi(page, parentAreaId).catch(() => undefined);
      await deleteVendorViaApi(page, companyId).catch(() => undefined);
    },
  };
}
