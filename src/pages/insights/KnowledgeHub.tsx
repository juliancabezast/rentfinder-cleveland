import React, { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Brain, FileText, MessageSquare, Download } from "lucide-react";
import { toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  InsightFilters,
  InsightFiltersState,
  getDefaultFilters,
} from "@/components/insights/InsightFilters";
import { AIChat } from "@/components/insights/AIChat";
import {
  LeadsResultsTable,
  LeadResult,
} from "@/components/insights/LeadsResultsTable";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Tables } from "@/integrations/supabase/types";
import { DocumentsTab } from "@/components/insights/DocumentsTab";

type SortField = "full_name" | "lead_score" | "created_at" | "last_contact_at";
type SortDirection = "asc" | "desc";
type Lead = Tables<"leads">;

const PAGE_SIZE = 25;

const KnowledgeHub: React.FC = () => {
  const { userRecord } = useAuth();

  // Filters state
  const [filters, setFilters] = useState<InsightFiltersState>(getDefaultFilters());
  const [appliedFilters, setAppliedFilters] = useState<InsightFiltersState>(getDefaultFilters());

  // Properties for filter dropdown
  const [properties, setProperties] = useState<{ id: string; address: string }[]>([]);

  // Results state
  const [leads, setLeads] = useState<LeadResult[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [isExporting, setIsExporting] = useState(false);

  // Fetch properties for filter dropdown
  useEffect(() => {
    const fetchProperties = async () => {
      if (!userRecord?.organization_id) return;

      const { data } = await supabase
        .from("properties")
        .select("id, address")
        .eq("organization_id", userRecord.organization_id)
        .order("address");

      if (data) {
        setProperties(data);
      }
    };

    fetchProperties();
  }, [userRecord?.organization_id]);

  // Fetch leads with current filters and pagination
  const fetchLeads = useCallback(async () => {
    if (!userRecord?.organization_id) return;

    setLoading(true);

    try {
      let query = supabase
        .from("leads")
        .select(
          `id, full_name, phone, source, status, lead_score, interested_property_id,
           has_voucher, preferred_language, created_at, last_contact_at`,
          { count: "exact" }
        )
        .eq("organization_id", userRecord.organization_id);

      // Apply filters
      if (appliedFilters.dateRange?.from) {
        query = query.gte("created_at", appliedFilters.dateRange.from.toISOString());
      }
      if (appliedFilters.dateRange?.to) {
        query = query.lte("created_at", appliedFilters.dateRange.to.toISOString());
      }
      if (appliedFilters.statuses.length > 0) {
        query = query.in("status", appliedFilters.statuses);
      }
      if (appliedFilters.sources.length > 0) {
        query = query.in("source", appliedFilters.sources);
      }
      if (appliedFilters.scoreMin) {
        query = query.gte("lead_score", parseInt(appliedFilters.scoreMin));
      }
      if (appliedFilters.scoreMax) {
        query = query.lte("lead_score", parseInt(appliedFilters.scoreMax));
      }
      if (appliedFilters.language !== "all") {
        query = query.eq("preferred_language", appliedFilters.language);
      }
      if (appliedFilters.hasVoucher === "yes") {
        query = query.eq("has_voucher", true);
      } else if (appliedFilters.hasVoucher === "no") {
        query = query.eq("has_voucher", false);
      }
      if (appliedFilters.propertyId !== "all") {
        query = query.eq("interested_property_id", appliedFilters.propertyId);
      }
      if (appliedFilters.zipCode) {
        query = query.contains("interested_zip_codes", [appliedFilters.zipCode]);
      }
      if (appliedFilters.priorityOnly) {
        query = query.eq("is_priority", true);
      }

      const { data, count, error } = await query
        .order(sortField, { ascending: sortDirection === "asc" })
        .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

      if (error) throw error;

      const propertyIds = (data || [])
        .filter((l: Lead) => l.interested_property_id)
        .map((l: Lead) => l.interested_property_id as string);

      let propertyMap = new Map<string, string>();
      if (propertyIds.length > 0) {
        const { data: propertyData } = await supabase
          .from("properties")
          .select("id, address")
          .in("id", propertyIds);

        if (propertyData) {
          propertyData.forEach((p) => propertyMap.set(p.id, p.address));
        }
      }

      const leadsWithProperties: LeadResult[] = (data || []).map((lead: Lead) => ({
        id: lead.id,
        full_name: lead.full_name,
        phone: lead.phone,
        source: lead.source,
        status: lead.status,
        lead_score: lead.lead_score,
        interested_property_id: lead.interested_property_id,
        has_voucher: lead.has_voucher,
        preferred_language: lead.preferred_language,
        created_at: lead.created_at || "",
        last_contact_at: lead.last_contact_at,
        property_address: lead.interested_property_id
          ? propertyMap.get(lead.interested_property_id)
          : undefined,
      }));

      setLeads(leadsWithProperties);
      setTotalCount(count || 0);
    } catch (err: any) {
      console.error("Error fetching leads:", err);
      toast.error("Failed to fetch leads");
    } finally {
      setLoading(false);
    }
  }, [userRecord?.organization_id, appliedFilters, sortField, sortDirection, currentPage]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleApplyFilters = () => {
    setAppliedFilters({ ...filters });
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    const defaults = getDefaultFilters();
    setFilters(defaults);
    setAppliedFilters(defaults);
    setCurrentPage(1);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
    setCurrentPage(1);
  };

  const handleExport = async () => {
    if (!userRecord?.organization_id) return;

    setIsExporting(true);

    try {
      let query = supabase
        .from("leads")
        .select("*")
        .eq("organization_id", userRecord.organization_id);

      if (appliedFilters.dateRange?.from) {
        query = query.gte("created_at", appliedFilters.dateRange.from.toISOString());
      }
      if (appliedFilters.dateRange?.to) {
        query = query.lte("created_at", appliedFilters.dateRange.to.toISOString());
      }
      if (appliedFilters.statuses.length > 0) {
        query = query.in("status", appliedFilters.statuses);
      }
      if (appliedFilters.sources.length > 0) {
        query = query.in("source", appliedFilters.sources);
      }
      if (appliedFilters.scoreMin) {
        query = query.gte("lead_score", parseInt(appliedFilters.scoreMin));
      }
      if (appliedFilters.scoreMax) {
        query = query.lte("lead_score", parseInt(appliedFilters.scoreMax));
      }
      if (appliedFilters.language !== "all") {
        query = query.eq("preferred_language", appliedFilters.language);
      }
      if (appliedFilters.hasVoucher === "yes") {
        query = query.eq("has_voucher", true);
      } else if (appliedFilters.hasVoucher === "no") {
        query = query.eq("has_voucher", false);
      }
      if (appliedFilters.propertyId !== "all") {
        query = query.eq("interested_property_id", appliedFilters.propertyId);
      }
      if (appliedFilters.zipCode) {
        query = query.contains("interested_zip_codes", [appliedFilters.zipCode]);
      }
      if (appliedFilters.priorityOnly) {
        query = query.eq("is_priority", true);
      }

      const { data: allLeads, error } = await query.order("created_at", {
        ascending: false,
      });

      if (error) throw error;
      if (!allLeads || allLeads.length === 0) {
        toast.error("No leads to export");
        setIsExporting(false);
        return;
      }

      const propertyIds = allLeads
        .filter((l: Lead) => l.interested_property_id)
        .map((l: Lead) => l.interested_property_id as string);

      let propertyMap = new Map<string, string>();
      if (propertyIds.length > 0) {
        const { data: propertyData } = await supabase
          .from("properties")
          .select("id, address")
          .in("id", propertyIds);

        if (propertyData) {
          propertyData.forEach((p) => propertyMap.set(p.id, p.address));
        }
      }

      const leadIds = allLeads.map((l: Lead) => l.id);
      const { data: calls } = await supabase
        .from("calls")
        .select("lead_id, summary, started_at")
        .in("lead_id", leadIds)
        .order("started_at", { ascending: false });

      const callSummaryMap = new Map<string, string>();
      if (calls) {
        calls.forEach((call) => {
          if (call.lead_id && !callSummaryMap.has(call.lead_id)) {
            callSummaryMap.set(call.lead_id, call.summary || "");
          }
        });
      }

      const headers = [
        "full_name",
        "phone",
        "email",
        "source",
        "status",
        "lead_score",
        "property_address",
        "has_voucher",
        "preferred_language",
        "created_at",
        "last_contact_at",
        "budget_min",
        "budget_max",
        "move_in_date",
        "latest_call_summary",
      ];

      const csvRows = [
        headers.join(","),
        ...allLeads.map((lead: Lead) => {
          const propertyAddress = lead.interested_property_id
            ? propertyMap.get(lead.interested_property_id) || ""
            : "";
          const callSummary = callSummaryMap.get(lead.id) || "";

          return [
            `"${(lead.full_name || "").replace(/"/g, '""')}"`,
            `"${lead.phone}"`,
            `"${lead.email || ""}"`,
            `"${lead.source}"`,
            `"${lead.status}"`,
            lead.lead_score ?? "",
            `"${propertyAddress.replace(/"/g, '""')}"`,
            lead.has_voucher ? "Yes" : "No",
            `"${lead.preferred_language || ""}"`,
            `"${lead.created_at || ""}"`,
            `"${lead.last_contact_at || ""}"`,
            lead.budget_min ?? "",
            lead.budget_max ?? "",
            `"${lead.move_in_date || ""}"`,
            `"${callSummary.replace(/"/g, '""').replace(/\n/g, " ")}"`,
          ].join(",");
        }),
      ];

      const csvContent = csvRows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `leads-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success(`Exported ${allLeads.length} leads`);
    } catch (err: any) {
      console.error("Export error:", err);
      toast.error("Failed to export leads");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Brain className="h-6 w-6" />
          Knowledge Hub
        </h1>
        <p className="text-muted-foreground">
          Manage documents, explore data, and get AI-powered insights
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="documents" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Documents</span>
          </TabsTrigger>
          <TabsTrigger value="chat" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">AI Chat</span>
          </TabsTrigger>
          <TabsTrigger value="export" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents">
          <DocumentsTab />
        </TabsContent>

        <TabsContent value="chat">
          <div className="h-[calc(100vh-280px)] min-h-[500px]">
            <AIChat />
          </div>
        </TabsContent>

        <TabsContent value="export" className="space-y-4">
          <InsightFilters
            filters={filters}
            onFiltersChange={setFilters}
            properties={properties}
            onApply={handleApplyFilters}
            onClear={handleClearFilters}
            onExport={handleExport}
            isExporting={isExporting}
          />

          <LeadsResultsTable
            leads={leads}
            loading={loading}
            totalCount={totalCount}
            currentPage={currentPage}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={handleSort}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default KnowledgeHub;
