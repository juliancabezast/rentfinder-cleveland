import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, Briefcase, Trash2, Loader2, Mail, Phone, Building2, HeartHandshake, Home as HomeIcon,
  KeyRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { EmptyState } from "@/components/ui/EmptyState";

interface BusinessLead {
  id: string;
  lead_type: "housing_partner" | "corporate_leasing" | "landlord_owner";
  full_name: string | null;
  organization_name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  source: string | null;
  source_detail: string | null;
  status: string;
  created_at: string;
}

const TYPE_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  housing_partner: { label: "Housing Partner", icon: HeartHandshake, cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  corporate_leasing: { label: "Corporate Leasing", icon: Building2, cls: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  // Owners arriving from the /section-8-landlords/ hub and its articles.
  landlord_owner: { label: "Landlord / Owner", icon: KeyRound, cls: "bg-amber-100 text-amber-800 border-amber-200" },
};

const STATUSES = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "converted", label: "Converted" },
  { value: "archived", label: "Archived" },
];

const FILTERS = [
  { value: "all", label: "All" },
  { value: "housing_partner", label: "Housing Partners" },
  { value: "corporate_leasing", label: "Corporate Leasing" },
];

export default function BusinessPage() {
  const { userRecord } = useAuth();
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<BusinessLead[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [detail, setDetail] = useState<BusinessLead | null>(null);
  const [removeTarget, setRemoveTarget] = useState<BusinessLead | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchLeads = async () => {
    if (!userRecord?.organization_id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("business_leads")
        .select("id, lead_type, full_name, organization_name, email, phone, message, source, source_detail, status, created_at")
        .eq("organization_id", userRecord.organization_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setLeads((data || []) as BusinessLead[]);
    } catch (err) {
      console.error("Error fetching business leads:", err);
      toast.error("Failed to load business leads");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLeads(); }, [userRecord?.organization_id]);

  const updateStatus = async (lead: BusinessLead, status: string) => {
    // Optimistic update
    setLeads((cur) => cur.map((l) => (l.id === lead.id ? { ...l, status } : l)));
    const { error } = await supabase.from("business_leads").update({ status }).eq("id", lead.id);
    if (error) { toast.error("Couldn't update status"); fetchLeads(); }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("business_leads").delete().eq("id", removeTarget.id);
      if (error) throw error;
      toast.success("Business lead deleted");
      setRemoveTarget(null);
      fetchLeads();
    } catch (err) {
      console.error("Error deleting business lead:", err);
      toast.error("Failed to delete");
    } finally {
      setSaving(false);
    }
  };

  const counts = {
    housing_partner: leads.filter((l) => l.lead_type === "housing_partner").length,
    corporate_leasing: leads.filter((l) => l.lead_type === "corporate_leasing").length,
  };

  const filtered = leads.filter((l) => {
    if (typeFilter !== "all" && l.lead_type !== typeFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.full_name?.toLowerCase().includes(q) ||
      l.organization_name?.toLowerCase().includes(q) ||
      l.email?.toLowerCase().includes(q) ||
      l.phone?.includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Business</h1>
        <p className="text-sm text-muted-foreground mt-1">
          B2B leads from the Housing Partners &amp; Corporate Leasing pages ({leads.length})
        </p>
      </div>

      {/* Type filter + counts */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={typeFilter === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => setTypeFilter(f.value)}
          >
            {f.label}
            {f.value !== "all" && (
              <Badge variant="secondary" className="ml-2">{counts[f.value as keyof typeof counts]}</Badge>
            )}
          </Button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, organization, email, phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12">
              <EmptyState
                icon={Briefcase}
                title="No business leads yet"
                description={
                  search
                    ? "No leads match your search"
                    : "Sign-ups from the Housing Partners and Corporate Leasing sections will appear here"
                }
              />
            </div>
          ) : (
            <div className="-mx-4 px-4 overflow-x-auto sm:mx-0 sm:px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name / Organization</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="hidden sm:table-cell">Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Received</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((lead) => {
                    const meta = TYPE_META[lead.lead_type];
                    return (
                      <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetail(lead)}>
                        <TableCell className="font-medium">
                          {lead.full_name || "Unknown"}
                          {lead.organization_name && (
                            <div className="text-xs text-muted-foreground">{lead.organization_name}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={meta.cls}>
                            <meta.icon className="h-3 w-3 mr-1" />{meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="text-sm text-muted-foreground">
                            {lead.email && <div>{lead.email}</div>}
                            {lead.phone && <div>{lead.phone}</div>}
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Select value={lead.status} onValueChange={(v) => updateStatus(lead, v)}>
                            <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {format(new Date(lead.created_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost" size="icon"
                            title="Delete"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setRemoveTarget(lead)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
        <DialogContent>
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-primary" />
                  {detail.full_name || "Business lead"}
                </DialogTitle>
                <DialogDescription>
                  <Badge variant="outline" className={TYPE_META[detail.lead_type].cls}>
                    {TYPE_META[detail.lead_type].label}
                  </Badge>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                {detail.organization_name && (
                  <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" />{detail.organization_name}</div>
                )}
                {detail.email && (
                  <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${detail.email}`} className="text-primary hover:underline">{detail.email}</a></div>
                )}
                {detail.phone && (
                  <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${detail.phone}`} className="text-primary hover:underline">{detail.phone}</a></div>
                )}
                {(detail.source || detail.source_detail) && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <HomeIcon className="h-4 w-4" />Source: {detail.source}{detail.source_detail ? ` · ${detail.source_detail}` : ""}
                  </div>
                )}
                {detail.message && (
                  <div className="rounded-lg border border-border bg-muted/40 p-3 whitespace-pre-wrap">{detail.message}</div>
                )}
                <div className="text-xs text-muted-foreground">
                  Received {format(new Date(detail.created_at), "MMM d, yyyy 'at' h:mm a")}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDetail(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!removeTarget} onOpenChange={() => setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete business lead</DialogTitle>
            <DialogDescription>
              This permanently deletes <strong>{removeTarget?.full_name || "this lead"}</strong>. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemove} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
