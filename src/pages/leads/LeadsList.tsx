import React, { useState, useEffect } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  AlertTriangle,
  ArrowUpDown,
  Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ScoreDisplay } from "@/components/leads/ScoreDisplay";
import { LeadStatusBadge } from "@/components/leads/LeadStatusBadge";
import { LeadForm } from "@/components/leads/LeadForm";
import { CsvImportDialog } from "@/components/leads/CsvImportDialog";
import { PredictionBadge } from "@/components/leads/PredictionCard";
import type { Tables } from "@/integrations/supabase/types";

type Lead = Tables<"leads">;

interface LeadWithProperty extends Lead {
  properties?: { address: string; unit_number: string | null } | null;
  lead_predictions?: { conversion_probability: number; predicted_outcome: string } | null;
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

const PREDICTION_OUTCOMES = [
  { value: "all", label: "All Predictions" },
  { value: "likely_convert", label: "Likely to Convert" },
  { value: "needs_nurturing", label: "Needs Nurturing" },
  { value: "likely_lost", label: "Likely Lost" },
];

const ITEMS_PER_PAGE = 20;

type SortField = "full_name" | "lead_score" | "status" | "created_at" | "last_contact_at" | "conversion_probability";
type SortDirection = "asc" | "desc";

const LeadsList: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { userRecord } = useAuth();
  const permissions = usePermissions();
  const { toast } = useToast();

  const [leads, setLeads] = useState<LeadWithProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  // Initialize filters from URL params
  const filterParam = searchParams.get("filter");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [predictionFilter, setPredictionFilter] = useState("all");
  const [priorityOnly, setPriorityOnly] = useState(filterParam === "priority");
  const [humanControlledOnly, setHumanControlledOnly] = useState(filterParam === "human_controlled");
  const [searchQuery, setSearchQuery] = useState("");

  // Sorting
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Handle URL filter changes
  useEffect(() => {
    const filter = searchParams.get("filter");
    if (filter === "priority") {
      setPriorityOnly(true);
      setHumanControlledOnly(false);
    } else if (filter === "human_controlled") {
      setHumanControlledOnly(true);
      setPriorityOnly(false);
    }
  }, [searchParams]);

  const fetchLeads = async () => {
    if (!userRecord?.organization_id) return;

    setLoading(true);
    try {
      // Select only columns needed for list view - avoid fetching sensitive financial data
      let query = supabase
        .from("leads")
        .select(
          `
          id,
          full_name,
          first_name,
          last_name,
          phone,
          email,
          status,
          source,
          lead_score,
          is_priority,
          is_human_controlled,
          created_at,
          last_contact_at,
          interested_property_id,
          preferred_language,
          properties:interested_property_id (address, unit_number),
          lead_predictions (conversion_probability, predicted_outcome)
        `,
          { count: "exact" }
        )
        .eq("organization_id", userRecord.organization_id);

      // Apply filters
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (sourceFilter !== "all") {
        query = query.eq("source", sourceFilter);
      }
      if (priorityOnly) {
        query = query.eq("is_priority", true);
      }
      if (humanControlledOnly) {
        query = query.eq("is_human_controlled", true);
      }
      if (searchQuery) {
        query = query.or(
          `full_name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%`
        );
      }

      // Apply sorting (handle special case for prediction sort)
      const sortFieldToUse = sortField === "conversion_probability" ? "lead_score" : sortField;
      query = query.order(sortFieldToUse, { ascending: sortDirection === "asc" });

      // Apply pagination
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      // Process leads to extract prediction from array format
      const processedLeads = (data || []).map((lead: any) => ({
        ...lead,
        lead_predictions: Array.isArray(lead.lead_predictions) && lead.lead_predictions.length > 0
          ? lead.lead_predictions[0]
          : null,
      }));

      // Filter by prediction outcome if needed
      let filteredLeads = processedLeads;
      if (predictionFilter !== "all") {
        filteredLeads = processedLeads.filter((lead: any) =>
          lead.lead_predictions?.predicted_outcome === predictionFilter
        );
      }

      // Sort by conversion probability if that's the sort field
      if (sortField === "conversion_probability") {
        filteredLeads.sort((a: any, b: any) => {
          const probA = a.lead_predictions?.conversion_probability || 0;
          const probB = b.lead_predictions?.conversion_probability || 0;
          return sortDirection === "asc" ? probA - probB : probB - probA;
        });
      }

      setLeads(filteredLeads);
      setTotalCount(predictionFilter !== "all" ? filteredLeads.length : count || 0);
    } catch (error) {
      console.error("Error fetching leads:", error);
      toast({
        title: "Error",
        description: "Failed to load leads.",
        variant: "destructive",
      });
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
    predictionFilter,
    priorityOnly,
    humanControlledOnly,
    searchQuery,
    sortField,
    sortDirection,
    currentPage,
  ]);

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
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
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
      <div className="glass-card rounded-xl p-4 mb-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            {/* Search */}
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or phone..."
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

