import React, { useState, useEffect, useCallback, useRef } from "react";
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
  ArrowUp,
  ArrowDown,
  Upload,
  Download,
  Sparkles,
  Building2,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { format, addDays, startOfDay } from "date-fns";
import { LeadStatusBadge } from "@/components/leads/LeadStatusBadge";
import { LeadForm } from "@/components/leads/LeadForm";
import { CsvImportDialog, type PropertyInfo } from "@/components/leads/CsvImportDialog";
import LeadFilterPills, { ActiveFilters, FilterCounts } from "@/components/leads/LeadFilterPills";
import { LeadTagChips } from "@/components/leads/LeadTagChips";
import { LEAD_TAGS_DISPLAY_EMBED, formatTagAddress, mapEmbeddedTags } from "@/lib/leadTags";
import type { Tables } from "@/integrations/supabase/types";

// Agent name mapping — 6 canonical agents across 4 departments
// Qualification: Aaron (inbound), Esther (email), Nehemiah (analyst)
// Leasing: Elijah (consultant)
// Closing: Samuel | System: Zacchaeus
const AGENT_BIBLICAL_NAMES: Record<string, string> = {
  // Canonical agent keys
  aaron: "Aaron",
  esther: "Esther",
  nehemiah: "Nehemiah",
  elijah: "Elijah",
  samuel: "Samuel",
  zacchaeus: "Zacchaeus",
  // Legacy DB agent_keys → mapped to the 6 canonical agents
  main_inbound: "Aaron",
  hemlane_parser: "Esther",
  scoring: "Nehemiah",
  transcript_analyst: "Nehemiah",
  task_dispatcher: "Nehemiah",
  recapture: "Elijah",
  showing_confirmation: "Samuel",
  conversion_predictor: "Nehemiah",
  insight_generator: "Nehemiah",
  report_generator: "Nehemiah",
  doorloop_pull: "Samuel",
  cost_tracker: "Zacchaeus",
  // Legacy hyphen-format keys
  "twilio-inbound": "Aaron",
  "hemlane-parser": "Esther",
  "transcript-analyst": "Nehemiah",
  "task-dispatcher": "Nehemiah",
  "showing-confirmation": "Samuel",
  "conversion-predictor": "Nehemiah",
  "insight-generator": "Nehemiah",
  "report-generator": "Nehemiah",
  "doorloop-pull": "Samuel",
  "cost-tracker": "Zacchaeus",
  // Legacy task types
  no_show_followup: "Samuel",
  no_show_follow_up: "Samuel",
  post_showing: "Samuel",
  "noshow-followup": "Samuel",
  "post-showing": "Samuel",
  campaign: "Elijah",
  welcome_sequence: "Elijah",
  "campaign-orchestrator": "Nehemiah",
  "welcome-sequence": "Elijah",
  "notification-dispatcher": "Nehemiah",
  "compliance-check": "Nehemiah",
  "sheets-backup": "Nehemiah",
  "smart-matcher": "Nehemiah",
};

type Lead = Tables<"leads">;
type AgentTask = Tables<"agent_tasks">;
// Only the columns the list renders for a lead's next action — keeps the
// agent_tasks fetch off select("*") (which shipped the unused context jsonb).
type NextActionTask = Pick<AgentTask, "lead_id" | "agent_type" | "action_type" | "scheduled_for">;

