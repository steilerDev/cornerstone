/**
 * Defence-in-depth guards of the relation route files touched by #2236: without the auth plugin
 * a request that carries no user is answered 401 by each handler's own `request.user` guard.
 * The database plugin is registered because the deposit routes' vendor-scope preHandler reads it.
 * All ids are synthetic.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ApiErrorResponse } from '@cornerstone/shared';
import configPlugin from '../plugins/config.js';
import dbPlugin from '../plugins/db.js';
import errorHandlerPlugin from '../plugins/errorHandler.js';
import dependencyRoutes from './dependencies.js';
import householdItemRoutes from './householdItems.js';
import milestoneRoutes from './milestones.js';
import workItemMilestoneRoutes from './workItemMilestones.js';
import invoiceDepositRoutes from './invoiceDeposits.js';
import vendorContactRoutes from './vendorContacts.js';
import invoiceBudgetLineRoutes from './invoiceBudgetLines.js';
import workItemSubsidyRoutes from './workItemSubsidies.js';
import householdItemSubsidyRoutes from './householdItemSubsidies.js';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type Call = readonly [Method, string, Record<string, unknown>?];

interface RouteFile {
  name: string;
  plugin: FastifyPluginAsync;
  prefixes: string[];
  calls: Call[];
}

const FILES: RouteFile[] = [
  {
    name: 'dependencies.ts',
    plugin: dependencyRoutes,
    prefixes: ['/api/work-items/:workItemId/dependencies'],
    calls: [
      ['POST', '/api/work-items/wi-1/dependencies', { predecessorId: 'wi-2' }],
      ['GET', '/api/work-items/wi-1/dependencies'],
      ['PATCH', '/api/work-items/wi-1/dependencies/wi-2', { leadLagDays: 1 }],
      ['DELETE', '/api/work-items/wi-1/dependencies/wi-2'],
    ],
  },
  {
    name: 'householdItems.ts',
    plugin: householdItemRoutes,
    prefixes: ['/api/household-items'],
    calls: [
      ['POST', '/api/household-items', { name: 'Sofa', categoryId: 'hic-furniture' }],
      ['GET', '/api/household-items'],
      ['GET', '/api/household-items/hi-1'],
      ['PATCH', '/api/household-items/hi-1', { name: 'Table' }],
      ['DELETE', '/api/household-items/hi-1'],
      ['GET', '/api/household-items/hi-1/dependencies'],
      [
        'POST',
        '/api/household-items/hi-1/dependencies',
        { predecessorType: 'work_item', predecessorId: 'wi-1' },
      ],
      ['DELETE', '/api/household-items/hi-1/dependencies/work_item/wi-1'],
    ],
  },
  {
    name: 'milestones.ts',
    plugin: milestoneRoutes,
    prefixes: ['/api/milestones'],
    calls: [
      ['GET', '/api/milestones'],
      ['POST', '/api/milestones', { title: 'Roof complete', targetDate: '2026-04-01' }],
      ['GET', '/api/milestones/1'],
      ['PATCH', '/api/milestones/1', { title: 'Walls up' }],
      ['DELETE', '/api/milestones/1'],
      ['POST', '/api/milestones/1/work-items', { workItemId: 'wi-1' }],
      ['DELETE', '/api/milestones/1/work-items/wi-1'],
      ['POST', '/api/milestones/1/dependents/wi-1'],
      ['DELETE', '/api/milestones/1/dependents/wi-1'],
      ['GET', '/api/milestones/1/dependent-household-items'],
    ],
  },
  {
    name: 'workItemMilestones.ts',
    plugin: workItemMilestoneRoutes,
    prefixes: ['/api/work-items/:workItemId/milestones'],
    calls: [
      ['GET', '/api/work-items/wi-1/milestones'],
      ['POST', '/api/work-items/wi-1/milestones/required/1'],
      ['DELETE', '/api/work-items/wi-1/milestones/required/1'],
      ['POST', '/api/work-items/wi-1/milestones/linked/1'],
      ['DELETE', '/api/work-items/wi-1/milestones/linked/1'],
    ],
  },
  {
    name: 'invoiceDeposits.ts',
    plugin: invoiceDepositRoutes,
    prefixes: [
      '/api/vendors/:vendorId/invoices/:invoiceId/deposits',
      '/api/invoices/:invoiceId/deposits',
    ],
    calls: [
      ['GET', '/api/invoices/inv-1/deposits'],
      ['POST', '/api/invoices/inv-1/deposits', { amount: 10, dueDate: '2026-02-01' }],
      ['PATCH', '/api/invoices/inv-1/deposits/dep-1', { amount: 5 }],
      ['DELETE', '/api/invoices/inv-1/deposits/dep-1'],
      // Vendor-scoped twin: an unknown invoice passes the vendor-scope preHandler
      ['GET', '/api/vendors/v-1/invoices/inv-1/deposits'],
      ['DELETE', '/api/vendors/v-1/invoices/inv-1/deposits/dep-1'],
    ],
  },
  {
    name: 'vendorContacts.ts',
    plugin: vendorContactRoutes,
    prefixes: ['/api/vendors/:vendorId/contacts'],
    calls: [
      ['GET', '/api/vendors/v-1/contacts'],
      ['POST', '/api/vendors/v-1/contacts', { firstName: 'Pat' }],
      ['PATCH', '/api/vendors/v-1/contacts/c-1', { firstName: 'Sam' }],
      ['DELETE', '/api/vendors/v-1/contacts/c-1'],
    ],
  },
  {
    name: 'invoiceBudgetLines.ts',
    plugin: invoiceBudgetLineRoutes,
    prefixes: ['/api/invoices/:invoiceId/budget-lines'],
    calls: [
      ['GET', '/api/invoices/inv-1/budget-lines'],
      [
        'POST',
        '/api/invoices/inv-1/budget-lines',
        { workItemBudgetId: 'wib-1', itemizedAmount: 10 },
      ],
      ['PATCH', '/api/invoices/inv-1/budget-lines/ibl-1', { itemizedAmount: 5 }],
      ['DELETE', '/api/invoices/inv-1/budget-lines/ibl-1'],
    ],
  },
  {
    name: 'workItemSubsidies.ts',
    plugin: workItemSubsidyRoutes,
    prefixes: ['/api/work-items/:workItemId/subsidies'],
    calls: [
      ['GET', '/api/work-items/wi-1/subsidies'],
      ['POST', '/api/work-items/wi-1/subsidies', { subsidyProgramId: 'sp-1' }],
      ['DELETE', '/api/work-items/wi-1/subsidies/sp-1'],
    ],
  },
  {
    name: 'householdItemSubsidies.ts',
    plugin: householdItemSubsidyRoutes,
    prefixes: ['/api/household-items/:householdItemId/subsidies'],
    calls: [
      ['GET', '/api/household-items/hi-1/subsidies'],
      ['POST', '/api/household-items/hi-1/subsidies', { subsidyProgramId: 'sp-1' }],
      ['DELETE', '/api/household-items/hi-1/subsidies/sp-1'],
    ],
  },
];

describe.each(FILES)('$name handlers without an authenticated user', (file) => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-relation-guard-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    app = Fastify();
    await app.register(configPlugin);
    await app.register(dbPlugin);
    await app.register(errorHandlerPlugin);
    // The auth plugin normally decorates `user`; without it the guard sees no user.
    app.decorateRequest('user', null);
    for (const prefix of file.prefixes) await app.register(file.plugin, { prefix });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    process.env = originalEnv;
    rmSync(tempDir, { recursive: true, force: true });
  });

  // Rows are objects: jest would take a third parameter of a shorter array row as `done`.
  const rows = file.calls.map(([method, url, body]) => ({ method, url, body }));

  it.each(rows)('$method $url answers 401 UNAUTHORIZED from the handler guard', async (row) => {
    const res = await app.inject({
      method: row.method,
      url: row.url,
      ...(row.body ? { payload: row.body } : {}),
    });

    expect(res.statusCode).toBe(401);
    expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
  });
});