            {/* Prediction Filter */}
            <Select
              value={predictionFilter || "all"}
              onValueChange={(v) => {
                setPredictionFilter(v);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Prediction" />
              </SelectTrigger>
              <SelectContent>
                {PREDICTION_OUTCOMES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Priority Toggle */}
            <div className="flex items-center gap-2">
              <Switch
                id="priority"
                checked={priorityOnly}
                onCheckedChange={(c) => {
                  setPriorityOnly(c);
                  setCurrentPage(1);
                }}
              />
              <Label htmlFor="priority" className="text-sm">
                Priority Only
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="human"
                checked={humanControlledOnly}
                onCheckedChange={(c) => {
                  setHumanControlledOnly(c);
                  setCurrentPage(1);
                }}
              />
              <Label htmlFor="human" className="text-sm">
                Human Controlled
              </Label>
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
                {searchQuery || statusFilter !== "all" || sourceFilter !== "all" || predictionFilter !== "all" || priorityOnly || humanControlledOnly
                  ? "Try adjusting your filters."
                  : "Import leads via CSV or create one manually."}
              </p>
              {permissions.canCreateLead && !searchQuery && statusFilter === "all" && sourceFilter === "all" && (
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
                    <TableHead>Phone</TableHead>
                    <SortableHeader field="lead_score">Score</SortableHeader>
                    <SortableHeader field="conversion_probability">Prediction</SortableHeader>
                    <SortableHeader field="status">Status</SortableHeader>
                    <TableHead>Property</TableHead>
                    <SortableHeader field="created_at">Created</SortableHeader>
                    <SortableHeader field="last_contact_at">
                      Last Contact
                    </SortableHeader>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow
                      key={lead.id}
                      className="cursor-pointer hover:bg-muted/50"
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
                      <TableCell className="text-muted-foreground">
                        {lead.phone}
                      </TableCell>
                      <TableCell>
                        <ScoreDisplay
                          score={lead.lead_score || 50}
                          size="sm"
                          showPriorityBadge={false}
                        />
                      </TableCell>
                      <TableCell>
                        <PredictionBadge 
                          probability={lead.lead_predictions?.conversion_probability ? Number(lead.lead_predictions.conversion_probability) : null}
                          outcome={lead.lead_predictions?.predicted_outcome}
                        />
                      </TableCell>
                      <TableCell>
                        <LeadStatusBadge status={lead.status} />
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground">
                        {lead.properties?.address
                          ? `${lead.properties.address}${
                              lead.properties.unit_number
                                ? ` #${lead.properties.unit_number}`
                                : ""
                            }`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lead.created_at
                          ? format(new Date(lead.created_at), "MMM d, yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lead.last_contact_at
                          ? format(
                              new Date(lead.last_contact_at),
                              "MMM d, yyyy"
                            )
                          : "-"}
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
