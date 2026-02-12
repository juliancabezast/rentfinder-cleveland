import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  UserX,
  Users,
  AlertTriangle,
  ArrowUpDown,
  Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { format, addDays, startOfDay } from "date-fns";
import { ScoreDisplay } from "@/components/leads/ScoreDisplay";
import { LeadStatusBadge } from "@/components/leads/LeadStatusBadge";
import { LeadForm } from "@/components/leads/LeadForm";
import { CsvImportDialog } from "@/components/leads/CsvImportDialog";
import LeadFilterPills, { ActiveFilters, FilterCounts } from "@/components/leads/LeadFilterPills";
import type { Tables } from "@/integrations/supabase/types";

// Biblical agent name mapping — 12 operational agents
const AGENT_BIBLICAL_NAMES: Record<string, string> = {
  // Active agents
  "task-dispatcher": "Nehemiah",
  "scoring": "Daniel",
  "twilio-inbound": "Aaron",
  "bland-call-webhook": "Deborah",
  "sms-inbound": "Ruth",
  "recapture": "Elijah",
  "showing-confirmation": "Samuel",
  "noshow-followup": "Samuel",
  "post-showing": "Samuel",
  "transcript-analyst": "Isaiah",
  "conversion-predictor": "Solomon",
  "insight-generator": "Moses",
  "report-generator": "David",
  "doorloop-pull": "Ezra",
  "doorloop-push": "Ezra",
  "cost-tracker": "Zacchaeus",
  "health-checker": "Zacchaeus",
  "hemlane-parser": "Esther",
  // Legacy mappings (tasks created before reorganization)
  "welcome-sequence": "Elijah",
  "campaign-orchestrator": "Nehemiah",
  "campaign-voice": "Elijah",
  "notification-dispatcher": "Nehemiah",
  "compliance-check": "Nehemiah",
  "sheets-backup": "Ezra",
  "smart-matcher": "Deborah",
};

type Lead = Tables<"leads">;
type AgentTask = Tables<"agent_tasks">;

interface LeadWithProperty extends Lead {
  properties?: { address: string; unit_number: string | null } | null;
  nextAction?: AgentTask | null;
}

const LEAD_STATUSES = [
  { value: "all", label: "All Statuses" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "engaged", label: "Engaged" },
  { value: "nurturing", label: "Nurturing" },
  { value: "qualified", label: "Qualified" },
  { value: "showing_scheduled", label: "Showing Scheduled" },
  { value: "showed", label: "Showed" },
  { value: "in_application", label: "In Application" },
  { value: "lost", label: "Lost" },
  { value: "converted", label: "Converted" },
];

const LEAD_SOURCES = [
  { value: "all", label: "All Sources" },
  { value: "inbound_call", label: "Inbound Call" },
  { value: "hemlane_email", label: "Hemlane Email" },
  { value: "website", label: "Website" },
  { value: "referral", label: "Referral" },
  { value: "manual", label: "Manual" },
  { value: "sms", label: "SMS" },
  { value: "campaign", label: "Campaign" },
  { value: "csv_import", label: "CSV Import" },
];

const ITEMS_PER_PAGE = 20;

type SortField = "full_name" | "lead_score" | "status" | "created_at" | "last_contact_at";
type SortDirection = "asc" | "desc";

const DEFAULT_FILTERS: ActiveFilters = {
  priority: false,
  humanControlled: false,
  moveInSoon: false,
  section8: false,
  hasShowing: false,
};

const DEFAULT_COUNTS: FilterCounts = {
  priority: 0,
  humanControlled: 0,
  moveInSoon: 0,
  section8: 0,
  hasShowing: 0,
};

