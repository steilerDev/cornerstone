// Synthetic mini router used by build-routes.test.mjs. Not compiled by the app.
export function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route path="old-login" element={<Navigate to="/login" replace />} />
      <Route element={<AuthGuard />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="budget">
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<BudgetOverviewPage />} />
            <Route path="items/:itemId" element={<ItemDetailPage />} />
          </Route>
          <Route
            path="tasks"
            element={
              <Suspense fallback={<Spinner />}>
                <TasksPage />
              </Suspense>
            }
          />
          <Route path="legacy/:id" element={<ParamRedirect to="/tasks/:id" />} />
          <Route path="bare" element={<div>plain</div>} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
