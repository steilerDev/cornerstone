import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type {
  SubsidyProgram,
  SubsidyProgramListResponse,
  SubsidyProgramResponse,
  ApiErrorResponse,
  CreateSubsidyProgramRequest,
} from '@cornerstone/shared';
import { subsidyPrograms, subsidyProgramCategories, workItems, workItemSubsidies, budgetCategories } from '../db/schema.js';

describe('Subsidy Program Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-subsidy-programs-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';

    app = await buildApp();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }

    process.env = originalEnv;

    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Helper: Create a user and return a session cookie.
   */
  async function createUserWithSession(
    email: string,
    displayName: string,
    password: string,
    role: 'admin' | 'member' = 'member',
  ): Promise<{ userId: string; cookie: string }> {
    const user = await userService.createLocalUser(app.db, email, displayName, password, role);
    const sessionToken = sessionService.createSession(app.db, user.id, 3600);
    return {
      userId: user.id,
      cookie: `cornerstone_session=${sessionToken}`,
    };
  }

  let programCounter = 0;

  /**
   * Helper: Insert a raw subsidy program directly into the DB for test setup.
   */
  function createTestProgram(options: {
    name: string;
    reductionType?: 'percentage' | 'fixed';
    reductionValue?: number;
    applicationStatus?: 'eligible' | 'applied' | 'approved' | 'received' | 'rejected';
    description?: string | null;
    eligibility?: string | null;
    applicationDeadline?: string | null;
    notes?: string | null;
    createdBy?: string | null;
  }) {
    const id = `prog-${Date.now()}-${programCounter++}`;
    const now = new Date().toISOString();

    app.db
      .insert(subsidyPrograms)
      .values({
        id,
        name: options.name,
        reductionType: options.reductionType ?? 'percentage',
        reductionValue: options.reductionValue ?? 10,
        applicationStatus: options.applicationStatus ?? 'eligible',
        description: options.description ?? null,
        eligibility: options.eligibility ?? null,
        applicationDeadline: options.applicationDeadline ?? null,
        notes: options.notes ?? null,
        createdBy: options.createdBy ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return { id, ...options, createdAt: now, updatedAt: now };
  }

  /**
   * Helper: Insert a budget category directly into the DB.
   */
  let categoryCounter = 0;

  function createTestCategory(name?: string): string {
    const id = `cat-${Date.now()}-${categoryCounter++}`;
    const now = new Date().toISOString();

    app.db
      .insert(budgetCategories)
      .values({
        id,
        name: name ?? `Category ${id}`,
        description: null,
        color: null,
        sortOrder: categoryCounter,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return id;
  }

  /**
   * Helper: Insert a work item and link it to a subsidy program.
   */
  function createTestWorkItemWithSubsidy(subsidyProgramId: string): string {
    const workItemId = `wi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();

    app.db
      .insert(workItems)
      .values({
        id: workItemId,
        title: 'Test Work Item',
        status: 'not_started',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    app.db
      .insert(workItemSubsidies)
      .values({ workItemId, subsidyProgramId })
      .run();

    return workItemId;
  }

  // ─── GET /api/subsidy-programs ─────────────────────────────────────────────

  describe('GET /api/subsidy-programs', () => {
    it('returns an empty list when no programs exist', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/subsidy-programs',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SubsidyProgramListResponse>();
      expect(body.subsidyPrograms).toEqual([]);
    });

    it('returns programs sorted by name ascending', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      createTestProgram({ name: 'Zeta Grant' });
      createTestProgram({ name: 'Alpha Subsidy' });
      createTestProgram({ name: 'Mid Program' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/subsidy-programs',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SubsidyProgramListResponse>();
      expect(body.subsidyPrograms[0].name).toBe('Alpha Subsidy');
      expect(body.subsidyPrograms[1].name).toBe('Mid Program');
      expect(body.subsidyPrograms[2].name).toBe('Zeta Grant');
    });

    it('returns all program fields including applicableCategories', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      createTestProgram({
        name: 'Full Program',
        reductionType: 'fixed',
        reductionValue: 5000,
        applicationStatus: 'applied',
        description: 'A full description',
        eligibility: 'Home owners',
        applicationDeadline: '2027-06-15',
        notes: 'Apply early',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/subsidy-programs',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SubsidyProgramListResponse>();
      const prog = body.subsidyPrograms[0];
      expect(prog.name).toBe('Full Program');
      expect(prog.reductionType).toBe('fixed');
      expect(prog.reductionValue).toBe(5000);
      expect(prog.applicationStatus).toBe('applied');
      expect(prog.description).toBe('A full description');
      expect(prog.eligibility).toBe('Home owners');
      expect(prog.applicationDeadline).toBe('2027-06-15');
      expect(prog.notes).toBe('Apply early');
      expect(prog.applicableCategories).toEqual([]);
    });

    it('returns applicable categories for programs', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const catId = createTestCategory('TestMatCat');
      const prog = createTestProgram({ name: 'With Category' });
      app.db
        .insert(subsidyProgramCategories)
        .values({ subsidyProgramId: prog.id, budgetCategoryId: catId })
        .run();

      const response = await app.inject({
        method: 'GET',
        url: '/api/subsidy-programs',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SubsidyProgramListResponse>();
      expect(body.subsidyPrograms[0].applicableCategories).toHaveLength(1);
      expect(body.subsidyPrograms[0].applicableCategories[0].name).toBe('TestMatCat');
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/subsidy-programs',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to list programs', async () => {
      const { cookie } = await createUserWithSession(
        'member@example.com',
        'Member User',
        'password',
        'member',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/subsidy-programs',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });

    it('allows admin user to list programs', async () => {
      const { cookie } = await createUserWithSession(
        'admin@example.com',
        'Admin User',
        'password',
        'admin',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/subsidy-programs',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── POST /api/subsidy-programs ────────────────────────────────────────────

  describe('POST /api/subsidy-programs', () => {
    it('creates a program with required fields only (201)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const requestBody: CreateSubsidyProgramRequest = {
        name: 'Energy Rebate',
        reductionType: 'percentage',
        reductionValue: 15,
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/subsidy-programs',
        headers: { cookie },
        payload: requestBody,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<SubsidyProgramResponse>();
      expect(body.subsidyProgram.id).toBeDefined();
      expect(body.subsidyProgram.name).toBe('Energy Rebate');
      expect(body.subsidyProgram.reductionType).toBe('percentage');
      expect(body.subsidyProgram.reductionValue).toBe(15);
      expect(body.subsidyProgram.applicationStatus).toBe('eligible');
      expect(body.subsidyProgram.description).toBeNull();
      expect(body.subsidyProgram.eligibility).toBeNull();
      expect(body.subsidyProgram.applicationDeadline).toBeNull();
      expect(body.subsidyProgram.notes).toBeNull();
      expect(body.subsidyProgram.applicableCategories).toEqual([]);
      expect(body.subsidyProgram.createdAt).toBeDefined();
      expect(body.subsidyProgram.updatedAt).toBeDefined();
    });

    it('creates a program with all optional fields (201)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const catId = createTestCategory('TestLaborCat');
      const requestBody: CreateSubsidyProgramRequest = {
        name: 'Full Program',
        reductionType: 'fixed',
        reductionValue: 3000,
        description: 'A government program',
        eligibility: 'Home owners only',
        applicationStatus: 'applied',
        applicationDeadline: '2027-12-01',
        notes: 'Important notes',
        categoryIds: [catId],
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/subsidy-programs',
        headers: { cookie },
        payload: requestBody,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<SubsidyProgramResponse>();
      expect(body.subsidyProgram.name).toBe('Full Program');
      expect(body.subsidyProgram.reductionType).toBe('fixed');
      expect(body.subsidyProgram.reductionValue).toBe(3000);
      expect(body.subsidyProgram.description).toBe('A government program');
      expect(body.subsidyProgram.eligibility).toBe('Home owners only');
      expect(body.subsidyProgram.applicationStatus).toBe('applied');
      expect(body.subsidyProgram.applicationDeadline).toBe('2027-12-01');
      expect(body.subsidyProgram.notes).toBe('Important notes');
      expect(body.subsidyProgram.applicableCategories).toHaveLength(1);
    });

    it('links createdBy to the authenticated user', async () => {
      const { cookie, userId } = await createUserWithSession(
        'creator@example.com',
        'Creator User',
        'password',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/subsidy-programs',
        headers: { cookie },
        payload: {
          name: 'User Program',
          reductionType: 'percentage',
          reductionValue: 10,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<SubsidyProgramResponse>();
      expect(body.subsidyProgram.createdBy).not.toBeNull();
      expect(body.subsidyProgram.createdBy?.id).toBe(userId);
    });

    it('trims whitespace from name on creation', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/subsidy-programs',
        headers: { cookie },
        payload: {
          name: '  Trimmed Name  ',
          reductionType: 'percentage',
          reductionValue: 5,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<SubsidyProgramResponse>();
      expect(body.subsidyProgram.name).toBe('Trimmed Name');
    });

    it('creates program with categoryIds as empty array', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/subsidy-programs',
        headers: { cookie },
        payload: {
          name: 'No Categories',
          reductionType: 'percentage',
          reductionValue: 10,
          categoryIds: [],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<SubsidyProgramResponse>();
      expect(body.subsidyProgram.applicableCategories).toEqual([]);
    });

    it('creates program with multiple category IDs', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const catId1 = createTestCategory('TestLabor2');
      const catId2 = createTestCategory('TestMaterials2');

      const response = await app.inject({
        method: 'POST',
        url: '/api/subsidy-programs',
        headers: { cookie },
        payload: {
          name: 'Multi Category Program',
          reductionType: 'percentage',
          reductionValue: 20,
          categoryIds: [catId1, catId2],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<SubsidyProgramResponse>();
      expect(body.subsidyProgram.applicableCategories).toHaveLength(2);
    });

    it('returns 400 VALIDATION_ERROR for missing name', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/subsidy-programs',
        headers: { cookie },
        payload: { reductionType: 'percentage', reductionValue: 10 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for missing reductionType', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/subsidy-programs',
        headers: { cookie },
        payload: { name: 'No Type', reductionValue: 10 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for missing reductionValue', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/subsidy-programs',
        headers: { cookie },
        payload: { name: 'No Value', reductionType: 'percentage' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for reductionValue of zero', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/subsidy-programs',
        headers: { cookie },
        payload: { name: 'Zero Value', reductionType: 'percentage', reductionValue: 0 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for invalid reductionType', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/subsidy-programs',
        headers: { cookie },
        payload: { name: 'Bad Type', reductionType: 'invalid', reductionValue: 10 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for invalid applicationStatus', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/subsidy-programs',
        headers: { cookie },
        payload: {
          name: 'Bad Status',
          reductionType: 'percentage',
          reductionValue: 10,
          applicationStatus: 'unknown_status',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for percentage reductionValue > 100', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/subsidy-programs',
        headers: { cookie },
        payload: { name: 'Over 100', reductionType: 'percentage', reductionValue: 101 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for unknown categoryIds', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/subsidy-programs',
        headers: { cookie },
        payload: {
          name: 'Bad Category',
          reductionType: 'percentage',
          reductionValue: 10,
          categoryIds: ['non-existent-cat-id'],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('strips unknown properties (additionalProperties: false)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/subsidy-programs',
        headers: { cookie },
        payload: {
          name: 'Stripped Program',
          reductionType: 'percentage',
          reductionValue: 10,
          unknownField: 'should be stripped',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<SubsidyProgramResponse>();
      expect(body.subsidyProgram.name).toBe('Stripped Program');
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/subsidy-programs',
        payload: { name: 'Test', reductionType: 'percentage', reductionValue: 10 },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to create a program', async () => {
      const { cookie } = await createUserWithSession(
        'member@example.com',
        'Member User',
        'password',
        'member',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/subsidy-programs',
        headers: { cookie },
        payload: { name: 'Member Program', reductionType: 'percentage', reductionValue: 5 },
      });

      expect(response.statusCode).toBe(201);
    });
  });

  // ─── GET /api/subsidy-programs/:id ─────────────────────────────────────────

  describe('GET /api/subsidy-programs/:id', () => {
    it('returns a program by ID', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const prog = createTestProgram({ name: 'Get By ID', reductionType: 'percentage', reductionValue: 20 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/subsidy-programs/${prog.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SubsidyProgramResponse>();
      expect(body.subsidyProgram.id).toBe(prog.id);
      expect(body.subsidyProgram.name).toBe('Get By ID');
      expect(body.subsidyProgram.reductionType).toBe('percentage');
      expect(body.subsidyProgram.reductionValue).toBe(20);
    });

    it('returns full program detail with applicableCategories', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const catId = createTestCategory('TestDesign');
      const prog = createTestProgram({ name: 'Full Detail', reductionType: 'fixed', reductionValue: 2500 });
      app.db
        .insert(subsidyProgramCategories)
        .values({ subsidyProgramId: prog.id, budgetCategoryId: catId })
        .run();

      const response = await app.inject({
        method: 'GET',
        url: `/api/subsidy-programs/${prog.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SubsidyProgramResponse>();
      expect(body.subsidyProgram.applicableCategories).toHaveLength(1);
      expect(body.subsidyProgram.applicableCategories[0].name).toBe('TestDesign');
    });

    it('returns 404 NOT_FOUND for non-existent program', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/subsidy-programs/non-existent-id',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/subsidy-programs/some-id',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to get a program by ID', async () => {
      const { cookie } = await createUserWithSession(
        'member@example.com',
        'Member',
        'password',
        'member',
      );
      const prog = createTestProgram({ name: 'Member Get' });

      const response = await app.inject({
        method: 'GET',
        url: `/api/subsidy-programs/${prog.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── PATCH /api/subsidy-programs/:id ───────────────────────────────────────

  describe('PATCH /api/subsidy-programs/:id', () => {
    it('updates the name of an existing program', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const prog = createTestProgram({ name: 'Old Name' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/subsidy-programs/${prog.id}`,
        headers: { cookie },
        payload: { name: 'New Name' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SubsidyProgramResponse>();
      expect(body.subsidyProgram.id).toBe(prog.id);
      expect(body.subsidyProgram.name).toBe('New Name');
    });

    it('updates reductionType only (partial update)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const prog = createTestProgram({
        name: 'Type Patch',
        reductionType: 'percentage',
        reductionValue: 10,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/subsidy-programs/${prog.id}`,
        headers: { cookie },
        payload: { reductionType: 'fixed' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SubsidyProgramResponse>();
      expect(body.subsidyProgram.reductionType).toBe('fixed');
      expect(body.subsidyProgram.name).toBe('Type Patch'); // unchanged
    });

    it('updates reductionValue only', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const prog = createTestProgram({ name: 'Value Patch', reductionType: 'percentage', reductionValue: 5 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/subsidy-programs/${prog.id}`,
        headers: { cookie },
        payload: { reductionValue: 25 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SubsidyProgramResponse>();
      expect(body.subsidyProgram.reductionValue).toBe(25);
    });

    it('updates applicationStatus only', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const prog = createTestProgram({ name: 'Status Patch', applicationStatus: 'eligible' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/subsidy-programs/${prog.id}`,
        headers: { cookie },
        payload: { applicationStatus: 'approved' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SubsidyProgramResponse>();
      expect(body.subsidyProgram.applicationStatus).toBe('approved');
    });

    it('replaces category links when categoryIds provided', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const catA = createTestCategory('Old Cat');
      const catB = createTestCategory('New Cat');
      const prog = createTestProgram({ name: 'Replace Cats' });
      app.db
        .insert(subsidyProgramCategories)
        .values({ subsidyProgramId: prog.id, budgetCategoryId: catA })
        .run();

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/subsidy-programs/${prog.id}`,
        headers: { cookie },
        payload: { categoryIds: [catB] },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SubsidyProgramResponse>();
      expect(body.subsidyProgram.applicableCategories).toHaveLength(1);
      expect(body.subsidyProgram.applicableCategories[0].id).toBe(catB);
    });

    it('clears all category links when categoryIds is empty array', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const catId = createTestCategory('Cat To Remove');
      const prog = createTestProgram({ name: 'Clear Cats' });
      app.db
        .insert(subsidyProgramCategories)
        .values({ subsidyProgramId: prog.id, budgetCategoryId: catId })
        .run();

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/subsidy-programs/${prog.id}`,
        headers: { cookie },
        payload: { categoryIds: [] },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SubsidyProgramResponse>();
      expect(body.subsidyProgram.applicableCategories).toEqual([]);
    });

    it('updates all fields at once', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const catId = createTestCategory('All Cat');
      const prog = createTestProgram({ name: 'All Fields', reductionType: 'percentage', reductionValue: 5 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/subsidy-programs/${prog.id}`,
        headers: { cookie },
        payload: {
          name: 'All Updated',
          reductionType: 'fixed',
          reductionValue: 7000,
          description: 'Updated desc',
          eligibility: 'Updated eligibility',
          applicationStatus: 'received',
          applicationDeadline: '2029-01-01',
          notes: 'Updated notes',
          categoryIds: [catId],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SubsidyProgramResponse>();
      expect(body.subsidyProgram.name).toBe('All Updated');
      expect(body.subsidyProgram.reductionType).toBe('fixed');
      expect(body.subsidyProgram.reductionValue).toBe(7000);
      expect(body.subsidyProgram.description).toBe('Updated desc');
      expect(body.subsidyProgram.applicationStatus).toBe('received');
      expect(body.subsidyProgram.applicableCategories).toHaveLength(1);
    });

    it('returns 404 NOT_FOUND for non-existent program', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/subsidy-programs/non-existent-id',
        headers: { cookie },
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 VALIDATION_ERROR for empty payload (minProperties constraint)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const prog = createTestProgram({ name: 'Valid Program' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/subsidy-programs/${prog.id}`,
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for empty name in PATCH', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const prog = createTestProgram({ name: 'Valid' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/subsidy-programs/${prog.id}`,
        headers: { cookie },
        payload: { name: '' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for reductionValue of zero in PATCH', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const prog = createTestProgram({ name: 'Valid' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/subsidy-programs/${prog.id}`,
        headers: { cookie },
        payload: { reductionValue: 0 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for invalid reductionType in PATCH', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const prog = createTestProgram({ name: 'Valid' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/subsidy-programs/${prog.id}`,
        headers: { cookie },
        payload: { reductionType: 'invalid' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for invalid applicationStatus in PATCH', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const prog = createTestProgram({ name: 'Valid' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/subsidy-programs/${prog.id}`,
        headers: { cookie },
        payload: { applicationStatus: 'unknown_status' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for unknown categoryIds in PATCH', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const prog = createTestProgram({ name: 'Valid' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/subsidy-programs/${prog.id}`,
        headers: { cookie },
        payload: { categoryIds: ['non-existent-cat-id'] },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/subsidy-programs/some-id',
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to update a program', async () => {
      const { cookie } = await createUserWithSession(
        'member@example.com',
        'Member',
        'password',
        'member',
      );
      const prog = createTestProgram({ name: 'Member Update' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/subsidy-programs/${prog.id}`,
        headers: { cookie },
        payload: { name: 'Member Updated' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SubsidyProgramResponse>();
      expect(body.subsidyProgram.name).toBe('Member Updated');
    });
  });

  // ─── DELETE /api/subsidy-programs/:id ──────────────────────────────────────

  describe('DELETE /api/subsidy-programs/:id', () => {
    it('deletes an existing program successfully (204)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const prog = createTestProgram({ name: 'To Delete' });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/subsidy-programs/${prog.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
    });

    it('program is no longer returned in list after deletion', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const prog = createTestProgram({ name: 'Delete Me' });
      createTestProgram({ name: 'Keep Me' });

      await app.inject({
        method: 'DELETE',
        url: `/api/subsidy-programs/${prog.id}`,
        headers: { cookie },
      });

      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/subsidy-programs',
        headers: { cookie },
      });

      const body = listResponse.json<SubsidyProgramListResponse>();
      expect(body.subsidyPrograms.find((p: SubsidyProgram) => p.id === prog.id)).toBeUndefined();
      expect(body.subsidyPrograms.some((p: SubsidyProgram) => p.name === 'Keep Me')).toBe(true);
    });

    it('returns 404 NOT_FOUND for non-existent program', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/subsidy-programs/non-existent-id',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 SUBSIDY_PROGRAM_IN_USE when referenced by work items', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const prog = createTestProgram({ name: 'In Use Program' });
      createTestWorkItemWithSubsidy(prog.id);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/subsidy-programs/${prog.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('SUBSIDY_PROGRAM_IN_USE');
    });

    it('returns 409 with workItemCount in details', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const prog = createTestProgram({ name: 'In Use Program 2' });
      createTestWorkItemWithSubsidy(prog.id);
      createTestWorkItemWithSubsidy(prog.id);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/subsidy-programs/${prog.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.details?.workItemCount).toBe(2);
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/subsidy-programs/some-id',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to delete a program', async () => {
      const { cookie } = await createUserWithSession(
        'member@example.com',
        'Member',
        'password',
        'member',
      );
      const prog = createTestProgram({ name: 'Member Delete' });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/subsidy-programs/${prog.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });

    it('allows admin user to delete a program', async () => {
      const { cookie } = await createUserWithSession(
        'admin@example.com',
        'Admin',
        'password',
        'admin',
      );
      const prog = createTestProgram({ name: 'Admin Delete' });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/subsidy-programs/${prog.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });
  });
});
