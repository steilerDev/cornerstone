import { lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/AppShell/AppShell';

const DashboardPage = lazy(() => import('./pages/DashboardPage/DashboardPage'));
const WorkItemsPage = lazy(() => import('./pages/WorkItemsPage/WorkItemsPage'));
const BudgetPage = lazy(() => import('./pages/BudgetPage/BudgetPage'));
const TimelinePage = lazy(() => import('./pages/TimelinePage/TimelinePage'));
const HouseholdItemsPage = lazy(() => import('./pages/HouseholdItemsPage/HouseholdItemsPage'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage/DocumentsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage/NotFoundPage'));

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="work-items" element={<WorkItemsPage />} />
          <Route path="budget" element={<BudgetPage />} />
          <Route path="timeline" element={<TimelinePage />} />
          <Route path="household-items" element={<HouseholdItemsPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
