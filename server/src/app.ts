import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import fastifyCompress from '@fastify/compress';
import fastifyCookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { sql } from 'drizzle-orm';
import type { ApiErrorResponse } from '@cornerstone/shared';
import configPlugin from './plugins/config.js';
import dbPlugin from './plugins/db.js';
import errorHandlerPlugin from './plugins/errorHandler.js';
import authPlugin from './plugins/auth.js';
import helmetPlugin from './plugins/helmetPlugin.js';
import rateLimitPlugin from './plugins/rateLimitPlugin.js';
import configRoutes from './routes/config.js';
import authRoutes from './routes/auth.js';
import oidcRoutes from './routes/oidc.js';
import userRoutes from './routes/users.js';
import workItemRoutes from './routes/workItems.js';
import noteRoutes from './routes/notes.js';
import subtaskRoutes from './routes/subtasks.js';
import dependencyRoutes from './routes/dependencies.js';
import budgetCategoryRoutes from './routes/budgetCategories.js';
import budgetSourceRoutes from './routes/budgetSources.js';
import vendorRoutes from './routes/vendors.js';
import invoiceRoutes from './routes/invoices.js';
import standaloneInvoiceRoutes from './routes/standaloneInvoices.js';
import invoiceBudgetLineRoutes from './routes/invoiceBudgetLines.js';
import subsidyProgramRoutes from './routes/subsidyPrograms.js';
import workItemVendorRoutes from './routes/workItemVendors.js';
import workItemSubsidyRoutes from './routes/workItemSubsidies.js';
import workItemSubsidyPaybackRoutes from './routes/workItemSubsidyPayback.js';
import workItemBudgetRoutes from './routes/workItemBudgets.js';
import budgetOverviewRoutes from './routes/budgetOverview.js';
import milestoneRoutes from './routes/milestones.js';
import workItemMilestoneRoutes from './routes/workItemMilestones.js';
import scheduleRoutes from './routes/schedule.js';
import timelineRoutes from './routes/timeline.js';
import paperlessRoutes from './routes/paperless.js';
import documentLinksRoutes from './routes/documentLinks.js';
import photoRoutes from './routes/photos.js';
import preferencesRoutes from './routes/preferences.js';
import householdItemCategoryRoutes from './routes/householdItemCategories.js';
import householdItemRoutes from './routes/householdItems.js';
import diaryRoutes from './routes/diary.js';
import householdItemBudgetRoutes from './routes/householdItemBudgets.js';
import householdItemSubsidyRoutes from './routes/householdItemSubsidies.js';
import householdItemSubsidyPaybackRoutes from './routes/householdItemSubsidyPayback.js';
import vendorContactRoutes from './routes/vendorContacts.js';
import davTokenRoutes from './routes/davTokens.js';
import davRoutes from './routes/dav.js';
import { hashPassword, verifyPassword } from './services/userService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
    trustProxy: process.env.TRUST_PROXY === 'true',
  });

  // Add custom HTTP methods for WebDAV (CalDAV/CardDAV)
  app.addHttpMethod('PROPFIND', { hasBody: true });
  app.addHttpMethod('REPORT', { hasBody: true });
  app.addHttpMethod('PROPPATCH', { hasBody: true });

  // Configuration (must be first)
  await app.register(configPlugin);

  // Error handler (after config, before routes)
  await app.register(errorHandlerPlugin);

  // Compression (gzip/deflate/brotli)
  await app.register(fastifyCompress);

  // Cookie parsing (required for session management)
  await app.register(fastifyCookie);

  // Multipart form data parsing (for file uploads)
  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB hard cap; actual limit enforced per config in route
    },
  });

  // XML content type parser for WebDAV (CalDAV/CardDAV PROPFIND/REPORT bodies)
  app.addContentTypeParser(
    ['application/xml', 'text/xml'],
    { parseAs: 'string' },
    async (_req: any, body: string) => body,
  );

  // Database connection & migrations
  await app.register(dbPlugin);

  // Authentication & session management (after db, before routes)
  await app.register(authPlugin);

  // Security headers (CSP, HSTS, X-Frame-Options, etc.)
  await app.register(helmetPlugin);

  // Rate limiting (global defaults, per-route overrides on auth endpoints)
  await app.register(rateLimitPlugin);

  // Config routes (public — no auth required)
  await app.register(configRoutes, { prefix: '/api/config' });

  // Auth routes
  await app.register(authRoutes, { prefix: '/api/auth' });

  // OIDC routes
  await app.register(oidcRoutes, { prefix: '/api/auth/oidc' });

  // User profile routes
  await app.register(userRoutes, { prefix: '/api/users' });

  // DAV token routes (nested under users)
  await app.register(davTokenRoutes, { prefix: '/api/users/me/dav' });

  // Work item routes
  await app.register(workItemRoutes, { prefix: '/api/work-items' });

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

  // Vendor contact routes (nested under vendors)
  await app.register(vendorContactRoutes, { prefix: '/api/vendors/:vendorId/contacts' });

  // Invoice routes (nested under vendors)
  await app.register(invoiceRoutes, { prefix: '/api/vendors/:vendorId/invoices' });

  // Standalone invoice routes (cross-vendor)
  await app.register(standaloneInvoiceRoutes, { prefix: '/api/invoices' });

  // Invoice budget line routes (nested under invoices)
  await app.register(invoiceBudgetLineRoutes, { prefix: '/api/invoices/:invoiceId/budget-lines' });

  // Subsidy program routes
  await app.register(subsidyProgramRoutes, { prefix: '/api/subsidy-programs' });

  // Work item vendor linking routes (nested under work items)
  await app.register(workItemVendorRoutes, { prefix: '/api/work-items/:workItemId/vendors' });

  // Work item subsidy linking routes (nested under work items)
  await app.register(workItemSubsidyRoutes, { prefix: '/api/work-items/:workItemId/subsidies' });

  // Work item subsidy payback (per-work-item expected payback calculation)
  await app.register(workItemSubsidyPaybackRoutes, {
    prefix: '/api/work-items/:workItemId/subsidy-payback',
  });

  // Work item budget line routes (nested under work items)
  await app.register(workItemBudgetRoutes, { prefix: '/api/work-items/:workItemId/budgets' });

  // Budget overview (aggregation dashboard endpoint)
  await app.register(budgetOverviewRoutes, { prefix: '/api/budget' });

  // Milestone routes (EPIC-06: Timeline, Gantt Chart & Dependency Management)
  await app.register(milestoneRoutes, { prefix: '/api/milestones' });

  // Work item milestone relationship routes (EPIC-06 UAT Fix 4: bidirectional milestone deps)
  await app.register(workItemMilestoneRoutes, {
    prefix: '/api/work-items/:workItemId/milestones',
  });

  // Schedule routes (EPIC-06: Scheduling Engine — CPM, Auto-Schedule, Conflict Detection)
  await app.register(scheduleRoutes, { prefix: '/api/schedule' });

  // Timeline routes (EPIC-06: Aggregated timeline data for Gantt chart)
  await app.register(timelineRoutes, { prefix: '/api/timeline' });

  // Paperless-ngx proxy routes (EPIC-08: Document Integration)
  await app.register(paperlessRoutes, { prefix: '/api/paperless' });

  // Document link routes (EPIC-08: Link Paperless-ngx documents to entities)
  await app.register(documentLinksRoutes, { prefix: '/api/document-links' });

  // Photo attachment routes (shared infrastructure for EPIC-13 and EPIC-16)
  await app.register(photoRoutes, { prefix: '/api/photos' });

  // User preferences routes (EPIC-09 Story #470: User Preferences Infrastructure)
  await app.register(preferencesRoutes, { prefix: '/api/users/me/preferences' });

  // Household item category routes (EPIC-09: Story #509 - Unified Tags & Categories Management)
  await app.register(householdItemCategoryRoutes, { prefix: '/api/household-item-categories' });

  // Household item routes (EPIC-04: Household Items & Furniture Management)
  await app.register(householdItemRoutes, { prefix: '/api/household-items' });

  // Household item budget line routes (EPIC-04: Household Items & Furniture Management)
  await app.register(householdItemBudgetRoutes, {
    prefix: '/api/household-items/:householdItemId/budgets',
  });

  // Household item subsidy linking routes (EPIC-04: Household Items & Furniture Management)
  await app.register(householdItemSubsidyRoutes, {
    prefix: '/api/household-items/:householdItemId/subsidies',
  });

  // Household item subsidy payback (per-household-item expected payback calculation)
  await app.register(householdItemSubsidyPaybackRoutes, {
    prefix: '/api/household-items/:householdItemId/subsidy-payback',
  });

  // DAV routes (CalDAV/CardDAV WebDAV server — replaces legacy /feeds)
  await app.register(davRoutes, { prefix: '/dav' });

  // Diary entry routes (EPIC-13: Construction Diary)
  await app.register(diaryRoutes, { prefix: '/api/diary-entries' });

  // Well-known redirects for CalDAV/CardDAV discovery
  app.get('/.well-known/caldav', (request, reply) => {
    return reply.status(301).redirect('/dav/');
  });

  app.get('/.well-known/carddav', (request, reply) => {
    return reply.status(301).redirect('/dav/');
  });

  app.propfind('/.well-known/caldav', (request, reply) => {
    return reply.status(301).redirect('/dav/');
  });

  app.propfind('/.well-known/carddav', (request, reply) => {
    return reply.status(301).redirect('/dav/');
  });

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
      if (request.url.startsWith('/api/') || request.url.startsWith('/feeds/')) {
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
