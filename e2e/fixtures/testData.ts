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
  // Created via OIDC flow, no local password
};

export const ROUTES = {
  home: '/project/overview',
  setup: '/setup',
  login: '/login',
  workItems: '/project/work-items',
  workItemsNew: '/project/work-items/new',
  budget: '/budget/overview',
  budgetCategories: '/settings/manage?tab=budget-categories',
  settingsVendors: '/settings/vendors',
  budgetSources: '/budget/sources',
  budgetSubsidies: '/budget/subsidies',
  manage: '/settings/manage',
  timeline: '/schedule',
  householdItems: '/project/household-items',
  householdItemsNew: '/project/household-items/new',
  profile: '/settings/profile',
  userManagement: '/settings/users',
  diary: '/diary',
  backups: '/settings/backups',
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
};
