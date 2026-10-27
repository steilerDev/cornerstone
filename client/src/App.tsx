import './i18n/index.js';
import { lazy, Suspense, useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { LIVE_REDIRECT_ROUTES, liveConditionalRules, routePattern } from '@cornerstone/shared';
import { AppShell } from './components/AppShell/AppShell';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { LocaleProvider, useLocale } from './contexts/LocaleContext';
import { useAuth } from './contexts/AuthContext';
import { AuthGuard } from './components/AuthGuard/AuthGuard';
import { RoleGuard } from './components/AuthGuard/RoleGuard';
import { ToastProvider } from './components/Toast/ToastContext';
import { ToastList } from './components/Toast/Toast';
import { ChunkLoadErrorBoundary } from './components/ChunkLoadErrorBoundary/index.js';
import { RouteRedirect } from './navigation/RouteRedirect.js';
import { RouteGate } from './navigation/RouteGate.js';
import { RouteTitleFallback } from './navigation/RouteTitleFallback.js';
import { HouseNameProvider } from './contexts/HouseNameContext.js';
import { displayLocationFor } from './navigation/dialogRoutes.js';
import { RealLocationContext, RealLocationKeyContext } from './navigation/realLocation.js';
import { CaptureUploadProvider } from './capture/CaptureUploadProvider.js';
import { CompanyCreateProvider } from './objectForms/CompanyCreateProvider.js';
import { FinancingCreateProvider } from './objectForms/FinancingCreateProvider.js';
import { InvoiceCreateProvider } from './objectForms/InvoiceCreateProvider.js';
import { TagCreateProvider } from './objectForms/TagCreateProvider.js';
import { PhotoDialogsProvider } from './photos/PhotoDialogsProvider.js';
import { ObjectFormRoutes } from './objectForms/ObjectFormRoutes.js';

/**
 * Bridge component that syncs theme with server when user authenticates.
 * Must be placed inside AuthProvider but outside Routes to access useAuth and useTheme.
 */
function ThemeServerSync() {
  const { user } = useAuth();
  const { syncWithServer } = useTheme();

  useEffect(() => {
    if (user) {
      void syncWithServer(user.id);
    }
  }, [user, syncWithServer]);

  return null;
}

/**
 * Bridge component that syncs locale with server when user authenticates.
 * Must be placed inside AuthProvider but outside Routes to access useAuth and useLocale.
 */
function LocaleServerSync() {
  const { user } = useAuth();
  const { syncWithServer } = useLocale();

  useEffect(() => {
    if (user) {
      void syncWithServer(user.id);
    }
  }, [user, syncWithServer]);

  return null;
}

const SetupPage = lazy(() => import('./pages/SetupPage/SetupPage'));
const LoginPage = lazy(() => import('./pages/LoginPage/LoginPage'));
const HomePage = lazy(() => import('./pages/HomePage/HomePage'));
const WorkItemsPage = lazy(() => import('./pages/WorkItemsPage/WorkItemsPage'));
const WorkItemDetailPage = lazy(() => import('./pages/WorkItemDetailPage/WorkItemDetailPage'));
const BudgetOverviewPage = lazy(() => import('./pages/BudgetOverviewPage/BudgetOverviewPage'));
const VendorsPage = lazy(() => import('./pages/VendorsPage/VendorsPage'));
const VendorDetailPage = lazy(() => import('./pages/VendorDetailPage/VendorDetailPage'));
const FinancingPage = lazy(() => import('./pages/BudgetSourcesPage/FinancingPage'));
const FundingSourcePage = lazy(() => import('./pages/BudgetSourcesPage/FundingSourcePage'));
const GrantPage = lazy(() => import('./pages/SubsidyProgramsPage/GrantPage'));
const TimelinePage = lazy(() => import('./pages/TimelinePage/TimelinePage'));
const HouseholdItemsPage = lazy(() => import('./pages/HouseholdItemsPage/HouseholdItemsPage'));
const HouseholdItemDetailPage = lazy(
  () => import('./pages/HouseholdItemDetailPage/HouseholdItemDetailPage'),
);
const HouseholdItemEditPage = lazy(
  () => import('./pages/HouseholdItemEditPage/HouseholdItemEditPage'),
);
const MilestonesPage = lazy(() => import('./pages/MilestonesPage/MilestonesPage'));
const MilestoneDetailPage = lazy(() => import('./pages/MilestoneDetailPage/MilestoneDetailPage'));
const ManagePage = lazy(() => import('./pages/ManagePage/ManagePage.js'));
const ProfilePage = lazy(() => import('./pages/ProfilePage/ProfilePage'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage/UserManagementPage'));
const BackupsPage = lazy(() => import('./pages/BackupsPage/BackupsPage'));
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage/IntegrationsPage'));
const InvoicesPage = lazy(() => import('./pages/InvoicesPage/InvoicesPage'));
const InvoiceDetailPage = lazy(() => import('./pages/InvoiceDetailPage/InvoiceDetailPage'));
const InvoiceConvertPage = lazy(() => import('./pages/InvoiceDetailPage/InvoiceConvertPage'));
const AutoItemizePage = lazy(() => import('./pages/AutoItemizePage/index.js'));
const ReportWizardPage = lazy(() => import('./pages/ReportWizardPage/index.js'));
const PaperlessInvoiceReviewPage = lazy(
  () => import('./pages/PaperlessInvoiceReviewPage/index.js'),
);
const DiaryPage = lazy(() => import('./pages/DiaryPage/DiaryPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage/HistoryPage'));
const DiaryEntryDetailPage = lazy(
  () => import('./pages/DiaryEntryDetailPage/DiaryEntryDetailPage'),
);
const DiaryCapturePage = lazy(() => import('./pages/DiaryCapturePage/DiaryCapturePage'));
const PhotosPage = lazy(() => import('./pages/PhotosPage/PhotosPage'));
const AreasPage = lazy(() => import('./pages/AreasPage/AreasPage'));
const PhotoSpotViewerPage = lazy(() => import('./pages/PhotoSpotViewerPage/PhotoSpotViewerPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage/NotFoundPage'));
const NoAccessPage = lazy(() => import('./pages/NoAccessPage/NoAccessPage'));

/** Live conditional redirects (Paperless off) of the Paperless invoice review page. */
const PAPERLESS_REVIEW_RULES = liveConditionalRules('invoicePaperlessReview');

/**
 * The routed tree. `<Routes>` renders the display location (the page behind a dialog route);
 * the dialog host renders after it and sees the real location.
 */
function RoutedApp() {
  const location = useLocation();
  const display = useMemo(() => displayLocationFor(location), [location]);
  const real = useMemo(
    () => ({
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      key: location.key,
    }),
    [location.pathname, location.search, location.hash, location.key],
  );
  return (
    <RealLocationContext value={real}>
      <RealLocationKeyContext value={location.key}>
        <CompanyCreateProvider>
          <InvoiceCreateProvider>
            <FinancingCreateProvider>
              <TagCreateProvider>
                <PhotoDialogsProvider>
                  <CaptureUploadProvider>
                    <RouteTitleFallback />
                    <Routes location={display}>
                      {/* Auth routes (no AppShell wrapper) */}
                      <Route
                        path={routePattern('setup')}
                        element={
                          <Suspense fallback={<div>Loading...</div>}>
                            <SetupPage />
                          </Suspense>
                        }
                      />
                      <Route
                        path={routePattern('login')}
                        element={
                          <Suspense fallback={<div>Loading...</div>}>
                            <LoginPage />
                          </Suspense>
                        }
                      />
                      {/* Protected app routes (with AuthGuard and AppShell wrapper) */}
                      <Route element={<AuthGuard />}>
                        <Route element={<AppShell />}>
                          <Route path={routePattern('home')} element={<HomePage />} />
                          <Route path={routePattern('workItems')} element={<WorkItemsPage />} />
                          <Route path={routePattern('workItemNew')} element={<WorkItemsPage />} />
                          <Route path={routePattern('workItem')} element={<WorkItemDetailPage />} />
                          <Route
                            path={routePattern('householdItems')}
                            element={<HouseholdItemsPage />}
                          />
                          <Route
                            path={routePattern('householdItemNew')}
                            element={<HouseholdItemsPage />}
                          />
                          <Route
                            path={routePattern('householdItem')}
                            element={<HouseholdItemDetailPage />}
                          />
                          <Route
                            path={routePattern('householdItemEdit')}
                            element={<HouseholdItemEditPage />}
                          />
                          <Route path={routePattern('milestones')} element={<MilestonesPage />} />
                          <Route path={routePattern('milestoneNew')} element={<MilestonesPage />} />
                          <Route
                            path={routePattern('milestone')}
                            element={<MilestoneDetailPage />}
                          />
                          <Route
                            path={routePattern('budgetOverview')}
                            element={<BudgetOverviewPage />}
                          />
                          <Route path={routePattern('financing')} element={<FinancingPage />} />
                          <Route
                            path={routePattern('fundingSource')}
                            element={<FundingSourcePage />}
                          />
                          <Route path={routePattern('grant')} element={<GrantPage />} />
                          <Route path={routePattern('invoices')} element={<InvoicesPage />} />
                          <Route element={<RouteGate rules={PAPERLESS_REVIEW_RULES} />}>
                            <Route
                              path={routePattern('invoicePaperlessReview')}
                              element={
                                <Suspense fallback={<div>Loading...</div>}>
                                  <PaperlessInvoiceReviewPage />
                                </Suspense>
                              }
                            />
                          </Route>
                          <Route path={routePattern('invoice')} element={<InvoiceDetailPage />} />
                          <Route
                            path={routePattern('invoiceConvert')}
                            element={
                              <Suspense fallback={<div>Loading...</div>}>
                                <InvoiceConvertPage />
                              </Suspense>
                            }
                          />
                          <Route
                            path={routePattern('invoiceAutoItemize')}
                            element={
                              <Suspense fallback={<div>Loading...</div>}>
                                <AutoItemizePage />
                              </Suspense>
                            }
                          />
                          <Route path={routePattern('bankReport')} element={<ReportWizardPage />} />
                          <Route path={routePattern('scheduleGantt')} element={<TimelinePage />} />
                          <Route
                            path={routePattern('scheduleCalendar')}
                            element={<TimelinePage />}
                          />
                          <Route
                            path={routePattern('diary')}
                            element={
                              <Suspense fallback={<div>Loading...</div>}>
                                <DiaryPage />
                              </Suspense>
                            }
                          />
                          <Route
                            path={routePattern('history')}
                            element={
                              <Suspense fallback={<div>Loading...</div>}>
                                <HistoryPage />
                              </Suspense>
                            }
                          />
                          <Route
                            path={routePattern('diaryEntryNew')}
                            element={
                              <Suspense fallback={<div>Loading...</div>}>
                                <DiaryCapturePage key="diary-capture" />
                              </Suspense>
                            }
                          />
                          <Route
                            path={routePattern('diaryEntry')}
                            element={
                              <Suspense fallback={<div>Loading...</div>}>
                                <DiaryEntryDetailPage />
                              </Suspense>
                            }
                          />
                          <Route
                            path={routePattern('diaryEntryEdit')}
                            element={
                              <Suspense fallback={<div>Loading...</div>}>
                                <DiaryCapturePage key="diary-capture" />
                              </Suspense>
                            }
                          />
                          <Route
                            path={routePattern('areas')}
                            element={
                              <Suspense fallback={<div>Loading...</div>}>
                                <AreasPage />
                              </Suspense>
                            }
                          />
                          <Route
                            path={routePattern('photos')}
                            element={
                              <Suspense fallback={<div>Loading...</div>}>
                                <PhotosPage />
                              </Suspense>
                            }
                          />
                          <Route
                            path={routePattern('photoSpot')}
                            element={
                              <Suspense fallback={<div>Loading...</div>}>
                                <PhotoSpotViewerPage />
                              </Suspense>
                            }
                          />
                          <Route path={routePattern('settingsProfile')} element={<ProfilePage />} />
                          <Route path={routePattern('settingsManage')} element={<ManagePage />} />
                          <Route path={routePattern('companies')} element={<VendorsPage />} />
                          <Route path={routePattern('companyNew')} element={<VendorsPage />} />
                          <Route path={routePattern('company')} element={<VendorDetailPage />} />
                          <Route
                            element={<RoleGuard allow={['admin']} fallback={<NoAccessPage />} />}
                          >
                            <Route
                              path={routePattern('settingsUsers')}
                              element={<UserManagementPage />}
                            />
                            <Route
                              path={routePattern('settingsBackups')}
                              element={<BackupsPage />}
                            />
                            <Route
                              path={routePattern('settingsIntegrations')}
                              element={<IntegrationsPage />}
                            />
                          </Route>
                          {/* Redirects generated from the shared route map (legacy URLs, section roots) */}
                          {LIVE_REDIRECT_ROUTES.map((r) => (
                            <Route
                              key={r.from}
                              path={r.from}
                              element={<RouteRedirect rule={r} />}
                            />
                          ))}
                          <Route path={routePattern('notFound')} element={<NotFoundPage />} />
                        </Route>
                      </Route>
                    </Routes>
                    <ObjectFormRoutes />
                  </CaptureUploadProvider>
                </PhotoDialogsProvider>
              </TagCreateProvider>
            </FinancingCreateProvider>
          </InvoiceCreateProvider>
        </CompanyCreateProvider>
      </RealLocationKeyContext>
    </RealLocationContext>
  );
}

export function App() {
  return (
    <ChunkLoadErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <LocaleProvider>
            <ToastProvider>
              <AuthProvider>
                <HouseNameProvider>
                  <ThemeServerSync />
                  <LocaleServerSync />
                  <RoutedApp />
                </HouseNameProvider>
                {/* Toast notifications — rendered as a portal to document.body */}
                <ToastList />
              </AuthProvider>
            </ToastProvider>
          </LocaleProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ChunkLoadErrorBoundary>
  );
}
