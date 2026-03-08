import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AppShell } from './components/AppShell/AppShell';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthGuard } from './components/AuthGuard/AuthGuard';
import { ToastProvider } from './components/Toast/ToastContext';
import { ToastList } from './components/Toast/Toast';

/** Redirect helper that resolves route params (e.g. :id) into the target path. */
function ParamRedirect({ to }: { to: string }) {
  const params = useParams();
  const resolved = Object.entries(params).reduce(
    (path, [key, value]) => path.replace(`:${key}`, value ?? ''),
    to,
  );
  return <Navigate to={resolved} replace />;
}

const SetupPage = lazy(() => import('./pages/SetupPage/SetupPage'));
const LoginPage = lazy(() => import('./pages/LoginPage/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage/DashboardPage'));
const WorkItemsPage = lazy(() => import('./pages/WorkItemsPage/WorkItemsPage'));
const WorkItemCreatePage = lazy(() => import('./pages/WorkItemCreatePage/WorkItemCreatePage'));
const WorkItemDetailPage = lazy(() => import('./pages/WorkItemDetailPage/WorkItemDetailPage'));
const BudgetOverviewPage = lazy(() => import('./pages/BudgetOverviewPage/BudgetOverviewPage'));
const VendorsPage = lazy(() => import('./pages/VendorsPage/VendorsPage'));
const VendorDetailPage = lazy(() => import('./pages/VendorDetailPage/VendorDetailPage'));
const BudgetSourcesPage = lazy(() => import('./pages/BudgetSourcesPage/BudgetSourcesPage'));
const SubsidyProgramsPage = lazy(() => import('./pages/SubsidyProgramsPage/SubsidyProgramsPage'));
const TimelinePage = lazy(() => import('./pages/TimelinePage/TimelinePage'));
const HouseholdItemsPage = lazy(() => import('./pages/HouseholdItemsPage/HouseholdItemsPage'));
const HouseholdItemCreatePage = lazy(
  () => import('./pages/HouseholdItemCreatePage/HouseholdItemCreatePage'),
);
const HouseholdItemDetailPage = lazy(
  () => import('./pages/HouseholdItemDetailPage/HouseholdItemDetailPage'),
);
const HouseholdItemEditPage = lazy(
  () => import('./pages/HouseholdItemEditPage/HouseholdItemEditPage'),
);
const ManagePage = lazy(() => import('./pages/ManagePage/ManagePage.js'));
const ProfilePage = lazy(() => import('./pages/ProfilePage/ProfilePage'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage/UserManagementPage'));
const InvoicesPage = lazy(() => import('./pages/InvoicesPage/InvoicesPage'));
const InvoiceDetailPage = lazy(() => import('./pages/InvoiceDetailPage/InvoiceDetailPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage/NotFoundPage'));

export function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              {/* Auth routes (no AppShell wrapper) */}
              <Route
                path="setup"
                element={
                  <Suspense fallback={<div>Loading...</div>}>
                    <SetupPage />
                  </Suspense>
                }
              />
              <Route
                path="login"
                element={
                  <Suspense fallback={<div>Loading...</div>}>
                    <LoginPage />
                  </Suspense>
                }
              />

              {/* Protected app routes (with AuthGuard and AppShell wrapper) */}
              <Route element={<AuthGuard />}>
                <Route element={<AppShell />}>
                  {/* Root redirects to /project */}
                  <Route index element={<Navigate to="/project" replace />} />

                  {/* Project section */}
                  <Route path="project">
                    <Route index element={<Navigate to="overview" replace />} />
                    <Route path="overview" element={<DashboardPage />} />
                    <Route path="work-items" element={<WorkItemsPage />} />
                    <Route path="work-items/new" element={<WorkItemCreatePage />} />
                    <Route path="work-items/:id" element={<WorkItemDetailPage />} />
                    <Route path="household-items" element={<HouseholdItemsPage />} />
                    <Route path="household-items/new" element={<HouseholdItemCreatePage />} />
                    <Route path="household-items/:id" element={<HouseholdItemDetailPage />} />
                    <Route path="household-items/:id/edit" element={<HouseholdItemEditPage />} />
                  </Route>

                  {/* Budget section */}
                  <Route path="budget">
                    <Route index element={<Navigate to="overview" replace />} />
                    <Route path="overview" element={<BudgetOverviewPage />} />
                    <Route
                      path="categories"
                      element={<Navigate to="/settings/manage?tab=budget-categories" replace />}
                    />
                    <Route path="vendors" element={<VendorsPage />} />
                    <Route path="vendors/:id" element={<VendorDetailPage />} />
                    <Route path="sources" element={<BudgetSourcesPage />} />
                    <Route path="subsidies" element={<SubsidyProgramsPage />} />
                    <Route path="invoices" element={<InvoicesPage />} />
                    <Route path="invoices/:id" element={<InvoiceDetailPage />} />
                  </Route>

                  {/* Schedule (renamed from Timeline) */}
                  <Route path="schedule" element={<TimelinePage />} />

                  {/* Settings section */}
                  <Route path="settings">
                    <Route index element={<Navigate to="profile" replace />} />
                    <Route path="profile" element={<ProfilePage />} />
                    <Route path="manage" element={<ManagePage />} />
                    <Route path="users" element={<UserManagementPage />} />
                  </Route>

                  {/* Legacy redirects — preserve old bookmarks */}
                  <Route
                    path="work-items"
                    element={<Navigate to="/project/work-items" replace />}
                  />
                  <Route
                    path="work-items/new"
                    element={<Navigate to="/project/work-items/new" replace />}
                  />
                  <Route
                    path="work-items/:id"
                    element={<ParamRedirect to="/project/work-items/:id" />}
                  />
                  <Route
                    path="household-items"
                    element={<Navigate to="/project/household-items" replace />}
                  />
                  <Route
                    path="household-items/new"
                    element={<Navigate to="/project/household-items/new" replace />}
                  />
                  <Route
                    path="household-items/:id"
                    element={<ParamRedirect to="/project/household-items/:id" />}
                  />
                  <Route
                    path="household-items/:id/edit"
                    element={<ParamRedirect to="/project/household-items/:id/edit" />}
                  />
                  <Route path="invoices" element={<Navigate to="/budget/invoices" replace />} />
                  <Route
                    path="invoices/:id"
                    element={<ParamRedirect to="/budget/invoices/:id" />}
                  />
                  <Route path="timeline" element={<Navigate to="/schedule" replace />} />
                  <Route path="manage" element={<Navigate to="/settings/manage" replace />} />
                  <Route path="tags" element={<Navigate to="/settings/manage" replace />} />
                  <Route path="profile" element={<Navigate to="/settings/profile" replace />} />
                  <Route path="admin/users" element={<Navigate to="/settings/users" replace />} />

                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Route>
            </Routes>
            {/* Toast notifications — rendered as a portal to document.body */}
            <ToastList />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
