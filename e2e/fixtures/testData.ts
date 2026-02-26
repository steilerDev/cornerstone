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
  home: '/',
  setup: '/setup',
  login: '/login',
  workItems: '/work-items',
  workItemsNew: '/work-items/new',
  budget: '/budget/overview',
  budgetCategories: '/budget/categories',
  budgetVendors: '/budget/vendors',
  budgetSources: '/budget/sources',
  budgetSubsidies: '/budget/subsidies',
  tags: '/tags',
  timeline: '/timeline',
  householdItems: '/household-items',
  documents: '/documents',
  profile: '/profile',
  userManagement: '/admin/users',
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
  tags: '/api/tags',
  budgetSources: '/api/budget-sources',
  subsidyPrograms: '/api/subsidy-programs',
  budgetOverview: '/api/budget/overview',
};
