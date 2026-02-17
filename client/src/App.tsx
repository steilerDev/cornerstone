import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/AppShell/AppShell';
import { AuthProvider } from './contexts/AuthContext';
import { AuthGuard } from './components/AuthGuard/AuthGuard';

const SetupPage = lazy(() => import('./pages/SetupPage/SetupPage'));
const LoginPage = lazy(() => import('./pages/LoginPage/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage/DashboardPage'));
const WorkItemsPage = lazy(() => import('./pages/WorkItemsPage/WorkItemsPage'));
const WorkItemCreatePage = lazy(() => import('./pages/WorkItemCreatePage/WorkItemCreatePage'));
const WorkItemDetailPage = lazy(() => import('./pages/WorkItemDetailPage/WorkItemDetailPage'));
const BudgetPage = lazy(() => import('./pages/BudgetPage/BudgetPage'));
const TimelinePage = lazy(() => import('./pages/TimelinePage/TimelinePage'));
const HouseholdItemsPage = lazy(() => import('./pages/HouseholdItemsPage/HouseholdItemsPage'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage/DocumentsPage'));
const TagManagementPage = lazy(() => import('./pages/TagManagementPage/TagManagementPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage/ProfilePage'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage/UserManagementPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage/NotFoundPage'));

export function App() {
  return (
    <BrowserRouter>
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
              <Route index element={<DashboardPage />} />
              <Route path="work-items" element={<WorkItemsPage />} />
              <Route path="work-items/new" element={<WorkItemCreatePage />} />
              <Route path="work-items/:id" element={<WorkItemDetailPage />} />
              <Route path="budget" element={<BudgetPage />} />
              <Route path="timeline" element={<TimelinePage />} />
              <Route path="household-items" element={<HouseholdItemsPage />} />
              <Route path="documents" element={<DocumentsPage />} />
              <Route path="tags" element={<TagManagementPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="admin/users" element={<UserManagementPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
