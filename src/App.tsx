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

// Protected pages
import Dashboard from "./pages/dashboard";
import PropertiesList from "./pages/properties/PropertiesList";
import PropertyDetail from "./pages/properties/PropertyDetail";
import LeadsList from "./pages/leads/LeadsList";
import LeadDetail from "./pages/leads/LeadDetail";
import ShowingsList from "./pages/showings/ShowingsList";
import CallsList from "./pages/calls/CallsList";
import Reports from "./pages/reports/Reports";
import InsightGenerator from "./pages/insights/InsightGenerator";
import UsersList from "./pages/users/UsersList";
import Settings from "./pages/settings/Settings";
import SystemLogs from "./pages/SystemLogs";
import CostDashboard from "./pages/costs/CostDashboard";
import NotFound from "./pages/NotFound";

// Public pages (no auth required)
import PublicProperties from "./pages/public/PublicProperties";
import PublicPropertyDetail from "./pages/public/PublicPropertyDetail";

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

            {/* Public auth routes */}
            <Route path="/auth/login" element={<Login />} />
            <Route path="/auth/forgot-password" element={<ForgotPassword />} />
            <Route path="/auth/reset-password" element={<ResetPassword />} />

            {/* Redirect root to dashboard */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

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
              path="/calls/*"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'editor']}>
                  <MainLayout>
                    <CallsList />
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
              path="/users/*"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                  <MainLayout>
                    <UsersList />
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

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
