import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, UserX, Copy, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface NurturingStats {
  incomplete: number;
  duplicates: number;
  forReview: number;
  graduatedThisWeek: number;
}

export const NurturingWidget: React.FC<{ loading?: boolean }> = ({ loading: parentLoading = false }) => {
  const { userRecord } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<NurturingStats>({ incomplete: 0, duplicates: 0, forReview: 0, graduatedThisWeek: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userRecord?.organization_id) return;
    fetchStats();
  }, [userRecord?.organization_id]);

  const fetchStats = async () => {
    if (!userRecord?.organization_id) return;
    setLoading(true);
    const orgId = userRecord.organization_id;

    try {
      // 1. Incomplete: leads missing name, phone, or email (not lost)
      const { count: incompleteCount } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .neq("status", "lost")
        .or("full_name.is.null,phone.is.null,email.is.null");

      // 2. For Review: leads with junk name patterns
      const { count: reviewCount } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .neq("status", "lost")
        .or("full_name.ilike.%.com%,full_name.ilike.%http%,full_name.ilike.%@%,full_name.ilike.%comments%,full_name.ilike.%unsubscribe%,full_name.ilike.%mailto:%,full_name.ilike.%subject:%,full_name.ilike.%reply%");

      // 3. Graduated this week: leads updated this week that now have all 3 fields
      //    and were updated well after creation (enriched after being incomplete)
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      const { count: graduatedCount } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .not("full_name", "is", null)
        .not("phone", "is", null)
        .not("email", "is", null)
        .gte("updated_at", weekStart.toISOString())
        .neq("status", "lost");

      // 4. Duplicates: fetch leads and detect client-side (lightweight — only check phone/email)
      const { data: leadsForDup } = await supabase
        .from("leads")
        .select("id, phone, email")
        .eq("organization_id", orgId)
        .neq("status", "lost");

      let dupGroups = 0;
      if (leadsForDup && leadsForDup.length > 0) {
        const seen = new Set<string>();
        const duped = new Set<string>();
        for (const l of leadsForDup) {
          const normPhone = l.phone ? l.phone.replace(/\D/g, "").slice(-10) : null;
          const normEmail = l.email ? l.email.trim().toLowerCase() : null;
          if (normPhone && normPhone.length === 10) {
            const key = `p:${normPhone}`;
            if (seen.has(key)) duped.add(key);
            seen.add(key);
          }
          if (normEmail) {
            const key = `e:${normEmail}`;
            if (seen.has(key)) duped.add(key);
            seen.add(key);
          }
        }
        dupGroups = duped.size;
      }

      setStats({
        incomplete: incompleteCount || 0,
        duplicates: dupGroups,
        forReview: reviewCount || 0,
        graduatedThisWeek: graduatedCount || 0,
      });
    } catch (err) {
      console.error("NurturingWidget fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (parentLoading || loading) {
    return (
      <Card variant="glass" className="h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-40" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const total = stats.incomplete + stats.duplicates + stats.forReview;
  const items = [
    {
      label: "Incomplete",
      count: stats.incomplete,
      icon: UserX,
      color: "text-amber-600",
      bg: "bg-amber-50",
      tab: "incomplete",
    },
    {
      label: "Duplicates",
      count: stats.duplicates,
      icon: Copy,
      color: "text-red-600",
      bg: "bg-red-50",
      tab: "duplicates",
    },
    {
      label: "For Review",
      count: stats.forReview,
      icon: AlertTriangle,
      color: "text-red-600",
      bg: "bg-red-50",
      tab: "suspect",
    },
    {
      label: "Graduated this week",
      count: stats.graduatedThisWeek,
      icon: CheckCircle2,
      color: "text-green-600",
      bg: "bg-green-50",
      tab: null,
    },
  ];

  return (
    <Card variant="glass" className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#370d4b]" />
            Nurturing Leads
          </CardTitle>
          {total > 0 && (
            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
              {total} pending
            </Badge>
          )}
          {total === 0 && (
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
              Clean
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className={`flex items-center justify-between p-3 rounded-lg ${item.bg} ${item.tab ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
                onClick={item.tab ? () => navigate(`/leads/nurturing?tab=${item.tab}`) : undefined}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`h-4.5 w-4.5 ${item.color}`} />
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold ${item.color}`}>{item.count}</span>
                  {item.tab && (
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full mt-4"
          onClick={() => navigate("/leads/nurturing")}
        >
          <Sparkles className="h-4 w-4 mr-1.5" />
          Open Nurturing Leads
        </Button>
      </CardContent>
    </Card>
  );
};
