import React, { useState, useEffect } from "react";
import { Clock, Loader2, Archive, AlarmClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

interface StaleLead {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  lead_score: number | null;
  last_contact_at: string | null;
  updated_at: string | null;
  created_at: string;
  property_address?: string | null;
}

interface StaleTabProps {
  refreshKey: number;
  onCountChange: (count: number) => void;
}

const ACTIVE_STATUSES = ["new", "contacted", "engaged", "nurturing", "qualified"];

const LOST_REASONS = [
  { value: "no_response", label: "No response" },
  { value: "not_interested", label: "Not interested" },
  { value: "found_elsewhere", label: "Found elsewhere" },
  { value: "budget_mismatch", label: "Budget mismatch" },
  { value: "other", label: "Other" },
];

function getDaysStale(lead: StaleLead): number {
  const lastActivity = lead.last_contact_at || lead.updated_at || lead.created_at;
  const diff = Date.now() - new Date(lastActivity).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export const StaleTab: React.FC<StaleTabProps> = ({ refreshKey, onCountChange }) => {
  const { userRecord } = useAuth();
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<StaleLead[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lostReason, setLostReason] = useState("no_response");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    fetchStale();
  }, [userRecord?.organization_id, refreshKey]);

  const fetchStale = async () => {
    if (!userRecord?.organization_id) return;
    setLoading(true);

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("leads")
      .select(
        "id, full_name, phone, email, status, lead_score, last_contact_at, updated_at, created_at, properties:interested_property_id(address)"
      )
      .eq("organization_id", userRecord.organization_id)
      .in("status", ACTIVE_STATUSES)
      .or(
        `last_contact_at.is.null,last_contact_at.lt.${fourteenDaysAgo}`
      )
      .order("last_contact_at", { ascending: true, nullsFirst: true });

    if (error) {
      console.error("Failed to fetch stale leads:", error.message);
      setLoading(false);
      return;
    }

    const stale: StaleLead[] = (data || [])
      .map((l: any) => ({
        ...l,
        property_address: l.properties?.address || null,
      }))
      .filter((l: StaleLead) => getDaysStale(l) >= 14);

    setLeads(stale);
    onCountChange(stale.length);
    setSelected(new Set());
    setLoading(false);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === leads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(leads.map((l) => l.id)));
    }
  };

  const handleMarkLost = async () => {
    setActing(true);

    const ids = Array.from(selected);
    const { error } = await supabase
      .from("leads")
      .update({
        status: "lost",
        lost_reason: lostReason,
        updated_at: new Date().toISOString(),
      })
      .in("id", ids);

    setActing(false);
    setConfirmOpen(false);

    if (error) {
      toast.error("Failed to mark as lost", { description: error.message });
      return;
    }

    toast.success(`${ids.length} lead${ids.length !== 1 ? "s" : ""} marked as lost`);
    setLeads((prev) => prev.filter((l) => !selected.has(l.id)));
    onCountChange(leads.length - ids.length);
    setSelected(new Set());
  };

  const handleSnooze = async () => {
    setActing(true);

    const ids = Array.from(selected);
    const { error } = await supabase
      .from("leads")
      .update({
        last_contact_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in("id", ids);

    setActing(false);

    if (error) {
      toast.error("Snooze failed", { description: error.message });
      return;
    }

    toast.success(`${ids.length} lead${ids.length !== 1 ? "s" : ""} snoozed for 14 days`);
    setLeads((prev) => prev.filter((l) => !selected.has(l.id)));
    onCountChange(leads.length - ids.length);
    setSelected(new Set());
  };

  const getStaleBadge = (days: number) => {
    if (days >= 28)
      return <Badge className="bg-red-100 text-red-800 text-xs">{days}d</Badge>;
    return <Badge className="bg-amber-100 text-amber-800 text-xs">{days}d</Badge>;
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="No stale leads"
        description="All active leads have been contacted within the last 14 days."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {leads.length} lead{leads.length !== 1 ? "s" : ""} with no activity for 14+ days.
        </p>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSnooze}
              disabled={acting}
            >
              <AlarmClock className="h-4 w-4 mr-1.5" />
              Snooze 14d
            </Button>
            <div className="flex items-center gap-1.5">
              <Select value={lostReason} onValueChange={setLostReason}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOST_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
                disabled={acting}
              >
                <Archive className="h-4 w-4 mr-1.5" />
                Mark Lost
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selected.size === leads.length && leads.length > 0}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Stale</TableHead>
              <TableHead>Last Activity</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Property</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => {
              const days = getDaysStale(lead);
              const lastActivity = lead.last_contact_at || lead.updated_at || lead.created_at;

              return (
                <TableRow key={lead.id} className={selected.has(lead.id) ? "bg-muted/30" : ""}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(lead.id)}
                      onCheckedChange={() => toggleSelect(lead.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {lead.full_name || lead.phone || lead.email || "Unknown"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{getStaleBadge(days)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(lastActivity), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-sm">{lead.lead_score ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {lead.property_address || "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Confirm mark lost dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {selected.size} leads as lost?</AlertDialogTitle>
            <AlertDialogDescription>
              This will change the status of {selected.size} lead
              {selected.size !== 1 ? "s" : ""} to "Lost" with reason: "
              {LOST_REASONS.find((r) => r.value === lostReason)?.label}". AI agents
              will stop contacting them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMarkLost}
              disabled={acting}
              className="bg-red-600 hover:bg-red-700"
            >
              {acting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Processing...
                </>
              ) : (
                "Confirm"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
