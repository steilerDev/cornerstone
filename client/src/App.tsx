import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/AppShell/AppShell';
import { DashboardPage } from './pages/DashboardPage/DashboardPage';
import { WorkItemsPage } from './pages/WorkItemsPage/WorkItemsPage';
import { BudgetPage } from './pages/BudgetPage/BudgetPage';
import { TimelinePage } from './pages/TimelinePage/TimelinePage';
import { HouseholdItemsPage } from './pages/HouseholdItemsPage/HouseholdItemsPage';
import { DocumentsPage } from './pages/DocumentsPage/DocumentsPage';
import { NotFoundPage } from './pages/NotFoundPage/NotFoundPage';

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
