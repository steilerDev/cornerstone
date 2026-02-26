import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ScheduleRequest } from '@cornerstone/shared';
import {
  UnauthorizedError,
  ValidationError,
  NotFoundError,
  CircularDependencyError,
} from '../errors/AppError.js';
import { workItems, workItemDependencies } from '../db/schema.js';
import { schedule } from '../services/schedulingEngine.js';
import type { SchedulingWorkItem, SchedulingDependency } from '../services/schedulingEngine.js';

// ─── JSON schema ─────────────────────────────────────────────────────────────

const scheduleBodySchema = {
  body: {
    type: 'object',
    required: ['mode'],
    properties: {
      mode: { type: 'string', enum: ['full', 'cascade'] },
      anchorWorkItemId: { type: ['string', 'null'], minLength: 1 },
    },
    additionalProperties: false,
  },
};

// ─── Route plugin ─────────────────────────────────────────────────────────────

export default async function scheduleRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/schedule
   * Run the CPM scheduling engine on all or a subset of work items.
   * Read-only: no database changes are made. The client applies accepted changes
   * via individual PATCH /api/work-items/:id calls.
   * Auth required: Yes
   */
  fastify.post<{ Body: ScheduleRequest }>(
    '/',
    { schema: scheduleBodySchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const { mode, anchorWorkItemId } = request.body;

      // Validate cascade mode requires an anchor
      if (mode === 'cascade' && !anchorWorkItemId) {
        throw new ValidationError('anchorWorkItemId is required when mode is "cascade"');
      }

      // In cascade mode, verify the anchor work item exists
      if (mode === 'cascade' && anchorWorkItemId) {
        const anchor = fastify.db
          .select({ id: workItems.id })
          .from(workItems)
          .where(eq(workItems.id, anchorWorkItemId))
          .get();
        if (!anchor) {
          throw new NotFoundError('Anchor work item not found');
        }
      }

      // Fetch all work items and dependencies
      const allWorkItems = fastify.db.select().from(workItems).all();
      const allDependencies = fastify.db.select().from(workItemDependencies).all();

      // Map to engine input shapes (only fields the engine needs)
      const engineWorkItems: SchedulingWorkItem[] = allWorkItems.map((wi) => ({
        id: wi.id,
        status: wi.status,
        startDate: wi.startDate,
        endDate: wi.endDate,
        actualStartDate: wi.actualStartDate,
        actualEndDate: wi.actualEndDate,
        durationDays: wi.durationDays,
        startAfter: wi.startAfter,
        startBefore: wi.startBefore,
      }));

      const engineDependencies: SchedulingDependency[] = allDependencies.map((dep) => ({
        predecessorId: dep.predecessorId,
        successorId: dep.successorId,
        dependencyType: dep.dependencyType,
        leadLagDays: dep.leadLagDays,
      }));

      // Compute today's date in YYYY-MM-DD (UTC) for the engine
      const today = new Date().toISOString().slice(0, 10);

      // Run the pure CPM scheduling engine
      const result = schedule({
        mode,
        anchorWorkItemId: anchorWorkItemId ?? undefined,
        workItems: engineWorkItems,
        dependencies: engineDependencies,
        today,
      });

      // Surface circular dependency as a 409 error
      if (result.cycleNodes && result.cycleNodes.length > 0) {
        throw new CircularDependencyError('The dependency graph contains a circular dependency', {
          cycle: result.cycleNodes,
        });
      }

      return reply.status(200).send({
        scheduledItems: result.scheduledItems,
        criticalPath: result.criticalPath,
        warnings: result.warnings,
      });
    },
  );
}
