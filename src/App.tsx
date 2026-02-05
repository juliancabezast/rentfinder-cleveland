import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { MainLayout } from "@/components/layout/MainLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Skeleton } from "@/components/ui/skeleton";

// Auth pages (not lazy-loaded for faster initial auth check)
import Login from "./pages/auth/Login";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import LandingPage from "./pages/LandingPage";

// Lazy-loaded protected pages for code splitting (Phase 12.3)
const Dashboard = lazy(() => import("./pages/dashboard"));
const PropertiesList = lazy(() => import("./pages/properties/PropertiesList"));
const PropertyDetail = lazy(() => import("./pages/properties/PropertyDetail"));
const LeadsList = lazy(() => import("./pages/leads/LeadsList"));
const LeadDetail = lazy(() => import("./pages/leads/LeadDetail"));
const ShowingsList = lazy(() => import("./pages/showings/ShowingsList"));
const CallsList = lazy(() => import("./pages/calls/CallsList"));
const CallDetail = lazy(() => import("./pages/calls/CallDetail"));
const Reports = lazy(() => import("./pages/reports/Reports"));
const KnowledgeHub = lazy(() => import("./pages/insights/KnowledgeHub"));
const UsersList = lazy(() => import("./pages/users/UsersList"));
const UserDetail = lazy(() => import("./pages/users/UserDetail"));
const Settings = lazy(() => import("./pages/settings/Settings"));
const SystemLogs = lazy(() => import("./pages/SystemLogs"));
const CostDashboard = lazy(() => import("./pages/costs/CostDashboard"));
const LeadHeatMap = lazy(() => import("./pages/analytics/LeadHeatMap"));
const VoucherIntelligence = lazy(() => import("./pages/analytics/VoucherIntelligence"));
const CompetitorRadar = lazy(() => import("./pages/analytics/CompetitorRadar"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AgentsPage = lazy(() => import("./pages/agents/AgentsPage"));

// Public pages (lazy-loaded)
const PrivacyPolicy = lazy(() => import("./pages/public/PrivacyPolicy"));
const ReferralPage = lazy(() => import("./pages/public/ReferralPage"));

// Page loading skeleton
const PageSkeleton = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="space-y-4 w-full max-w-xl px-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-64" />
      <div className="grid gap-4 grid-cols-2">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<PageSkeleton />}>
              <Routes>
                {/* Public pages (no auth required) */}
                <Route path="/p/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/p/refer/:referralCode" element={<ReferralPage />} />

                {/* Public auth routes */}
                <Route path="/auth/login" element={<Login />} />
                <Route path="/auth/forgot-password" element={<ForgotPassword />} />
                <Route path="/auth/reset-password" element={<ResetPassword />} />

                {/* Landing page - public homepage */}
                <Route path="/" element={<LandingPage />} />

                {/* Protected routes with MainLayout */}
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <MainLayout>
                        <Dashboard />
                      </MainLayout>
                    </ProtectedRoute>
                  }
                />

            <Route
              path="/properties"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <PropertiesList />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/properties/:id"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <PropertyDetail />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/leads"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <LeadsList />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/leads/:id"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <LeadDetail />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/showings"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <ShowingsList />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            {/* Redirect old /showings/route to new tabbed location */}
            <Route
              path="/showings/route"
              element={<Navigate to="/showings?tab=route" replace />}
            />

            <Route
              path="/calls"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'editor']}>
                  <MainLayout>
                    <CallsList />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/calls/:id"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'editor']}>
                  <MainLayout>
                    <CallDetail />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/reports/*"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'editor']}>
                  <MainLayout>
                    <Reports />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            {/* Knowledge Hub (formerly Insight Generator + Documents) */}
            <Route
              path="/knowledge"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'editor']}>
                  <MainLayout>
                    <KnowledgeHub />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            {/* Redirect old routes to new Knowledge Hub */}
            <Route
              path="/insights"
              element={<Navigate to="/knowledge?tab=chat" replace />}
            />
            <Route
              path="/documents"
              element={<Navigate to="/knowledge?tab=documents" replace />}
            />

            <Route
              path="/users"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                  <MainLayout>
                    <UsersList />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/users/:id"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                  <MainLayout>
                    <UserDetail />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/agents"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                  <MainLayout>
                    <AgentsPage />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/settings/*"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                  <MainLayout>
                    <Settings />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/logs"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                  <MainLayout>
                    <SystemLogs />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/costs"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                  <MainLayout>
                    <CostDashboard />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            {/* Analytics Pages */}
            <Route
              path="/analytics/heat-map"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'editor']}>
                  <MainLayout>
                    <LeadHeatMap />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/analytics/voucher-intel"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'editor']}>
                  <MainLayout>
                    <VoucherIntelligence />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/analytics/competitor-radar"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'editor']}>
                  <MainLayout>
                    <CompetitorRadar />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
