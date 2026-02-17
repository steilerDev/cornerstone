import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as dependencyService from './dependencyService.js';
import { NotFoundError, ValidationError, ConflictError } from '../errors/AppError.js';
import type { CreateDependencyRequest } from '@cornerstone/shared';

describe('Dependency Service', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  /**
   * Creates a fresh in-memory database with migrations applied.
   */
  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  /**
   * Helper: Create a test user
   */
  function createTestUser(email: string, displayName: string, role: 'admin' | 'member' = 'member') {
    const now = new Date().toISOString();
    const userId = `user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    db.insert(schema.users)
      .values({
        id: userId,
        email,
        displayName,
        role,
        authProvider: 'local',
        passwordHash: '$scrypt$n=16384,r=8,p=1$c29tZXNhbHQ=$c29tZWhhc2g=',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return userId;
  }

  /**
   * Helper: Create a test work item
   */
  function createTestWorkItem(userId: string, title: string) {
    const now = new Date().toISOString();
    const workItemId = `work-item-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    db.insert(schema.workItems)
      .values({
        id: workItemId,
        title,
        status: 'not_started',
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return workItemId;
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('createDependency', () => {
    it('should create a dependency successfully', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      const request: CreateDependencyRequest = {
        predecessorId: workItemA,
        dependencyType: 'finish_to_start',
      };

      const result = dependencyService.createDependency(db, workItemB, request);

      expect(result).toEqual({
        predecessorId: workItemA,
        successorId: workItemB,
        dependencyType: 'finish_to_start',
      });
    });

    it('should create a dependency with default type (finish_to_start)', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      const request: CreateDependencyRequest = {
        predecessorId: workItemA,
        // dependencyType omitted, should default to 'finish_to_start'
      };

      const result = dependencyService.createDependency(db, workItemB, request);

      expect(result.dependencyType).toBe('finish_to_start');
    });

    it('should throw NotFoundError when successor work item does not exist', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemA = createTestWorkItem(userId, 'Work Item A');

      const request: CreateDependencyRequest = {
        predecessorId: workItemA,
      };

      expect(() => dependencyService.createDependency(db, 'nonexistent-id', request)).toThrow(
        NotFoundError,
      );
      expect(() => dependencyService.createDependency(db, 'nonexistent-id', request)).toThrow(
        'Successor work item not found',
      );
    });

    it('should throw NotFoundError when predecessor work item does not exist', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      const request: CreateDependencyRequest = {
        predecessorId: 'nonexistent-id',
      };

      expect(() => dependencyService.createDependency(db, workItemB, request)).toThrow(
        NotFoundError,
      );
      expect(() => dependencyService.createDependency(db, workItemB, request)).toThrow(
        'Predecessor work item not found',
      );
    });

    it('should throw ValidationError when work item depends on itself (self-reference)', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = createTestWorkItem(userId, 'Work Item');

      const request: CreateDependencyRequest = {
        predecessorId: workItem,
      };

      expect(() => dependencyService.createDependency(db, workItem, request)).toThrow(
        ValidationError,
      );
      expect(() => dependencyService.createDependency(db, workItem, request)).toThrow(
        'A work item cannot depend on itself',
      );
    });

    it('should throw ConflictError with DUPLICATE_DEPENDENCY when dependency already exists', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      const request: CreateDependencyRequest = {
        predecessorId: workItemA,
      };

      // Create dependency first time (should succeed)
      dependencyService.createDependency(db, workItemB, request);

      // Try to create same dependency again (should fail)
      expect(() => dependencyService.createDependency(db, workItemB, request)).toThrow(
        ConflictError,
      );
      expect(() => dependencyService.createDependency(db, workItemB, request)).toThrow(
        'Dependency already exists',
      );

      // Verify it's a ConflictError with DUPLICATE_DEPENDENCY code
      try {
        dependencyService.createDependency(db, workItemB, request);
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictError);
        if (error instanceof ConflictError) {
          expect(error.details?.code).toBe('DUPLICATE_DEPENDENCY');
        }
      }
    });

    it('should detect direct circular dependency (A→B, try B→A)', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      // Create A→B dependency
      dependencyService.createDependency(db, workItemB, { predecessorId: workItemA });

      // Try to create B→A dependency (should fail with circular dependency)
      expect(() =>
        dependencyService.createDependency(db, workItemA, { predecessorId: workItemB }),
      ).toThrow(ConflictError);
      expect(() =>
        dependencyService.createDependency(db, workItemA, { predecessorId: workItemB }),
      ).toThrow('Circular dependency detected');

      // Verify it's a ConflictError with CIRCULAR_DEPENDENCY code
      try {
        dependencyService.createDependency(db, workItemA, { predecessorId: workItemB });
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictError);
        if (error instanceof ConflictError) {
          expect(error.details?.code).toBe('CIRCULAR_DEPENDENCY');
          expect(error.details?.cyclePath).toBeDefined();
        }
      }
    });

    it('should detect indirect circular dependency (A→B→C, try C→A)', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');
      const workItemC = createTestWorkItem(userId, 'Work Item C');

      // Create chain: A→B→C
      dependencyService.createDependency(db, workItemB, { predecessorId: workItemA });
      dependencyService.createDependency(db, workItemC, { predecessorId: workItemB });

      // Try to create C→A dependency (should fail with circular dependency)
      expect(() =>
        dependencyService.createDependency(db, workItemA, { predecessorId: workItemC }),
      ).toThrow(ConflictError);
      expect(() =>
        dependencyService.createDependency(db, workItemA, { predecessorId: workItemC }),
      ).toThrow('Circular dependency detected');
    });

    it('should detect longer chain circular dependency (A→B→C→D, try D→A)', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');
      const workItemC = createTestWorkItem(userId, 'Work Item C');
      const workItemD = createTestWorkItem(userId, 'Work Item D');

      // Create chain: A→B→C→D
      dependencyService.createDependency(db, workItemB, { predecessorId: workItemA });
      dependencyService.createDependency(db, workItemC, { predecessorId: workItemB });
      dependencyService.createDependency(db, workItemD, { predecessorId: workItemC });

      // Try to create D→A dependency (should fail with circular dependency)
      expect(() =>
        dependencyService.createDependency(db, workItemA, { predecessorId: workItemD }),
      ).toThrow(ConflictError);
      expect(() =>
        dependencyService.createDependency(db, workItemA, { predecessorId: workItemD }),
      ).toThrow('Circular dependency detected');
    });

    it('should not produce false positives for valid DAG structures', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');
      const workItemC = createTestWorkItem(userId, 'Work Item C');
      const workItemD = createTestWorkItem(userId, 'Work Item D');

      // Create a diamond DAG: A→B, A→C, B→D, C→D
      dependencyService.createDependency(db, workItemB, { predecessorId: workItemA });
      dependencyService.createDependency(db, workItemC, { predecessorId: workItemA });
      dependencyService.createDependency(db, workItemD, { predecessorId: workItemB });
      dependencyService.createDependency(db, workItemD, { predecessorId: workItemC });

      // All dependencies should be created successfully (no cycles)
      // Verify by checking that all dependencies exist
      const dependencies = dependencyService.getDependencies(db, workItemD);
      expect(dependencies.predecessors).toHaveLength(2);
    });

    it('should support all four dependency types', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');
      const workItemC = createTestWorkItem(userId, 'Work Item C');
      const workItemD = createTestWorkItem(userId, 'Work Item D');
      const workItemE = createTestWorkItem(userId, 'Work Item E');

      // Test all four dependency types
      const result1 = dependencyService.createDependency(db, workItemB, {
        predecessorId: workItemA,
        dependencyType: 'finish_to_start',
      });
      expect(result1.dependencyType).toBe('finish_to_start');

      const result2 = dependencyService.createDependency(db, workItemC, {
        predecessorId: workItemA,
        dependencyType: 'start_to_start',
      });
      expect(result2.dependencyType).toBe('start_to_start');

      const result3 = dependencyService.createDependency(db, workItemD, {
        predecessorId: workItemA,
        dependencyType: 'finish_to_finish',
      });
      expect(result3.dependencyType).toBe('finish_to_finish');

      const result4 = dependencyService.createDependency(db, workItemE, {
        predecessorId: workItemA,
        dependencyType: 'start_to_finish',
      });
      expect(result4.dependencyType).toBe('start_to_finish');
    });
  });

  describe('getDependencies', () => {
    it('should return predecessors and successors for a work item', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');
      const workItemC = createTestWorkItem(userId, 'Work Item C');

      // Create: A→B, B→C
      // So B has predecessor A and successor C
      dependencyService.createDependency(db, workItemB, { predecessorId: workItemA });
      dependencyService.createDependency(db, workItemC, { predecessorId: workItemB });

      const dependencies = dependencyService.getDependencies(db, workItemB);

      expect(dependencies.predecessors).toHaveLength(1);
      expect(dependencies.predecessors[0].workItem.id).toBe(workItemA);
      expect(dependencies.predecessors[0].workItem.title).toBe('Work Item A');
      expect(dependencies.predecessors[0].dependencyType).toBe('finish_to_start');

      expect(dependencies.successors).toHaveLength(1);
      expect(dependencies.successors[0].workItem.id).toBe(workItemC);
      expect(dependencies.successors[0].workItem.title).toBe('Work Item C');
      expect(dependencies.successors[0].dependencyType).toBe('finish_to_start');
    });

    it('should return empty arrays when work item has no dependencies', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = createTestWorkItem(userId, 'Work Item');

      const dependencies = dependencyService.getDependencies(db, workItem);

      expect(dependencies.predecessors).toEqual([]);
      expect(dependencies.successors).toEqual([]);
    });

    it('should throw NotFoundError when work item does not exist', () => {
      expect(() => dependencyService.getDependencies(db, 'nonexistent-id')).toThrow(NotFoundError);
      expect(() => dependencyService.getDependencies(db, 'nonexistent-id')).toThrow(
        'Work item not found',
      );
    });

    it('should return multiple predecessors and successors', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');
      const workItemC = createTestWorkItem(userId, 'Work Item C');
      const workItemD = createTestWorkItem(userId, 'Work Item D');
      const workItemE = createTestWorkItem(userId, 'Work Item E');

      // Create: A→C, B→C, C→D, C→E
      // So C has predecessors A and B, and successors D and E
      dependencyService.createDependency(db, workItemC, { predecessorId: workItemA });
      dependencyService.createDependency(db, workItemC, { predecessorId: workItemB });
      dependencyService.createDependency(db, workItemD, { predecessorId: workItemC });
      dependencyService.createDependency(db, workItemE, { predecessorId: workItemC });

      const dependencies = dependencyService.getDependencies(db, workItemC);

      expect(dependencies.predecessors).toHaveLength(2);
      expect(dependencies.successors).toHaveLength(2);

      const predecessorIds = dependencies.predecessors.map((d) => d.workItem.id);
      expect(predecessorIds).toContain(workItemA);
      expect(predecessorIds).toContain(workItemB);

      const successorIds = dependencies.successors.map((d) => d.workItem.id);
      expect(successorIds).toContain(workItemD);
      expect(successorIds).toContain(workItemE);
    });
  });

  describe('deleteDependency', () => {
    it('should delete a dependency successfully', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      // Create dependency
      dependencyService.createDependency(db, workItemB, { predecessorId: workItemA });

      // Verify it exists
      const dependenciesBefore = dependencyService.getDependencies(db, workItemB);
      expect(dependenciesBefore.predecessors).toHaveLength(1);

      // Delete dependency
      dependencyService.deleteDependency(db, workItemB, workItemA);

      // Verify it no longer exists
      const dependenciesAfter = dependencyService.getDependencies(db, workItemB);
      expect(dependenciesAfter.predecessors).toHaveLength(0);
    });

    it('should throw NotFoundError when dependency does not exist', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      // Try to delete non-existent dependency
      expect(() => dependencyService.deleteDependency(db, workItemB, workItemA)).toThrow(
        NotFoundError,
      );
      expect(() => dependencyService.deleteDependency(db, workItemB, workItemA)).toThrow(
        'Dependency not found',
      );
    });

    it('should only delete the specified dependency', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');
      const workItemC = createTestWorkItem(userId, 'Work Item C');

      // Create: A→B, C→B
      dependencyService.createDependency(db, workItemB, { predecessorId: workItemA });
      dependencyService.createDependency(db, workItemB, { predecessorId: workItemC });

      // Delete A→B dependency
      dependencyService.deleteDependency(db, workItemB, workItemA);

      // Verify C→B still exists
      const dependencies = dependencyService.getDependencies(db, workItemB);
      expect(dependencies.predecessors).toHaveLength(1);
      expect(dependencies.predecessors[0].workItem.id).toBe(workItemC);
    });
  });
});
