import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { MainLayout } from "@/components/layout/MainLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

// Auth pages
import Login from "./pages/auth/Login";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import LandingPage from "./pages/LandingPage";

// Protected pages
import Dashboard from "./pages/dashboard";
import PropertiesList from "./pages/properties/PropertiesList";
import PropertyDetail from "./pages/properties/PropertyDetail";
import LeadsList from "./pages/leads/LeadsList";
import LeadDetail from "./pages/leads/LeadDetail";
import ShowingsList from "./pages/showings/ShowingsList";
import CallsList from "./pages/calls/CallsList";
import CallDetail from "./pages/calls/CallDetail";
import Reports from "./pages/reports/Reports";
import InsightGenerator from "./pages/insights/InsightGenerator";
import UsersList from "./pages/users/UsersList";
import UserDetail from "./pages/users/UserDetail";
import Settings from "./pages/settings/Settings";
import SystemLogs from "./pages/SystemLogs";
import CostDashboard from "./pages/costs/CostDashboard";
import FaqDocuments from "./pages/documents/FaqDocuments";
import LeadHeatMap from "./pages/analytics/LeadHeatMap";
import VoucherIntelligence from "./pages/analytics/VoucherIntelligence";
import NotFound from "./pages/NotFound";

// Public pages (no auth required)
import PublicProperties from "./pages/public/PublicProperties";
import PublicPropertyDetail from "./pages/public/PublicPropertyDetail";
import PrivacyPolicy from "./pages/public/PrivacyPolicy";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public property listings (no auth required) */}
            <Route path="/p/properties" element={<PublicProperties />} />
            <Route path="/p/properties/:id" element={<PublicPropertyDetail />} />
            <Route path="/p/privacy-policy" element={<PrivacyPolicy />} />

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
              path="/showings/*"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <ShowingsList />
                  </MainLayout>
                </ProtectedRoute>
              }
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

            <Route
              path="/insights"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'editor']}>
                  <MainLayout>
                    <InsightGenerator />
                  </MainLayout>
                </ProtectedRoute>
              }
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

            <Route
              path="/documents"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'editor', 'leasing_agent']}>
                  <MainLayout>
                    <FaqDocuments />
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

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
