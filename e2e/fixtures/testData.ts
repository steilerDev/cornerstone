import { routeUrl } from '../../shared/src/routes/index.js';

/**
 * Test data constants used across E2E tests
 */

export const TEST_ADMIN = {
  email: 'admin@e2e-test.local',
  displayName: 'E2E Admin',
  password: 'e2e-secure-password-123!',
};

export const TEST_MEMBER = {
  email: 'member@e2e-test.local',
  displayName: 'E2E Member',
  // Pre-created as a local account (via the admin-authenticated POST /api/users
  // API — see the `beforeAll` seed step in oidc.spec.ts), then linked to the
  // mock OIDC provider's fixed identity on first SSO login. OIDC is purely an
  // alternate login method for an already-existing account: authProvider stays
  // 'local' after linking, and this password keeps working alongside SSO.
  localPassword: 'e2e-member-password-456!',
};

export const ROUTES = {
  home: routeUrl('dashboard'),
  photos: routeUrl('photos'),
  setup: routeUrl('setup'),
  login: routeUrl('login'),
  workItems: routeUrl('workItems'),
  workItemsNew: routeUrl('workItemNew'),
  budget: routeUrl('budgetOverview'),
  budgetCategories: routeUrl('settingsManage', undefined, { tab: 'budget-categories' }),
  settingsVendors: routeUrl('vendors'),
  budgetSources: routeUrl('budgetSources'),
  budgetSubsidies: routeUrl('budgetSubsidies'),
  budgetReports: routeUrl('bankReport'),
  manage: routeUrl('settingsManage'),
  timeline: routeUrl('schedule'),
  householdItems: routeUrl('householdItems'),
  householdItemsNew: routeUrl('householdItemNew'),
  profile: routeUrl('settingsProfile'),
  userManagement: routeUrl('settingsUsers'),
  diary: routeUrl('diary'),
  backups: routeUrl('settingsBackups'),
};

export const API = {
  health: '/api/health',
  authMe: '/api/auth/me',
  login: '/api/auth/login',
  logout: '/api/auth/logout',
  setup: '/api/auth/setup',
  users: '/api/users',
  profile: '/api/users/me',
  budgetCategories: '/api/budget-categories',
  vendors: '/api/vendors',
  workItems: '/api/work-items',
  budgetSources: '/api/budget-sources',
  subsidyPrograms: '/api/subsidy-programs',
  budgetOverview: '/api/budget/overview',
  budgetBreakdown: '/api/budget/breakdown',
  milestones: '/api/milestones',
  timeline: '/api/timeline',
  schedule: '/api/schedule',
  householdItems: '/api/household-items',
  areas: '/api/areas',
  diaryEntries: '/api/diary-entries',
  diaryExport: '/api/diary-entries/export',
  backups: '/api/backups',
  sourceReports: '/api/source-reports',
  sourceReportsMarkClaimed: '/api/source-reports/mark-claimed',
  sourceReportsGenerateContent: '/api/source-reports/generate-content',
  paperlessStatus: '/api/paperless/status',
  paperlessDocuments: '/api/paperless/documents',
};
