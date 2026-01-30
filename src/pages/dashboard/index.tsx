import { useAuth } from "@/contexts/AuthContext";
import { AdminDashboard } from "./AdminDashboard";
import { InvestorDashboard } from "./InvestorDashboard";
import { AgentDashboard } from "./AgentDashboard";
import { Skeleton } from "@/components/ui/skeleton";

const DashboardRouter = () => {
  const { userRecord, loading } = useAuth();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  // Route based on user role
  switch (userRecord?.role) {
    case "super_admin":
    case "admin":
    case "editor":
      return <AdminDashboard />;
    case "viewer":
      return <InvestorDashboard />;
    case "leasing_agent":
      return <AgentDashboard />;
    default:
      // Fallback to admin dashboard if role is unknown
      return <AdminDashboard />;
  }
};

export default DashboardRouter;
