import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PropertyMetricCard, PropertyMetricCardSkeleton } from "@/components/dashboard/PropertyMetricCard";
import { InsightCard, InsightCardSkeleton } from "@/components/dashboard/InsightCard";
import { InvestorReportsSection } from "@/components/dashboard/InvestorReportsSection";
import { Card, CardContent } from "@/components/ui/card";
import { Building, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface PropertyWithMetrics {
  id: string;
  address: string;
  unit_number: string | null;
  city: string;
  status: string;
  rent_price: number;
  photos: { url: string }[] | null;
  listed_date: string | null;
  leads_count: number;
  showings_scheduled: number;
  showings_completed: number;
}

type InsightType = "lead_loss_reason" | "pricing_feedback" | "location_feedback" | "feature_request" | "competitive_insight" | "seasonal_trend" | "recommendation";

interface Insight {
  id: string;
  insight_type: InsightType;
  headline: string;
  narrative: string;
  confidence_score: number | null;
  is_highlighted: boolean;
  period_start: string;
  period_end: string;
}

export const InvestorDashboard = () => {
  const { userRecord } = useAuth();
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<PropertyWithMetrics[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);

  useEffect(() => {
    const fetchInvestorData = async () => {
      if (!userRecord?.id || !userRecord?.organization_id) return;

      try {
        // First, get the properties the investor has access to
        const { data: accessData, error: accessError } = await supabase
          .from("investor_property_access")
          .select("property_id")
          .eq("investor_id", userRecord.id);

        if (accessError) throw accessError;

        if (!accessData || accessData.length === 0) {
          setLoading(false);
          return;
        }

        const propertyIds = accessData.map((a) => a.property_id);

        // Fetch properties with their details
        const { data: propertiesData, error: propertiesError } = await supabase
          .from("properties")
          .select("id, address, unit_number, city, status, rent_price, photos, listed_date")
          .in("id", propertyIds);

        if (propertiesError) throw propertiesError;

        // Fetch lead counts per property
        const { data: leadsData } = await supabase
          .from("leads")
          .select("interested_property_id")
          .in("interested_property_id", propertyIds);

        // Fetch showings per property
        const { data: showingsData } = await supabase
          .from("showings")
          .select("property_id, status")
          .in("property_id", propertyIds);

        // Process metrics
        const leadCounts: Record<string, number> = {};
        const showingCounts: Record<string, { scheduled: number; completed: number }> = {};

        (leadsData || []).forEach((l) => {
          if (l.interested_property_id) {
            leadCounts[l.interested_property_id] = (leadCounts[l.interested_property_id] || 0) + 1;
          }
        });

        (showingsData || []).forEach((s) => {
          if (!showingCounts[s.property_id]) {
            showingCounts[s.property_id] = { scheduled: 0, completed: 0 };
          }
          if (s.status === "completed") {
            showingCounts[s.property_id].completed++;
          } else if (s.status === "scheduled" || s.status === "confirmed") {
            showingCounts[s.property_id].scheduled++;
          }
        });

        setProperties(
          (propertiesData || []).map((p) => ({
            ...p,
            photos: p.photos as { url: string }[] | null,
            leads_count: leadCounts[p.id] || 0,
            showings_scheduled: showingCounts[p.id]?.scheduled || 0,
            showings_completed: showingCounts[p.id]?.completed || 0,
          }))
        );

        // Fetch insights for these properties
        const { data: insightsData, error: insightsError } = await supabase
          .from("investor_insights")
          .select("*")
          .in("property_id", propertyIds)
          .order("is_highlighted", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(10);

        if (insightsError) throw insightsError;

        // Type assertion to match our interface
        const typedInsights = (insightsData || []).map((insight) => ({
          ...insight,
          insight_type: insight.insight_type as InsightType,
        }));
        setInsights(typedInsights);

      } catch (error) {
        console.error("Error fetching investor data:", error);
        toast.error("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };

    fetchInvestorData();
  }, [userRecord?.id, userRecord?.organization_id]);

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome, {userRecord?.full_name?.split(" ")[0] || "Investor"}
        </h1>
        <p className="text-muted-foreground">
          View performance metrics for your properties.
        </p>
      </div>

      {/* Properties Section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Building className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Your Properties</h2>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <PropertyMetricCardSkeleton key={i} />
            ))}
          </div>
        ) : properties.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {properties.map((property) => (
              <PropertyMetricCard key={property.id} property={property} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-center">
                No properties assigned to your account yet.
              </p>
              <p className="text-sm text-muted-foreground text-center mt-1">
                Contact your property manager to get access.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Insights Section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-accent" />
          <h2 className="text-xl font-semibold">Property Insights</h2>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <InsightCardSkeleton key={i} />
            ))}
          </div>
        ) : insights.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {insights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Sparkles className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-center">
                No insights available yet.
              </p>
              <p className="text-sm text-muted-foreground text-center mt-1">
                Insights will appear as we gather more data about your properties.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Monthly Reports Section */}
      <InvestorReportsSection />
    </div>
  );
};
