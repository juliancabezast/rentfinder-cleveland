import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Sparkles, Copy, UserX, Clock, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { DuplicatesTab } from "@/components/leads/nurturing/DuplicatesTab";
import { IncompleteTab } from "@/components/leads/nurturing/IncompleteTab";
import { StaleTab } from "@/components/leads/nurturing/StaleTab";
import { SuspectTab } from "@/components/leads/nurturing/SuspectTab";

const LeadHygiene: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { userRecord } = useAuth();
  const permissions = usePermissions();

  const [counts, setCounts] = useState({ duplicates: 0, incomplete: 0, stale: 0, suspect: 0 });
  const [refreshKey, setRefreshKey] = useState(0);

  const activeTab = searchParams.get("tab") || "duplicates";
  const setActiveTab = (tab: string) => setSearchParams({ tab });

  // Permission gate
  if (!permissions.canEditLeadInfo) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        You do not have permission to access this tool.
      </div>
    );
  }

  const handleRefresh = () => setRefreshKey((k) => k + 1);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-[#370d4b]" />
            <h1
              className="text-2xl md:text-3xl font-bold text-[#370d4b]"
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
        {counts.duplicates > 0 && (
          <Badge variant="destructive" className="text-sm px-3 py-1">
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            {counts.duplicates} duplicate group{counts.duplicates !== 1 ? "s" : ""}
          </Badge>
        )}
        {counts.incomplete > 0 && (
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-sm px-3 py-1">
            <UserX className="h-3.5 w-3.5 mr-1.5" />
            {counts.incomplete} incomplete
          </Badge>
        )}
        {counts.stale > 0 && (
          <Badge variant="secondary" className="text-sm px-3 py-1">
            <Clock className="h-3.5 w-3.5 mr-1.5" />
            {counts.stale} stale
          </Badge>
        )}
        {counts.suspect > 0 && (
          <Badge className="bg-red-100 text-red-800 hover:bg-red-100 text-sm px-3 py-1">
            <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
            {counts.suspect} for review
          </Badge>
        )}
        {counts.duplicates === 0 && counts.incomplete === 0 && counts.stale === 0 && counts.suspect === 0 && (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-sm px-3 py-1">
            Database is clean
          </Badge>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
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
        </TabsList>

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
      </Tabs>
    </div>
  );
};

export default LeadHygiene;
