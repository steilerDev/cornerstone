/**
 * The "median entry" of the capture tap budget (#2227, AC6, owner decision A): 5 photos at 4 spots
 * and a title chip. Shared by the stub benchmark (`capture-benchmark.spec.ts`) and the real
 * Chromium fake-device walk (`capture-camera-chromium.spec.ts`). Synthetic data only.
 *
 * Spots in capture order: (A,N) (A,N) (A,E) (B,E) (C,E). Each of the 3 moves between spots
 * changes ONE chip, which is what the budget counts (a move that changes both is one tap more).
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { createDiaryEntryViaApi } from './apiHelpers.js';
import {
  currentUserId,
  seedRecentTags,
  titleSeedDate,
  uniqueName,
  type CaptureSeed,
} from './captureSeed.js';
import type { DiaryCapturePage } from '../pages/DiaryCapturePage.js';

export interface Named {
  id: string;
  name: string;
}

export interface MedianScenario {
  A: Named;
  B: Named;
  C: Named;
  N: Named;
  E: Named;
  /** Title of the entry seeded with a far-future date (`titleSeedDate`): the title chip. */
  title: string;
}

/** Expected tags per photo, in capture order. */
export function medianExpected(s: MedianScenario): Array<{
  areaId: string;
  orientationId: string;
}> {
  return [
    { areaId: s.A.id, orientationId: s.N.id },
    { areaId: s.A.id, orientationId: s.N.id },
    { areaId: s.A.id, orientationId: s.E.id },
    { areaId: s.B.id, orientationId: s.E.id },
    { areaId: s.C.id, orientationId: s.E.id },
  ];
}

/**
 * Seed areas A B C, orientations N E, the recent-chip lists, and one saved entry dated
 * a far-future date (`titleSeedDate`, so parallel tests cannot push it out of the 6 title chips) titled with a unique name (so the same-day "Add to that entry instead" offer never
 * appears). Call before `page.goto()`.
 */
export async function seedMedianScenario(
  page: Page,
  seed: CaptureSeed,
  testPrefix: string,
  titleLabel = 'Median',
): Promise<MedianScenario> {
  const A = await seed.area('Area A');
  const B = await seed.area('Area B');
  const C = await seed.area('Area C');
  const N = await seed.orientation('North');
  const E = await seed.orientation('East');
  const title = uniqueName(testPrefix, titleLabel);
  seed.trackEntry(
    await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: titleSeedDate(),
      body: 'Seeded for the title chip',
      title,
      status: 'saved',
    }),
  );
  await seedRecentTags(page, await currentUserId(page), {
    areaIds: [A.id, B.id, C.id],
    orientationIds: [N.id, E.id],
  });
  return { A, B, C, N, E, title };
}

/**
 * Home -> ＋ -> Photo tile -> A N, 2 shots, E, 1 shot, B, 1 shot, C, 1 shot, Review, title chip,
 * Save = 15 taps. The page must be on Home with `resetTaps()` called. Returns the new entry id.
 */
export async function walkMedianWithCamera(
  capture: DiaryCapturePage,
  s: MedianScenario,
): Promise<string> {
  const { camera } = capture;
  await capture.startFromPlus('photo');
  await camera.setArea(s.A.name);
  await camera.setOrientation(s.N.name);
  await capture.shoot(2);
  await camera.setOrientation(s.E.name);
  await capture.shoot(1);
  await camera.setArea(s.B.name);
  // Orientation stays pressed when only the Area changes.
  await expect(camera.orientationChip(s.E.name)).toHaveAttribute('aria-pressed', 'true');
  await capture.shoot(1);
  await camera.setArea(s.C.name);
  await expect(camera.orientationChip(s.E.name)).toHaveAttribute('aria-pressed', 'true');
  await capture.shoot(1);
  await expect(camera.exit).toHaveText('Review (5)');
  await capture.closeCamera();
  await expect(capture.tiles).toHaveCount(5);
  await capture.setTitleChip(s.title);
  await capture.saveEntry();
  return capture.entryIdFromUrl();
}
