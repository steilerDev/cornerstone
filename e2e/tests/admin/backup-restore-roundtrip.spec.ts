/**
 * E2E: real backup -> mutate -> restore -> process exit 0 -> restart -> verify.
 *
 * Runs in its OWN container (non-root user, /app/data VOLUME mount point, /backups on a
 * separate anonymous volume, no bind mounts) so the in-place restore swap is exercised for
 * real. Never touches the shared suite container, APP_BASE_URL, or its auth state.
 *
 * Desktop project only; deliberately not tagged @smoke or @responsive.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { test, expect, request as playwrightRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { Network, getContainerRuntimeClient } from 'testcontainers';
import type { StartedNetwork, StartedTestContainer } from 'testcontainers';
import { startCornerstoneContainer } from '../../containers/cornerstoneContainer.js';
import { seedAdminUser, loginAsUser } from '../../fixtures/seed.js';
import { API } from '../../fixtures/testData.js';

const TEST_PHOTO_PNG = readFileSync(
  fileURLToPath(new URL('../../fixtures/test-photo-100x100.png', import.meta.url)),
);

const ADMIN_EMAIL = 'roundtrip-admin@example.com';
const ADMIN_PASSWORD = 'RoundtripPassw0rd!';
const POLL_TIMEOUT_MS = 60_000;

interface ListedWorkItem {
  title: string;
}

// Project default is 15s; image start, restore exit and restart polls need far more.
test.describe.configure({ mode: 'serial', timeout: 240_000 });

test.describe('Backup restore round-trip (real container)', () => {
  let network: StartedNetwork | undefined;
  let container: StartedTestContainer;
  let api: APIRequestContext;
  let baseUrl: string;
  let backupFilename: string;
  let photoId: string;
  // Bytes as served before the backup. The server re-encodes uploads (sharp rotate + PNG),
  // so the served bytes never equal the uploaded fixture.
  let servedPhotoBytes: Buffer;

  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop', 'Container round-trip runs on desktop only');
  });

  test.beforeAll(async () => {
    if (test.info().project.name !== 'desktop') return;
    network = await new Network().start();
    const started = await startCornerstoneContainer({ network });
    container = started.container;
    baseUrl = started.baseUrl;
    api = await playwrightRequest.newContext({ baseURL: baseUrl });
  });

  test.afterAll(async () => {
    await api?.dispose().catch(() => undefined);
    // The container has already exited after the restore; stopping must tolerate that.
    await container?.stop().catch(() => undefined);
    await network?.stop().catch(() => undefined);
  });

  async function listWorkItemTitles(ctx: APIRequestContext): Promise<string[]> {
    const response = await ctx.get(`${API.workItems}?pageSize=100`);
    expect(response.status(), 'GET /api/work-items').toBe(200);
    const body = (await response.json()) as { items: ListedWorkItem[] };
    return body.items.map((i) => i.title);
  }

  test('seeds data: admin, work item, diary entry with photo', async () => {
    await seedAdminUser(api, baseUrl, ADMIN_EMAIL, 'Roundtrip Admin', ADMIN_PASSWORD);
    await loginAsUser(api, baseUrl, ADMIN_EMAIL, ADMIN_PASSWORD);

    const wi = await api.post(API.workItems, { data: { title: 'Roundtrip-Before' } });
    expect(wi.status(), 'POST Roundtrip-Before').toBe(201);

    const entry = await api.post(API.diaryEntries, {
      data: {
        entryType: 'general_note',
        entryDate: '2026-01-15',
        body: 'Roundtrip diary entry',
        title: 'Roundtrip diary',
      },
    });
    expect(entry.ok(), 'POST diary entry').toBeTruthy();
    const entryId = ((await entry.json()) as { id: string }).id;

    const upload = await api.post('/api/photos', {
      multipart: {
        file: { name: 'test-photo.png', mimeType: 'image/png', buffer: TEST_PHOTO_PNG },
        entityType: 'diary_entry',
        entityId: entryId,
      },
    });
    expect(upload.ok(), 'POST /api/photos').toBeTruthy();
    photoId = ((await upload.json()) as { photo: { id: string } }).photo.id;

    const served = await api.get(`/api/photos/${photoId}/file`);
    expect(served.status(), 'GET photo file before backup').toBe(200);
    servedPhotoBytes = await served.body();
    expect(servedPhotoBytes.length).toBeGreaterThan(0);
  });

  test('creates a backup, then mutates data after it', async () => {
    const backup = await api.post(API.backups);
    expect(backup.status(), 'POST /api/backups').toBe(201);
    backupFilename = ((await backup.json()) as { backup: { filename: string } }).backup.filename;
    expect(backupFilename).toBeTruthy();

    const after = await api.post(API.workItems, { data: { title: 'Roundtrip-After' } });
    expect(after.status(), 'POST Roundtrip-After').toBe(201);
    expect(await listWorkItemTitles(api)).toContain('Roundtrip-After');
  });

  test('restore returns 202 and the process exits with code 0', async () => {
    const restore = await api.post(`${API.backups}/${encodeURIComponent(backupFilename)}/restore`);
    expect(restore.status(), 'POST restore').toBe(202);

    const client = await getContainerRuntimeClient();
    const dockerContainer = client.container.getById(container.getId());

    await expect
      .poll(async () => (await dockerContainer.inspect()).State.Running, {
        timeout: POLL_TIMEOUT_MS,
        message: 'container should exit after restore',
      })
      .toBe(false);

    const state = (await dockerContainer.inspect()).State;
    // 0 = successful swap; a failed swap rolls back and exits 1.
    expect(state.ExitCode).toBe(0);
  });

  test('after restart, restored data is present and post-backup data is gone', async () => {
    await api.dispose();
    await container.restart();

    // The mapped host port can change across a restart.
    baseUrl = `http://localhost:${container.getMappedPort(3000)}`;
    api = await playwrightRequest.newContext({ baseURL: baseUrl });

    await expect
      .poll(async () => (await api.get('/api/health/ready')).status(), {
        timeout: POLL_TIMEOUT_MS,
        message: 'app should become ready after restart',
      })
      .toBe(200);

    await loginAsUser(api, baseUrl, ADMIN_EMAIL, ADMIN_PASSWORD);

    const titles = await listWorkItemTitles(api);
    expect(titles).toContain('Roundtrip-Before');
    expect(titles).not.toContain('Roundtrip-After');

    const photo = await api.get(`/api/photos/${photoId}/file`);
    expect(photo.status(), 'GET photo file').toBe(200);
    expect(Buffer.compare(await photo.body(), servedPhotoBytes)).toBe(0);
  });
});
