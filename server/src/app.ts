import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import fastifyCompress from '@fastify/compress';
import fastifyCookie from '@fastify/cookie';
import { sql } from 'drizzle-orm';
import type { ApiErrorResponse } from '@cornerstone/shared';
import configPlugin from './plugins/config.js';
import dbPlugin from './plugins/db.js';
import errorHandlerPlugin from './plugins/errorHandler.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './routes/auth.js';
import oidcRoutes from './routes/oidc.js';
import userRoutes from './routes/users.js';
import workItemRoutes from './routes/workItems.js';
import tagRoutes from './routes/tags.js';
import noteRoutes from './routes/notes.js';
import subtaskRoutes from './routes/subtasks.js';
import dependencyRoutes from './routes/dependencies.js';
import budgetCategoryRoutes from './routes/budgetCategories.js';
import budgetSourceRoutes from './routes/budgetSources.js';
import vendorRoutes from './routes/vendors.js';
import invoiceRoutes from './routes/invoices.js';
import standaloneInvoiceRoutes from './routes/standaloneInvoices.js';
import subsidyProgramRoutes from './routes/subsidyPrograms.js';
import workItemVendorRoutes from './routes/workItemVendors.js';
import workItemSubsidyRoutes from './routes/workItemSubsidies.js';
import workItemBudgetRoutes from './routes/workItemBudgets.js';
import budgetOverviewRoutes from './routes/budgetOverview.js';
import milestoneRoutes from './routes/milestones.js';
import { hashPassword, verifyPassword } from './services/userService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
    trustProxy: process.env.TRUST_PROXY === 'true',
  });

  // Configuration (must be first)
  await app.register(configPlugin);

  // Error handler (after config, before routes)
  await app.register(errorHandlerPlugin);

  // Compression (gzip/deflate/brotli)
  await app.register(fastifyCompress);

  // Cookie parsing (required for session management)
  await app.register(fastifyCookie);

  // Database connection & migrations
  await app.register(dbPlugin);

  // Authentication & session management (after db, before routes)
  await app.register(authPlugin);

  // Auth routes
  await app.register(authRoutes, { prefix: '/api/auth' });

  // OIDC routes
  await app.register(oidcRoutes, { prefix: '/api/auth/oidc' });

  // User profile routes
  await app.register(userRoutes, { prefix: '/api/users' });

  // Work item routes
  await app.register(workItemRoutes, { prefix: '/api/work-items' });

  // Tag routes
  await app.register(tagRoutes, { prefix: '/api/tags' });

  // Note routes (nested under work items)
  await app.register(noteRoutes, { prefix: '/api/work-items/:workItemId/notes' });

  // Subtask routes (nested under work items)
  await app.register(subtaskRoutes, { prefix: '/api/work-items/:workItemId/subtasks' });

  // Dependency routes (nested under work items)
  await app.register(dependencyRoutes, { prefix: '/api/work-items/:workItemId/dependencies' });

  // Budget category routes
  await app.register(budgetCategoryRoutes, { prefix: '/api/budget-categories' });

  // Budget source routes
  await app.register(budgetSourceRoutes, { prefix: '/api/budget-sources' });

  // Vendor/contractor routes
  await app.register(vendorRoutes, { prefix: '/api/vendors' });

  // Invoice routes (nested under vendors)
  await app.register(invoiceRoutes, { prefix: '/api/vendors/:vendorId/invoices' });

  // Standalone invoice routes (cross-vendor)
  await app.register(standaloneInvoiceRoutes, { prefix: '/api/invoices' });

  // Subsidy program routes
  await app.register(subsidyProgramRoutes, { prefix: '/api/subsidy-programs' });

  // Work item vendor linking routes (nested under work items)
  await app.register(workItemVendorRoutes, { prefix: '/api/work-items/:workItemId/vendors' });

  // Work item subsidy linking routes (nested under work items)
  await app.register(workItemSubsidyRoutes, { prefix: '/api/work-items/:workItemId/subsidies' });

  // Work item budget line routes (nested under work items)
  await app.register(workItemBudgetRoutes, { prefix: '/api/work-items/:workItemId/budgets' });

  // Budget overview (aggregation dashboard endpoint)
  await app.register(budgetOverviewRoutes, { prefix: '/api/budget' });

  // Milestone routes (EPIC-06: Timeline, Gantt Chart & Dependency Management)
  await app.register(milestoneRoutes, { prefix: '/api/milestones' });

  // Health check endpoint (liveness)
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Readiness probe — verifies critical runtime components
  app.get('/api/health/ready', async () => {
    // Verify database is accessible
    app.db.run(sql`SELECT 1`);

    // Verify password hashing round-trip
    const hash = await hashPassword('healthcheck');
    const valid = await verifyPassword(hash, 'healthcheck');
    if (!valid) throw new Error('Password hash verification failed');

    return { status: 'ready', timestamp: new Date().toISOString() };
  });

  // Serve the client build in production
  const clientDistPath = join(__dirname, '../../client/dist');
  if (existsSync(join(clientDistPath, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: clientDistPath,
      prefix: '/',
      maxAge: 31536000 * 1000, // 1 year in milliseconds (for hashed assets)
      immutable: true,
      setHeaders: (res, filePath) => {
        // Override cache headers for HTML files (always revalidate)
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    });

    // SPA fallback: serve index.html for any non-API route
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        const response: ApiErrorResponse = {
          error: {
            code: 'ROUTE_NOT_FOUND',
            message: `Route ${request.method} ${request.url} not found`,
          },
        };
        return reply.status(404).send(response);
      }
      return reply.sendFile('index.html');
    });
  } else {
    // Development: no static files, just API
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        const response: ApiErrorResponse = {
          error: {
            code: 'ROUTE_NOT_FOUND',
            message: `Route ${request.method} ${request.url} not found`,
          },
        };
        return reply.status(404).send(response);
      }
      const response: ApiErrorResponse = {
        error: {
          code: 'NOT_FOUND',
          message: 'Client assets not found. Run "npm run build -w client" first.',
        },
      };
      return reply.status(404).send(response);
    });
  }

  return app;
}