const LeadsList: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { userRecord } = useAuth();
  const permissions = usePermissions();

  const [leads, setLeads] = useState<LeadWithProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  // Initialize filters from URL params
  const filterParam = searchParams.get("filter");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>(() => {
    if (filterParam === "priority") return { ...DEFAULT_FILTERS, priority: true };
    if (filterParam === "human_controlled") return { ...DEFAULT_FILTERS, humanControlled: true };
    return DEFAULT_FILTERS;
  });
  const [filterCounts, setFilterCounts] = useState<FilterCounts>(DEFAULT_COUNTS);
  const [searchQuery, setSearchQuery] = useState("");

  // Sorting
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // IDs of leads with active showings (for filter)
  const [leadsWithShowings, setLeadsWithShowings] = useState<Set<string>>(new Set());

  // Handle URL filter changes
  useEffect(() => {
    const filter = searchParams.get("filter");
    if (filter === "priority") {
      setActiveFilters({ ...DEFAULT_FILTERS, priority: true });
    } else if (filter === "human_controlled") {
      setActiveFilters({ ...DEFAULT_FILTERS, humanControlled: true });
    }
  }, [searchParams]);

  // Fetch filter counts (runs once on load and when base filters change)
  const fetchFilterCounts = useCallback(async () => {
    if (!userRecord?.organization_id) return;

    const orgId = userRecord.organization_id;
    const today = startOfDay(new Date());
    const in20Days = addDays(today, 20);

    try {
      // Parallel count queries
      const [priorityRes, humanRes, moveInRes, section8Res, showingsRes] = await Promise.all([
        // Priority count
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("is_priority", true),
        // Human controlled count
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("is_human_controlled", true),
        // Move-in soon count
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .gte("move_in_date", today.toISOString().split("T")[0])
          .lte("move_in_date", in20Days.toISOString().split("T")[0]),
        // Section 8 count (has_voucher = true OR voucher_status = 'active')
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .or("has_voucher.eq.true,voucher_status.eq.active"),
        // Get lead IDs with active showings
        supabase
          .from("showings")
          .select("lead_id")
          .eq("organization_id", orgId)
          .in("status", ["scheduled", "confirmed"]),
      ]);

      // Process showings to get unique lead IDs
      const showingLeadIds = new Set<string>();
      if (showingsRes.data) {
        showingsRes.data.forEach((s) => {
          if (s.lead_id) showingLeadIds.add(s.lead_id);
        });
      }
      setLeadsWithShowings(showingLeadIds);

      setFilterCounts({
        priority: priorityRes.count || 0,
        humanControlled: humanRes.count || 0,
        moveInSoon: moveInRes.count || 0,
        section8: section8Res.count || 0,
        hasShowing: showingLeadIds.size,
      });
    } catch (error) {
      console.error("Error fetching filter counts:", error);
    }
  }, [userRecord?.organization_id]);

  useEffect(() => {
    fetchFilterCounts();
  }, [fetchFilterCounts]);

  const fetchLeads = async () => {
    if (!userRecord?.organization_id) return;

    setLoading(true);
    try {
      const today = startOfDay(new Date());
      const in20Days = addDays(today, 20);

      // Select only columns needed for list view
      let query = supabase
        .from("leads")
        .select(
          `
          id,
          full_name,
          first_name,
          last_name,
          email,
          status,
          source,
          lead_score,
          is_priority,
          is_human_controlled,
          has_voucher,
          voucher_status,
          move_in_date,
          created_at,
          last_contact_at,
          interested_property_id,
          preferred_language,
          properties:interested_property_id (address, unit_number)
        `,
          { count: "exact" }
        )
        .eq("organization_id", userRecord.organization_id);

      // Apply dropdown filters
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (sourceFilter !== "all") {
        query = query.eq("source", sourceFilter);
      }

      // Apply toggle filters
      if (activeFilters.priority) {
        query = query.eq("is_priority", true);
      }
      if (activeFilters.humanControlled) {
        query = query.eq("is_human_controlled", true);
      }
      if (activeFilters.moveInSoon) {
        query = query
          .gte("move_in_date", today.toISOString().split("T")[0])
          .lte("move_in_date", in20Days.toISOString().split("T")[0]);
      }
      if (activeFilters.section8) {
        query = query.or("has_voucher.eq.true,voucher_status.eq.active");
      }

      // Search filter
      if (searchQuery) {
        query = query.or(
          `full_name.ilike.%${searchQuery}%,first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%`
        );
      }

      // Apply sorting
      query = query.order(sortField, { ascending: sortDirection === "asc" });

      // Apply pagination
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      let leadsData = data || [];

      // If "Has Showing" filter is active, filter client-side
      if (activeFilters.hasShowing) {
        leadsData = leadsData.filter((l: any) => leadsWithShowings.has(l.id));
      }

      const leadIds = leadsData.map((l: any) => l.id);

      // Fetch next actions for all leads in a single query
      let nextActionsMap: Record<string, AgentTask> = {};
      if (leadIds.length > 0) {
        const { data: tasksData } = await supabase
          .from("agent_tasks")
          .select("*")
          .in("lead_id", leadIds)
          .in("status", ["pending", "in_progress", "paused_human_control"])
          .order("scheduled_for", { ascending: true });

        // Group by lead_id and take first (earliest) for each
        if (tasksData) {
          for (const task of tasksData) {
            if (!nextActionsMap[task.lead_id]) {
              nextActionsMap[task.lead_id] = task;
            }
          }
        }
      }

      // Merge next actions into leads
      const processedLeads = leadsData.map((lead: any) => ({
        ...lead,
        nextAction: nextActionsMap[lead.id] || null,
      }));

      setLeads(processedLeads);
      // Adjust count for client-side filtering
      setTotalCount(activeFilters.hasShowing ? processedLeads.length : (count || 0));
    } catch (error) {
      console.error("Error fetching leads:", error);
      toast.error("Failed to load leads");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [
    userRecord?.organization_id,
    statusFilter,
    sourceFilter,
    activeFilters,
    leadsWithShowings,
    searchQuery,
    sortField,
    sortDirection,
    currentPage,
  ]);

  const handleToggleFilter = (filter: keyof ActiveFilters) => {
    setActiveFilters((prev) => ({ ...prev, [filter]: !prev[filter] }));
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const SortableHeader: React.FC<{ field: SortField; children: React.ReactNode }> = ({
    field,
    children,
  }) => (
    <TableHead
      className="cursor-pointer select-none hover:bg-muted/50"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
      </div>
    </TableHead>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" />
            Leads
          </h1>
          <p className="text-muted-foreground">
            Manage your lead pipeline ({totalCount} total)
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
          {permissions.canCreateLead && (
            <>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Import CSV</span>
              </Button>
              <Button onClick={() => setFormOpen(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold">
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Add Lead</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card rounded-xl p-4 mb-6 space-y-4">
        {/* Row 1: Search + Dropdowns */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Search */}
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          {/* Status */}
          <Select
            value={statusFilter || "all"}
            onValueChange={(v) => {
              setStatusFilter(v);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {LEAD_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Source */}
          <Select
            value={sourceFilter || "all"}
            onValueChange={(v) => {
              setSourceFilter(v);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              {LEAD_SOURCES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Row 2: Toggle Pills */}
        <LeadFilterPills
          activeFilters={activeFilters}
          filterCounts={filterCounts}
          onToggleFilter={handleToggleFilter}
          loading={loading}
        />
      </div>

      {/* Table */}
      <Card variant="glass">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <UserX className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No leads found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || statusFilter !== "all" || sourceFilter !== "all" || Object.values(activeFilters).some(Boolean)
                  ? "Try adjusting your filters."
                  : "Import leads via CSV or create one manually."}
              </p>
              {permissions.canCreateLead && !searchQuery && statusFilter === "all" && sourceFilter === "all" && !Object.values(activeFilters).some(Boolean) && (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setImportOpen(true)}>
                    <Upload className="h-4 w-4 mr-2" />
                    Import CSV
                  </Button>
                  <Button onClick={() => setFormOpen(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Lead
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="-mx-4 px-4 overflow-x-auto sm:mx-0 sm:px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHeader field="full_name">Name</SortableHeader>
                    <SortableHeader field="lead_score">Score</SortableHeader>
                    <SortableHeader field="status">Status</SortableHeader>
                    <TableHead>Property</TableHead>
                    <SortableHeader field="created_at">Created</SortableHeader>
                    <SortableHeader field="last_contact_at">Last Contact</SortableHeader>
                    <TableHead>Next Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead, index) => (
                    <TableRow
                      key={lead.id}
                      className="cursor-pointer hover:bg-muted/50 animate-fade-up"
                      style={{
                        animationDelay: `${Math.min(index * 0.03, 0.3)}s`,
                        animationFillMode: "both",
                      }}
                      onClick={() => navigate(`/leads/${lead.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {lead.full_name ||
                              [lead.first_name, lead.last_name]
                                .filter(Boolean)
                                .join(" ") ||
                              "Unknown"}
                          </span>
                          {lead.is_priority && (
                            <Badge className="bg-amber-500 hover:bg-amber-600">
                              Priority
                            </Badge>
                          )}
                          {lead.is_human_controlled && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Human
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <ScoreDisplay
                          score={lead.lead_score || 50}
                          size="sm"
                          showPriorityBadge={false}
                        />
                      </TableCell>
                      <TableCell>
                        <LeadStatusBadge status={lead.status} />
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground text-[13px]">
                        {lead.properties?.address
                          ? `${lead.properties.address}${
                              lead.properties.unit_number
                                ? ` #${lead.properties.unit_number}`
                                : ""
                            }`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-[13px]">
                        {lead.created_at
                          ? format(new Date(lead.created_at), "MMM d, yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-[13px]">
                        {lead.last_contact_at
                          ? format(new Date(lead.last_contact_at), "MMM d, yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-[13px]">
                        {lead.nextAction ? (
                          <span className="text-foreground whitespace-nowrap">
                            {format(new Date(lead.nextAction.scheduled_for), "MMM d")}
                            <span className="text-muted-foreground"> · </span>
                            <span className="font-medium">
                              {AGENT_BIBLICAL_NAMES[lead.nextAction.agent_type] || lead.nextAction.agent_type}
                            </span>
                            <span className="text-muted-foreground"> · </span>
                            <span className="capitalize">{lead.nextAction.action_type.replace(/_/g, " ")}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Lead Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Lead</DialogTitle>
          </DialogHeader>
          <LeadForm
            onSuccess={() => {
              setFormOpen(false);
              fetchLeads();
            }}
            onCancel={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={fetchLeads}
      />
    </div>
  );
};

export default LeadsList;
