import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Gift, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";

interface ReferralStats {
  activeReferrals: number;
  pendingRewards: number;
  lastConversion: string | null;
}

interface ReferralWidgetProps {
  variant?: "compact" | "full";
}

export const ReferralWidget: React.FC<ReferralWidgetProps> = ({ variant = "compact" }) => {
  const navigate = useNavigate();
  const { userRecord } = useAuth();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      if (!userRecord?.organization_id) return;

      try {
        // Get all non-expired, non-rewarded referrals
        const { data: activeReferrals } = await supabase
          .from("referrals")
          .select("id, status, reward_amount, created_at")
          .eq("organization_id", userRecord.organization_id)
          .neq("status", "expired")
          .neq("status", "rewarded");

        // Get the most recent conversion
        const { data: lastConverted } = await supabase
          .from("referrals")
          .select("created_at")
          .eq("organization_id", userRecord.organization_id)
          .eq("status", "converted")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        const pendingRewards = (activeReferrals || [])
          .filter((r) => r.status === "converted")
          .reduce((sum, r) => sum + (r.reward_amount || 100), 0);

        setStats({
          activeReferrals: activeReferrals?.length || 0,
          pendingRewards,
          lastConversion: lastConverted?.created_at || null,
        });
      } catch (error) {
        console.error("Error fetching referral stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [userRecord?.organization_id]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Gift className="h-4 w-4 text-primary" />
          Referral Program
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Active referrals:</span>{" "}
            <span className="font-medium">{stats?.activeReferrals || 0}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Pending rewards:</span>{" "}
            <span className="font-medium text-green-600">
              ${stats?.pendingRewards?.toLocaleString() || 0}
            </span>
          </p>
          {stats?.lastConversion && (
            <p>
              <span className="text-muted-foreground">Last conversion:</span>{" "}
              <span className="font-medium">
                {formatDistanceToNow(new Date(stats.lastConversion), { addSuffix: true })}
              </span>
            </p>
          )}
        </div>
        <Button
          variant="link"
          size="sm"
          className="px-0 mt-2"
          onClick={() => navigate("/referrals")}
        >
          View All <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
};

export const ReferralWidgetSkeleton: React.FC = () => (
  <Card>
    <CardHeader className="pb-2">
      <Skeleton className="h-5 w-32" />
    </CardHeader>
    <CardContent>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-20" />
      </div>
    </CardContent>
  </Card>
);
