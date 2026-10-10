// Synthetic router using the shared route map helpers. Used by build-routes.test.mjs; not compiled.
export function App() {
  return (
    <Routes>
      <Route element={<AuthGuard />}>
        <Route element={<AppShell />}>
          <Route path={routePattern('tasks')} element={<TasksPage />} />
          <Route path={routePattern('task')} element={<TaskPage />} />
          <Route element={<RoleGuard allow={['admin']} />}>
            <Route path={routePattern('admin')} element={<AdminPage />} />
          </Route>
          <Route element={<RouteGate rules={[]} />}>
            <Route path={routePattern('review')} element={<ReviewPage />} />
          </Route>
          {LIVE_REDIRECT_ROUTES.map((r) => (
            <Route key={r.from} path={r.from} element={<RouteRedirect rule={r} />} />
          ))}
        </Route>
      </Route>
    </Routes>
  );
}
