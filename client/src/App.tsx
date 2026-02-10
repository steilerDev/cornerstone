import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/AppShell/AppShell';

const SetupPage = lazy(() => import('./pages/SetupPage/SetupPage'));
const LoginPage = lazy(() => import('./pages/LoginPage/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage/DashboardPage'));
const WorkItemsPage = lazy(() => import('./pages/WorkItemsPage/WorkItemsPage'));
const BudgetPage = lazy(() => import('./pages/BudgetPage/BudgetPage'));
const TimelinePage = lazy(() => import('./pages/TimelinePage/TimelinePage'));
const HouseholdItemsPage = lazy(() => import('./pages/HouseholdItemsPage/HouseholdItemsPage'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage/DocumentsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage/ProfilePage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage/NotFoundPage'));

export function App() {
  return (
    <BrowserRouter>
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

        {/* App routes (with AppShell wrapper) */}
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="work-items" element={<WorkItemsPage />} />
          <Route path="budget" element={<BudgetPage />} />
          <Route path="timeline" element={<TimelinePage />} />
          <Route path="household-items" element={<HouseholdItemsPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