interface LeadWithProperty extends Lead {
  lead_property_interests?: {
    property_id: string;
    last_interest_at: string | null;
    properties: { address: string; unit_number: string | null; city: string | null } | null;
  }[] | null;
  nextAction?: NextActionTask | null;
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

// Source filter options — ordered by real prevalence. 'hemlane' is 78% of all
// leads and was previously unselectable; the dead voice/SMS-era sources
// (inbound_call, sms) are dropped since those channels were removed and always
// returned an empty table.
const LEAD_SOURCES = [
  { value: "all", label: "All Sources" },
  { value: "hemlane", label: "Hemlane" },
  { value: "hemlane_email", label: "Hemlane Email" },
  { value: "campaign", label: "Campaign" },
  { value: "website", label: "Website" },
  { value: "manual", label: "Manual" },
  { value: "zillow", label: "Zillow" },
  { value: "referral", label: "Referral" },
  { value: "csv_import", label: "CSV Import" },
];

const ITEMS_PER_PAGE = 20;

type SortField = "full_name" | "status" | "created_at" | "last_contact_at";
type SortDirection = "asc" | "desc";

const DEFAULT_FILTERS: ActiveFilters = {
  humanControlled: false,
  moveInSoon: false,
  section8: false,
  hasShowing: false,
  applicant: false,
};

const DEFAULT_COUNTS: FilterCounts = {
  humanControlled: 0,
  moveInSoon: 0,
  section8: 0,
  hasShowing: 0,
  applicant: 0,
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
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [properties, setProperties] = useState<PropertyInfo[]>([]);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>(() => {
    if (filterParam === "human_controlled") return { ...DEFAULT_FILTERS, humanControlled: true };
    return DEFAULT_FILTERS;
  });
  const [filterCounts, setFilterCounts] = useState<FilterCounts>(DEFAULT_COUNTS);
  const [searchQuery, setSearchQuery] = useState("");
  // Debounced copy of the search box — the fetch effect keys off this so each
  // keystroke doesn't fire a full count-exact query over the whole leads table.
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Sorting
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // IDs of leads with active showings (for filter)
  const [leadsWithShowings, setLeadsWithShowings] = useState<Set<string>>(new Set());

  // Monotonic id per fetchLeads call — a stale (older) response never commits
  // state over a newer one when responses resolve out of order.
  const fetchSeqRef = useRef(0);

  // Debounce the search input (~300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Handle URL filter changes
  useEffect(() => {
    const filter = searchParams.get("filter");
    if (filter === "human_controlled") {
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
      // Parallel count queries — over ALL org leads (unified totals, 2026-07-19).
      // is_demo IS NOT TRUE matches dashboard_live() so all surfaces agree.
      const completeLeadBase = () =>
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .not("is_demo", "is", true);

      const [humanRes, moveInRes, section8Res, applicantRes] = await Promise.all([
        // Human controlled count
        completeLeadBase().eq("is_human_controlled", true),
        // Move-in soon count
        completeLeadBase()
          .gte("move_in_date", today.toISOString().split("T")[0])
          .lte("move_in_date", in20Days.toISOString().split("T")[0]),
        // Section 8 count (has_voucher = true OR voucher_status = 'active')
        completeLeadBase().or("has_voucher.eq.true,voucher_status.eq.active"),
        // Applicant count — the status-neutral applied_at milestone tag
        completeLeadBase().not("applied_at", "is", null),
      ]);

      // Lead IDs with an active showing — paginate past PostgREST's 1000-row
      // cap so both the "Has Showing" pill count and the server-side id-set
      // filter stay correct as active showings accumulate (an un-ranged select
      // silently truncates at 1000).
      const showingLeadIds = new Set<string>();
      const SHOWINGS_PAGE = 1000;
      for (let from = 0; ; from += SHOWINGS_PAGE) {
        const { data: showingsPage, error: showingsErr } = await supabase
          .from("showings")
          .select("lead_id")
          .eq("organization_id", orgId)
          .in("status", ["scheduled", "confirmed"])
          .order("id", { ascending: true })
          .range(from, from + SHOWINGS_PAGE - 1);
        if (showingsErr) {
          console.error("Failed to fetch showings for filter:", showingsErr.message);
          break;
        }
        const page = showingsPage || [];
        page.forEach((s) => {
          if (s.lead_id) showingLeadIds.add(s.lead_id);
        });
        if (page.length < SHOWINGS_PAGE) break;
      }
      setLeadsWithShowings(showingLeadIds);

      setFilterCounts({
        humanControlled: humanRes.count || 0,
        moveInSoon: moveInRes.count || 0,
        section8: section8Res.count || 0,
        hasShowing: showingLeadIds.size,
        applicant: applicantRes.count || 0,
      });
    } catch (error) {
      console.error("Error fetching filter counts:", error);
    }
  }, [userRecord?.organization_id]);

  useEffect(() => {
    fetchFilterCounts();
  }, [fetchFilterCounts]);

  // Fetch properties for the property filter dropdown
  useEffect(() => {
    const fetchProperties = async () => {
      if (!userRecord?.organization_id) return;
      const { data } = await supabase
        .from("properties")
        .select("id, address, unit_number, city, bedrooms, bathrooms, rent_price")
        .eq("organization_id", userRecord.organization_id)
        .order("address");
      if (data) setProperties(data);
    };
    fetchProperties();
  }, [userRecord?.organization_id]);

  const fetchLeads = async () => {
    if (!userRecord?.organization_id) return;

    const seq = ++fetchSeqRef.current;
    setLoading(true);
    try {
      const today = startOfDay(new Date());
      const in20Days = addDays(today, 20);

      // Select only columns needed for list view. Property-interest tags come
      // from the LPI junction; when filtering by property, an ALIASED !inner
      // embed keeps server-side count/pagination exact (UNIQUE(lead,property)
      // guarantees no parent-row duplication for a single-property filter).
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
          is_human_controlled,
          has_voucher,
          voucher_status,
          move_in_date,
          created_at,
          last_contact_at,
          preferred_language,
          ${LEAD_TAGS_DISPLAY_EMBED}${propertyFilter !== "all" ? ",\n          ipi_filter:lead_property_interests!inner(property_id)" : ""}
        `,
          { count: "exact" }
        )
        .eq("organization_id", userRecord.organization_id)
        // is_demo IS NOT TRUE — same predicate as dashboard_live() so the page
        // total always matches the Dashboard headline.
        .not("is_demo", "is", true);
      // 2026-07-19 (owner decision): the list counts ALL leads — the old
      // completeness/junk filter hid 665 real leads and made this page disagree
      // with every other count in the system. Incomplete leads are still
      // triaged in Nurturing.

      // Apply dropdown filters
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (sourceFilter !== "all") {
        query = query.eq("source", sourceFilter);
      }
      if (propertyFilter !== "all") {
        query = query.eq("ipi_filter.property_id", propertyFilter);
      }

      // Apply toggle filters
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
      // "Has Showing" — apply server-side against the full set of lead IDs with
      // active showings so count/pagination stay correct (not a page-only filter).
      if (activeFilters.hasShowing) {
        query = query.in("id", [...leadsWithShowings]);
      }
      // "Applicant" — the status-neutral applied_at milestone tag.
      if (activeFilters.applicant) {
        query = query.not("applied_at", "is", null);
      }

      // Search filter
      if (debouncedSearch) {
        // Search name + email + phone (sanitized against PostgREST .or() grammar).
        const q = debouncedSearch.replace(/[,()%*]/g, " ").trim();
        const digits = debouncedSearch.replace(/\D/g, "");
        const ors = [
          `full_name.ilike.%${q}%`,
          `first_name.ilike.%${q}%`,
          `last_name.ilike.%${q}%`,
          `email.ilike.%${q}%`,
        ];
        if (digits.length >= 3) ors.push(`phone.ilike.%${digits}%`);
        query = query.or(ors.join(","));
      }

      // Apply sorting — nulls last (Postgres DESC defaults to NULLS FIRST, which
      // buried Last Contact under ~16k blank rows), with id as a stable tiebreaker.
      query = query
        .order(sortField, { ascending: sortDirection === "asc", nullsFirst: false })
        .order("id", { ascending: true });

      // Apply pagination
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      const leadsData = data || [];

      const leadIds = leadsData.map((l: any) => l.id);

      // Fetch next actions for all leads in a single query
      let nextActionsMap: Record<string, NextActionTask> = {};
      if (leadIds.length > 0) {
        // Only the 4 rendered columns (was select("*"), which shipped the
        // context jsonb we never read). Explicit cap at PostgREST's page size;
        // if we ever hit it, the earliest task for some page leads could sort
        // past the cap, so log instead of silently rendering a blank cell.
        const NEXT_ACTION_CAP = 1000;
        const { data: tasksData } = await supabase
          .from("agent_tasks")
          .select("lead_id, agent_type, action_type, scheduled_for")
          .eq("organization_id", userRecord.organization_id)
          .in("lead_id", leadIds)
          .in("status", ["pending", "in_progress", "paused_human_control"])
          .order("scheduled_for", { ascending: true })
          .limit(NEXT_ACTION_CAP);

        // Group by lead_id and take first (earliest) for each
        if (tasksData) {
          if (tasksData.length >= NEXT_ACTION_CAP) {
            console.warn(
              `Next Action lookup hit the ${NEXT_ACTION_CAP}-row cap for ${leadIds.length} leads — some earliest tasks may be missing.`,
            );
          }
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

      // Drop stale responses — only the latest in-flight fetch commits state.
      if (seq !== fetchSeqRef.current) return;

      setLeads(processedLeads);
      setTotalCount(count || 0);
    } catch (error) {
      if (seq !== fetchSeqRef.current) return;
      console.error("Error fetching leads:", error);
      toast.error("Failed to load leads");
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  };

  // The showings id-set only affects the query while the Has Showing filter is
  // active; gating the dep prevents the Set-identity churn from
  // fetchFilterCounts double-fetching the list on mount.
  const showingsDep = activeFilters.hasShowing ? leadsWithShowings : null;

  useEffect(() => {
    fetchLeads();
  }, [
    userRecord?.organization_id,
    statusFilter,
    sourceFilter,
    propertyFilter,
    activeFilters,
    showingsDep,
    debouncedSearch,
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

  const handleExportCsv = async () => {
    if (!userRecord?.organization_id) return;
    setExporting(true);

    try {
      const today = startOfDay(new Date());
      const in20Days = addDays(today, 20);

      // Builds the export query with EXACTLY the same predicates as fetchLeads —
      // the old export carried a NOT-NULL/junk-name filter the list dropped by
      // owner decision (2026-07-19), silently excluding ~587 visible leads.
      // A fresh builder per call because .range() differs per page.
      const buildExportQuery = () => {
        let q = supabase
          .from("leads")
          .select(
            `id, full_name, first_name, last_name, email, phone, status, source, is_human_controlled, has_voucher, voucher_status, move_in_date, created_at, last_contact_at, preferred_language, ${LEAD_TAGS_DISPLAY_EMBED}${propertyFilter !== "all" ? ", ipi_filter:lead_property_interests!inner(property_id)" : ""}`
          )
          .eq("organization_id", userRecord.organization_id)
          .not("is_demo", "is", true);

        if (statusFilter !== "all") q = q.eq("status", statusFilter);
        if (sourceFilter !== "all") q = q.eq("source", sourceFilter);
        if (propertyFilter !== "all") q = q.eq("ipi_filter.property_id", propertyFilter);
        if (activeFilters.humanControlled) q = q.eq("is_human_controlled", true);
        if (activeFilters.moveInSoon) {
          q = q
            .gte("move_in_date", today.toISOString().split("T")[0])
            .lte("move_in_date", in20Days.toISOString().split("T")[0]);
        }
        if (activeFilters.section8) q = q.or("has_voucher.eq.true,voucher_status.eq.active");
        // "Has Showing" — filter server-side against the full set of lead IDs with
        // active showings so the export matches the list view exactly.
        if (activeFilters.hasShowing) {
          q = q.in("id", [...leadsWithShowings]);
        }
        if (activeFilters.applicant) {
          q = q.not("applied_at", "is", null);
        }
        if (debouncedSearch) {
          // Search name + email + phone (sanitized against PostgREST .or() grammar).
          const sq = debouncedSearch.replace(/[,()%*]/g, " ").trim();
          const digits = debouncedSearch.replace(/\D/g, "");
          const ors = [
            `full_name.ilike.%${sq}%`,
            `first_name.ilike.%${sq}%`,
            `last_name.ilike.%${sq}%`,
            `email.ilike.%${sq}%`,
          ];
          if (digits.length >= 3) ors.push(`phone.ilike.%${digits}%`);
          q = q.or(ors.join(","));
        }

        // Same sort as the list, with id tiebreaker so .range() pages never
        // skip/duplicate rows on non-unique sort columns.
        return q
          .order(sortField, { ascending: sortDirection === "asc", nullsFirst: false })
          .order("id", { ascending: true });
      };

      // PostgREST caps un-ranged selects at 1,000 rows — paginate until a short
      // page so the export always contains the FULL filtered set (~18k leads).
      const PAGE_SIZE = 1000;
      const rows: any[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await buildExportQuery().range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        const page = data || [];
        rows.push(...(page as any[]));
        if (page.length < PAGE_SIZE) break;
      }

      if (rows.length === 0) {
        toast.info("No leads to export with current filters");
        return;
      }

      const headers = [
        "Name", "First Name", "Last Name", "Email", "Phone", "Status", "Source",
        "Human Controlled", "Voucher", "Move-in Date",
        "Language", "Created", "Last Contact", "Properties",
      ];

      const escape = (v: string | null | undefined) => {
        if (v == null) return "";
        let s = String(v);
        // Neutralize spreadsheet formula injection (OWASP): lead names/emails come
        // from public forms, so =/+/-/@/tab/CR-leading cells get a ' prefix.
        if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };

      const csvRows = rows.map((l) => [
        escape(l.full_name),
        escape(l.first_name),
        escape(l.last_name),
        escape(l.email),
        escape(l.phone),
        escape(l.status),
        escape(l.source),
        l.is_human_controlled ? "Yes" : "No",
        l.has_voucher ? "Yes" : "No",
        escape(l.move_in_date),
        escape(l.preferred_language),
        l.created_at ? format(new Date(l.created_at), "yyyy-MM-dd") : "",
        l.last_contact_at ? format(new Date(l.last_contact_at), "yyyy-MM-dd") : "",
        escape(mapEmbeddedTags(l as Parameters<typeof mapEmbeddedTags>[0]).map(formatTagAddress).join("; ")),
      ].join(","));

      const csv = [headers.join(","), ...csvRows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`Exported ${rows.length} leads`);
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Failed to export leads");
    } finally {
      setExporting(false);
    }
  };

  const SortableHeader: React.FC<{ field: SortField; children: React.ReactNode; className?: string }> = ({
    field,
    children,
    className: extraClassName,
  }) => {
    const isActive = sortField === field;
    const SortIcon = isActive
      ? sortDirection === "asc" ? ArrowUp : ArrowDown
      : ArrowUpDown;

    return (
      <TableHead
        role="button"
        tabIndex={0}
        aria-sort={isActive ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
        className={`cursor-pointer select-none hover:bg-muted/50 ${extraClassName || ""}`}
        onClick={() => handleSort(field)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleSort(field);
          }
        }}
      >
        <div className="flex items-center gap-1">
          {children}
          <SortIcon className={`h-3 w-3 ${isActive ? "text-[#4F46E5]" : "text-muted-foreground"}`} />
        </div>
      </TableHead>
    );
  };

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
          <Button variant="outline" onClick={handleExportCsv} disabled={exporting}>
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
            ) : (
              <Download className="h-4 w-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">{exporting ? "Exporting..." : "Export"}</span>
          </Button>
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
            <SelectTrigger className="min-h-[44px]">
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
            <SelectTrigger className="min-h-[44px]">
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

          {/* Property */}
          <Select
            value={propertyFilter || "all"}
            onValueChange={(v) => {
              setPropertyFilter(v);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="min-h-[44px]">
              <Building2 className="h-4 w-4 mr-1.5 text-muted-foreground shrink-0" />
              <SelectValue placeholder="Property" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Properties</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.address}{p.unit_number ? ` #${p.unit_number}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Row 2: Toggle Pills + Clean Data */}
        <div className="flex items-center justify-between gap-4">
          <LeadFilterPills
            activeFilters={activeFilters}
            filterCounts={filterCounts}
            onToggleFilter={handleToggleFilter}
            loading={loading}
          />
          <div className="flex items-center gap-2 shrink-0">
            {permissions.canEditLeadInfo && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/leads/nurturing")}
                className="shrink-0"
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                Clean Data
              </Button>
            )}
          </div>
        </div>
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
                {searchQuery || statusFilter !== "all" || sourceFilter !== "all" || propertyFilter !== "all" || Object.values(activeFilters).some(Boolean)
                  ? "Try adjusting your filters."
                  : "Import leads via CSV or create one manually."}
              </p>
              {permissions.canCreateLead && !searchQuery && statusFilter === "all" && sourceFilter === "all" && propertyFilter === "all" && !Object.values(activeFilters).some(Boolean) && (
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
                    <SortableHeader field="status">Status</SortableHeader>
                    <TableHead className="hidden sm:table-cell">Property</TableHead>
                    <SortableHeader field="created_at" className="hidden sm:table-cell">Created</SortableHeader>
                    <SortableHeader field="last_contact_at" className="hidden sm:table-cell">Last Contact</SortableHeader>
                    <TableHead className="hidden sm:table-cell">Next Action</TableHead>
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
                          {lead.is_human_controlled && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Human
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <LeadStatusBadge status={lead.status} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell max-w-[240px]">
                        {lead.lead_property_interests?.length ? (
                          <LeadTagChips tags={mapEmbeddedTags(lead)} max={1} />
                        ) : (
                          <span className="text-muted-foreground text-[13px]">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-[13px]">
                        {lead.created_at
                          ? format(new Date(lead.created_at), "MMM d, yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-[13px]">
                        {lead.last_contact_at
                          ? format(new Date(lead.last_contact_at), "MMM d, yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-[13px]">
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
        <DialogContent className="max-w-2xl w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Lead</DialogTitle>
          </DialogHeader>
          <LeadForm
            onSuccess={() => {
              setFormOpen(false);
              fetchLeads();
              fetchFilterCounts();
            }}
            onCancel={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={() => {
          fetchLeads();
          fetchFilterCounts();
        }}
        properties={properties}
      />
    </div>
  );
};

export default LeadsList;
