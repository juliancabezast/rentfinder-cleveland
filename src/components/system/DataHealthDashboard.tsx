import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Home,
  Users,
  Clock,
  Copy,
  ExternalLink,
  ImageOff,
  DollarSign,
  BedDouble,
  Bath,
  Phone,
  Mail,
  Target,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";

interface Finding {
  id: string;
  type: "property" | "lead";
  severity: "warning" | "error";
  icon: React.ReactNode;
  title: string;
  description: string;
  link: string;
}

interface HealthSection {
  label: string;
  icon: React.ReactNode;
  findings: Finding[];
  loading: boolean;
}

export const DataHealthDashboard: React.FC = () => {
  const { userRecord } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  // Sections
  const [propertyFindings, setPropertyFindings] = useState<Finding[]>([]);
  const [leadFindings, setLeadFindings] = useState<Finding[]>([]);
  const [staleFindings, setStaleFindings] = useState<Finding[]>([]);
  const [duplicateFindings, setDuplicateFindings] = useState<Finding[]>([]);
  const [scoreFindings, setScoreFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);

  const runChecks = useCallback(async () => {
    if (!userRecord?.organization_id) return;
    const orgId = userRecord.organization_id;

    try {
      // Run all checks in parallel
      const [propertiesRes, leadsRes] = await Promise.all([
        supabase
          .from("properties")
          .select("id, address, rent_price, bedrooms, bathrooms, photos, status")
          .eq("organization_id", orgId)
          .in("status", ["available", "coming_soon"]),
        supabase
          .from("leads")
          .select("id, full_name, phone, email, lead_score, status, last_contact_at, updated_at, created_at")
          .eq("organization_id", orgId)
          .neq("status", "lost"),
      ]);

      const properties = propertiesRes.data || [];
      const leads = leadsRes.data || [];

      // ── Property checks ────────────────────────────────────────
      const propFindings: Finding[] = [];

      properties.forEach((p) => {
        const issues: string[] = [];
        if (!p.rent_price || p.rent_price === 0) issues.push("no price");
        if (!p.bedrooms || p.bedrooms === 0) issues.push("no bedrooms");
        if (!p.bathrooms || p.bathrooms === 0) issues.push("no bathrooms");
        const photos = Array.isArray(p.photos) ? p.photos : [];
        if (photos.length === 0) issues.push("no photos");

        if (issues.length > 0) {
          propFindings.push({
            id: p.id,
            type: "property",
            severity: issues.includes("no price") || issues.includes("no photos") ? "error" : "warning",
            icon: issues.includes("no photos") ? <ImageOff className="h-4 w-4" /> :
                  issues.includes("no price") ? <DollarSign className="h-4 w-4" /> :
                  issues.includes("no bedrooms") ? <BedDouble className="h-4 w-4" /> :
                  <Bath className="h-4 w-4" />,
            title: p.address || "Unknown property",
            description: `Missing: ${issues.join(", ")}`,
            link: `/properties/${p.id}`,
          });
        }
      });
      setPropertyFindings(propFindings);

      // ── Lead missing data checks ───────────────────────────────
      const leadIssues: Finding[] = [];

      leads.forEach((l) => {
        const issues: string[] = [];
        if (!l.full_name || l.full_name.trim() === "") issues.push("no name");
        if (!l.email || l.email.trim() === "") issues.push("no email");

        if (issues.length > 0) {
          leadIssues.push({
            id: l.id,
            type: "lead",
            severity: issues.includes("no name") ? "error" : "warning",
            icon: issues.includes("no name") ? <Users className="h-4 w-4" /> : <Mail className="h-4 w-4" />,
            title: l.full_name || l.phone || "Unknown lead",
            description: `Missing: ${issues.join(", ")}`,
            link: `/leads/${l.id}`,
          });
        }
      });
      setLeadFindings(leadIssues);

      // ── Stale leads (14+ days no activity) ─────────────────────
      const now = Date.now();
      const fourteenDays = 14 * 24 * 60 * 60 * 1000;
      const stale: Finding[] = [];

      leads.forEach((l) => {
        const activeStatuses = ["new", "contacted", "engaged", "nurturing", "qualified"];
        if (!activeStatuses.includes(l.status)) return;

        const lastActivity = l.last_contact_at || l.updated_at || l.created_at;
        if (!lastActivity) return;

        const elapsed = now - new Date(lastActivity).getTime();
        if (elapsed > fourteenDays) {
          stale.push({
            id: l.id,
            type: "lead",
            severity: elapsed > fourteenDays * 2 ? "error" : "warning",
            icon: <Clock className="h-4 w-4" />,
            title: l.full_name || l.phone || "Unknown lead",
            description: `No activity for ${formatDistanceToNow(new Date(lastActivity))} — status: ${l.status}`,
            link: `/leads/${l.id}`,
          });
        }
      });

      stale.sort((a, b) => {
        // Sort errors first
        if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
        return 0;
      });
      setStaleFindings(stale);

      // ── Duplicate leads (same phone) ───────────────────────────
      const phoneMap = new Map<string, typeof leads>();
      leads.forEach((l) => {
        if (!l.phone) return;
        const normalized = l.phone.replace(/\D/g, "");
        if (normalized.length < 7) return;
        const existing = phoneMap.get(normalized) || [];
        existing.push(l);
        phoneMap.set(normalized, existing);
      });

      const dupes: Finding[] = [];
      phoneMap.forEach((group, phone) => {
        if (group.length < 2) return;
        group.forEach((l) => {
          dupes.push({
            id: l.id,
            type: "lead",
            severity: "warning",
            icon: <Copy className="h-4 w-4" />,
            title: l.full_name || l.phone || "Unknown",
            description: `Duplicate phone (${group.length} leads share ${l.phone})`,
            link: `/leads/${l.id}`,
          });
        });
      });
      setDuplicateFindings(dupes);

      // ── Leads stuck at default score (50) ──────────────────────
      const stuck: Finding[] = [];
      leads.forEach((l) => {
        if (l.lead_score === 50 && l.status !== "new") {
          stuck.push({
            id: l.id,
            type: "lead",
            severity: "warning",
            icon: <Target className="h-4 w-4" />,
            title: l.full_name || l.phone || "Unknown",
            description: `Score stuck at 50 (default) — status: ${l.status}`,
            link: `/leads/${l.id}`,
          });
        }
      });
      setScoreFindings(stuck);

      setLastChecked(new Date());
    } catch (error) {
      console.error("Data health check error:", error);
    } finally {
      setLoading(false);
    }
  }, [userRecord?.organization_id]);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setLoading(true);
    await runChecks();
    setRefreshing(false);
  };

  const totalIssues = propertyFindings.length + leadFindings.length + staleFindings.length + duplicateFindings.length + scoreFindings.length;
  const errorCount = [propertyFindings, leadFindings, staleFindings, duplicateFindings, scoreFindings]
    .flat()
    .filter((f) => f.severity === "error").length;

  const sections: HealthSection[] = [
    {
      label: "Properties — Missing Data",
      icon: <Home className="h-4 w-4" />,
      findings: propertyFindings,
      loading,
    },
    {
      label: "Leads — Incomplete Profiles",
      icon: <Users className="h-4 w-4" />,
      findings: leadFindings,
      loading,
    },
    {
      label: "Stale Leads (14+ days)",
      icon: <Clock className="h-4 w-4" />,
      findings: staleFindings,
      loading,
    },
    {
      label: "Duplicate Leads",
      icon: <Copy className="h-4 w-4" />,
      findings: duplicateFindings,
      loading,
    },
    {
      label: "Score Stuck at Default (50)",
      icon: <Target className="h-4 w-4" />,
      findings: scoreFindings,
      loading,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {totalIssues === 0 && !loading ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              )}
              Data Health
            </CardTitle>
            <CardDescription>
              {loading
                ? "Analyzing data quality..."
                : totalIssues === 0
                ? "All records look good"
                : `${totalIssues} issue${totalIssues === 1 ? "" : "s"} found (${errorCount} critical)`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {lastChecked && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Checked {formatDistanceToNow(lastChecked, { addSuffix: true })}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {sections.map((section) => (
          <div key={section.label}>
            <div className="flex items-center gap-2 mb-2">
              {section.icon}
              <span className="text-sm font-medium">{section.label}</span>
              {!section.loading && (
                <Badge
                  variant={section.findings.length === 0 ? "secondary" : "outline"}
                  className={
                    section.findings.length === 0
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : section.findings.some((f) => f.severity === "error")
                      ? "border-red-300 text-red-700 dark:text-red-400"
                      : "border-amber-300 text-amber-700 dark:text-amber-400"
                  }
                >
                  {section.findings.length === 0 ? "OK" : section.findings.length}
                </Badge>
              )}
            </div>

            {section.loading ? (
              <div className="h-8 bg-muted/50 rounded animate-pulse" />
            ) : section.findings.length === 0 ? (
              <p className="text-xs text-muted-foreground pl-6">No issues found</p>
            ) : (
              <ScrollArea className={section.findings.length > 4 ? "h-[160px]" : ""}>
                <div className="space-y-1 pl-6">
                  {section.findings.map((finding) => (
                    <Link
                      key={finding.id + finding.description}
                      to={finding.link}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/70 transition-colors group text-sm"
                    >
                      <span
                        className={
                          finding.severity === "error"
                            ? "text-red-500"
                            : "text-amber-500"
                        }
                      >
                        {finding.icon}
                      </span>
                      <span className="font-medium truncate max-w-[180px]">
                        {finding.title}
                      </span>
                      <span className="text-xs text-muted-foreground truncate flex-1">
                        {finding.description}
                      </span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                    </Link>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
