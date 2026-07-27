import React, { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Sparkles, Copy, UserX, Clock, RefreshCw, AlertTriangle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/hooks/usePermissions";
import { DuplicatesTab } from "@/components/leads/nurturing/DuplicatesTab";
import { IncompleteTab } from "@/components/leads/nurturing/IncompleteTab";
import { StaleTab } from "@/components/leads/nurturing/StaleTab";
import { SuspectTab } from "@/components/leads/nurturing/SuspectTab";
import { EmailTemplatesTab } from "@/components/leads/nurturing/EmailTemplatesTab";

const LeadHygiene: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const permissions = usePermissions();

  // Lifted from EmailTemplatesTab: switching the parent tab unmounts that tab and
  // would silently discard unsaved template edits, so we confirm before leaving.
  const [emailTemplatesDirty, setEmailTemplatesDirty] = useState(false);

  // null = that check hasn't reported yet (tabs only fetch when mounted) — the
  // page must never claim "clean" from unresolved zeros.
  const [counts, setCounts] = useState<{
    duplicates: number | null;
    incomplete: number | null;
    stale: number | null;
    suspect: number | null;
  }>({ duplicates: null, incomplete: null, stale: null, suspect: null });
  const [refreshKey, setRefreshKey] = useState(0);

  const activeTab = searchParams.get("tab") || "duplicates";
  const setActiveTab = (tab: string) => {
    // Leaving Email Templates unmounts it, destroying unsaved edits — confirm
    // first (mirrors the tab's own internal type-switch/refresh dirty guards).
    if (activeTab === "email_templates" && tab !== "email_templates" && emailTemplatesDirty) {
      if (!window.confirm("You have unsaved template changes. Discard them?")) return;
      setEmailTemplatesDirty(false);
    }
    setSearchParams({ tab });
  };

  // Permission gate
  if (!permissions.canEditLeadInfo) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        You do not have permission to access this tool.
      </div>
    );
  }

  const handleRefresh = () => {
    // Only the mounted tab refetches — reset its count so the verdict returns
    // to "scanning" instead of keeping a stale number during the refetch.
    if (activeTab === "duplicates" || activeTab === "incomplete" || activeTab === "stale" || activeTab === "suspect") {
      setCounts((c) => ({ ...c, [activeTab]: null }));
    }
    setRefreshKey((k) => k + 1);
  };

  const countValues = [counts.duplicates, counts.incomplete, counts.stale, counts.suspect];
  const resolvedChecks = countValues.filter((v) => v !== null).length;
  const scanning = resolvedChecks < countValues.length;
  const allClean = !scanning && countValues.every((v) => v === 0);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-[#4F46E5]" />
            <h1
              className="text-2xl md:text-3xl font-bold text-[#4F46E5]"
              style={{ fontFamily: "Montserrat" }}
            >
              Nurturing Leads
            </h1>
          </div>
          <p className="text-muted-foreground mt-1">
            Keep your lead database clean, complete, and duplicate-free.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/leads")}>
            Back to Leads
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-3">
        {(counts.duplicates ?? 0) > 0 && (
          <Badge variant="destructive" className="text-sm px-3 py-1">
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            {counts.duplicates} duplicate group{counts.duplicates !== 1 ? "s" : ""}
          </Badge>
        )}
        {(counts.incomplete ?? 0) > 0 && (
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-sm px-3 py-1">
            <UserX className="h-3.5 w-3.5 mr-1.5" />
            {counts.incomplete} incomplete
          </Badge>
        )}
        {(counts.stale ?? 0) > 0 && (
          <Badge variant="secondary" className="text-sm px-3 py-1">
            <Clock className="h-3.5 w-3.5 mr-1.5" />
            {counts.stale} stale
          </Badge>
        )}
        {(counts.suspect ?? 0) > 0 && (
          <Badge className="bg-red-100 text-red-800 hover:bg-red-100 text-sm px-3 py-1">
            <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
            {counts.suspect} for review
          </Badge>
        )}
        {scanning && (
          // Counts only resolve when a tab mounts, so this is not "work in flight" —
          // it honestly reports how many checks have run and how to run the rest.
          <Badge variant="outline" className="text-sm px-3 py-1 font-normal text-muted-foreground">
            {resolvedChecks}/4 checks run — open each tab to scan the rest
          </Badge>
        )}
        {allClean && (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-sm px-3 py-1">
            Database is clean
          </Badge>
        )}
      </div>

      {/* Tabs — the 5-trigger strip is wider than a phone, so it scrolls in place
          instead of getting clipped by MainLayout's overflow-x-hidden */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto">
          <TabsList className="w-max">
            <TabsTrigger value="duplicates" className="gap-1.5">
              <Copy className="h-4 w-4" />
              Duplicates
            </TabsTrigger>
            <TabsTrigger value="incomplete" className="gap-1.5">
              <UserX className="h-4 w-4" />
              Incomplete
            </TabsTrigger>
            <TabsTrigger value="stale" className="gap-1.5">
              <Clock className="h-4 w-4" />
              Stale
            </TabsTrigger>
            <TabsTrigger value="suspect" className="gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              For Review
            </TabsTrigger>
            <TabsTrigger value="email_templates" className="gap-1.5">
              <Mail className="h-4 w-4" />
              Email Templates
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="duplicates" className="mt-4">
          <DuplicatesTab
            refreshKey={refreshKey}
            onCountChange={(n) => setCounts((c) => ({ ...c, duplicates: n }))}
          />
        </TabsContent>
        <TabsContent value="incomplete" className="mt-4">
          <IncompleteTab
            refreshKey={refreshKey}
            onCountChange={(n) => setCounts((c) => ({ ...c, incomplete: n }))}
          />
        </TabsContent>
        <TabsContent value="stale" className="mt-4">
          <StaleTab
            refreshKey={refreshKey}
            onCountChange={(n) => setCounts((c) => ({ ...c, stale: n }))}
          />
        </TabsContent>
        <TabsContent value="suspect" className="mt-4">
          <SuspectTab
            refreshKey={refreshKey}
            onCountChange={(n) => setCounts((c) => ({ ...c, suspect: n }))}
          />
        </TabsContent>
        <TabsContent value="email_templates" className="mt-4">
          <EmailTemplatesTab refreshKey={refreshKey} onDirtyChange={setEmailTemplatesDirty} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default LeadHygiene;
