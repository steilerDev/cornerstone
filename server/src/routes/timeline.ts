import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import { getTimeline } from '../services/timelineService.js';

// ─── Route plugin ─────────────────────────────────────────────────────────────

export default async function timelineRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/timeline
   * Returns an aggregated timeline view: work items with dates, all dependencies,
   * all milestones (with linked work item IDs), the critical path, and the date range.
   *
   * This endpoint is optimised for rendering the Gantt chart and calendar views.
   * No budget information is included.
   *
   * Auth required: Yes (both admin and member)
   */
  fastify.get('/', async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const timeline = getTimeline(fastify.db);
    return reply.status(200).send(timeline);
  });
}
