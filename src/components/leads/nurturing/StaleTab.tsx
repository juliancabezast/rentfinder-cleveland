import React, { useState, useEffect } from "react";
import { Clock, Loader2, Archive, AlarmClock, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
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
import { formatDistanceToNow } from "date-fns";

interface StaleLead {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
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

// Rows rendered per page — the old version downloaded ~17.5k joined rows in 18
// sequential requests and mounted every survivor as a <TableRow>.
const PAGE_SIZE = 50;

// .in() id lists travel in the URL query string; ~1,500 UUIDs blow past gateway
// URL limits (Cloudflare ~32KB), so bulk mutations are chunked.
const BULK_CHUNK = 200;

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

/**
 * Server-side stale predicate = COALESCE(last_contact_at, updated_at, created_at)
 * older than 14 days, expressed as PostgREST or-branches. The old version only
 * filtered last_contact_at server-side and re-filtered ~92% of rows client-side.
 * Snoozed leads (snoozed_until in the future) are excluded without faking a
 * contact timestamp.
 */
function staleOrFilters(): { stale: string; notSnoozed: string } {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  return {
    stale: `last_contact_at.lt.${cutoff},and(last_contact_at.is.null,updated_at.lt.${cutoff}),and(last_contact_at.is.null,updated_at.is.null,created_at.lt.${cutoff})`,
    notSnoozed: `snoozed_until.is.null,snoozed_until.lte.${now}`,
  };
}

export const StaleTab: React.FC<StaleTabProps> = ({ refreshKey, onCountChange }) => {
  const { userRecord } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<StaleLead[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectingAll, setSelectingAll] = useState(false);
  const [lostReason, setLostReason] = useState("no_response");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [snoozeConfirmOpen, setSnoozeConfirmOpen] = useState(false);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    fetchStale(pageIndex);
  }, [userRecord?.organization_id, refreshKey, pageIndex]);

  // Selection is by id and survives paging (for "select all matching"), but it
  // must be dropped when the org changes or the operator hits Refresh — acting on
  // a stale id set risks flipping leads that no longer match the stale filter.
  useEffect(() => {
    setSelected(new Set());
  }, [userRecord?.organization_id, refreshKey]);

  const fetchStale = async (page: number) => {
    if (!userRecord?.organization_id) return;
    setLoading(true);
    setError(null);

    const { stale, notSnoozed } = staleOrFilters();

    // Cheap exact count for the header/badge — no rows downloaded
    const { count, error: countError } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", userRecord.organization_id)
      .in("status", ACTIVE_STATUSES)
      .or(stale)
      .or(notSnoozed);

    if (countError) {
      // Never let a failed count read as "no stale leads" — surface it and stop
      console.error("Failed to count stale leads:", countError.message);
      setError(countError.message);
      toast.error("Could not load stale leads", { description: countError.message });
      setLoading(false);
      return;
    }

    // Fetch ONLY the rendered page. Secondary sort by id keeps pages deterministic.
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from("leads")
      .select(
        "id, full_name, phone, email, status, last_contact_at, updated_at, created_at, lead_property_interests(last_interest_at, properties(address))"
      )
      .eq("organization_id", userRecord.organization_id)
      .in("status", ACTIVE_STATUSES)
      .or(stale)
      .or(notSnoozed)
      .order("last_contact_at", { ascending: true, nullsFirst: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error("Failed to fetch stale leads:", error.message);
      setError(error.message);
      toast.error("Could not load stale leads", { description: error.message });
      setLoading(false);
      return;
    }

    const total = count || 0;

    // Page fell off the end (e.g. after a bulk action) — clamp to the last page.
    // Only re-fire the effect when the target page actually differs; when the
    // clamp target equals the current page (rows vanished on the true last page),
    // fall through and render the empty page instead of hanging on the skeleton.
    if ((data || []).length === 0 && page > 0 && total > 0) {
      const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
      if (lastPage !== page) {
        setPageIndex(lastPage);
        return;
      }
    }

    const pageLeads: StaleLead[] = (data || []).map((l: any) => {
      // Most-recent property-interest tag wins the display slot.
      const latestTag = (l.lead_property_interests || [])
        .slice()
        .sort((a: any, b: any) =>
          (b.last_interest_at || "").localeCompare(a.last_interest_at || "")
        )[0];
      return {
        ...l,
        property_address: latestTag?.properties?.address || null,
      };
    });

    setLeads(pageLeads);
    setTotalCount(total);
    onCountChange(total);
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

  const pageFullySelected = leads.length > 0 && leads.every((l) => selected.has(l.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (pageFullySelected) {
        for (const l of leads) next.delete(l.id);
      } else {
        for (const l of leads) next.add(l.id);
      }
      return next;
    });
  };

  /** Select every stale lead (id-only paginated fetch — tiny payloads). */
  const selectAllMatching = async () => {
    if (!userRecord?.organization_id) return;
    setSelectingAll(true);

    const { stale, notSnoozed } = staleOrFilters();
    const ids: string[] = [];
    const PAGE = 1000;
    for (let from = 0; from < 100000; from += PAGE) {
      const { data: page, error } = await supabase
        .from("leads")
        .select("id")
        .eq("organization_id", userRecord.organization_id)
        .in("status", ACTIVE_STATUSES)
        .or(stale)
        .or(notSnoozed)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        setSelectingAll(false);
        toast.error("Failed to select all", { description: error.message });
        return;
      }
      ids.push(...(page || []).map((p) => p.id));
      if (!page || page.length < PAGE) break;
    }

    setSelected(new Set(ids));
    setSelectingAll(false);
  };

  /**
   * Run a leads update over the selection in URL-safe chunks. The selection can
   * sit in memory for minutes (esp. after "select all 1,494"), so the org +
   * active + stale + not-snoozed predicate is RE-APPLIED at write time: a lead
   * that got contacted or advanced meanwhile must not be flipped to lost/snoozed.
   * `.select("id")` returns only rows that actually matched, so the count is honest.
   */
  const updateSelectedChunked = async (payload: Record<string, unknown>) => {
    const ids = Array.from(selected);
    if (!userRecord?.organization_id) {
      return { updated: 0, total: ids.length, failedMessage: "Not authenticated" };
    }
    const { stale, notSnoozed } = staleOrFilters();
    let updated = 0;
    let failedMessage: string | null = null;

    for (let i = 0; i < ids.length; i += BULK_CHUNK) {
      const chunk = ids.slice(i, i + BULK_CHUNK);
      // Cast: snoozed_until types regen after the orchestrator migration.
      const { data, error } = await (supabase.from("leads") as any)
        .update(payload)
        .eq("organization_id", userRecord.organization_id)
        .in("id", chunk)
        .in("status", ACTIVE_STATUSES)
        .or(stale)
        .or(notSnoozed)
        .select("id");
      if (error) {
        failedMessage = error.message;
        break;
      }
      updated += (data || []).length;
    }

    return { updated, total: ids.length, failedMessage };
  };

  const finishBulk = () => {
    setSelected(new Set());
    if (pageIndex !== 0) setPageIndex(0);
    else fetchStale(0);
  };

  const handleMarkLost = async () => {
    setActing(true);

    const { updated, total, failedMessage } = await updateSelectedChunked({
      status: "lost",
      lost_reason: lostReason,
      updated_at: new Date().toISOString(),
    });

    setActing(false);
    setConfirmOpen(false);

    if (failedMessage) {
      toast.error("Failed to mark as lost", {
        description:
          updated > 0
            ? `${updated} of ${total} updated before the error: ${failedMessage}`
            : failedMessage,
      });
    } else {
      toast.success(`${updated} lead${updated !== 1 ? "s" : ""} marked as lost`);
    }
    finishBulk();
  };

  const handleSnooze = async () => {
    setActing(true);

    // Capture ids before finishBulk clears the selection, so Undo can target them.
    const snoozedIds = Array.from(selected);

    // Snooze = hide from this list for 14 days. It must NOT fabricate a
    // last_contact_at — that column is the org's real contact record.
    const { updated, total, failedMessage } = await updateSelectedChunked({
      snoozed_until: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });

    setActing(false);
    setSnoozeConfirmOpen(false);

    if (failedMessage) {
      toast.error("Snooze failed", {
        description:
          updated > 0
            ? `${updated} of ${total} snoozed before the error: ${failedMessage}`
            : failedMessage,
      });
    } else {
      toast.success(`${updated} lead${updated !== 1 ? "s" : ""} snoozed for 14 days`, {
        // Snoozed leads vanish from the only list that shows them, so give an
        // immediate escape hatch (there is no snoozed-lead filter elsewhere yet).
        action: { label: "Undo", onClick: () => undoSnooze(snoozedIds) },
      });
    }
    finishBulk();
  };

  /** Reverse a bulk snooze by clearing snoozed_until for the same ids. */
  const undoSnooze = async (ids: string[]) => {
    if (!userRecord?.organization_id || ids.length === 0) return;
    let failedMessage: string | null = null;
    for (let i = 0; i < ids.length; i += BULK_CHUNK) {
      const chunk = ids.slice(i, i + BULK_CHUNK);
      const { error } = await (supabase.from("leads") as any)
        .update({ snoozed_until: null, updated_at: new Date().toISOString() })
        .eq("organization_id", userRecord.organization_id)
        .in("id", chunk);
      if (error) {
        failedMessage = error.message;
        break;
      }
    }
    if (failedMessage) {
      toast.error("Undo failed", { description: failedMessage });
    } else {
      toast.success("Snooze undone");
    }
    fetchStale(pageIndex);
  };

  const getStaleBadge = (days: number) => {
    if (days >= 28)
      return <Badge className="bg-red-100 text-red-800 text-xs">{days}d</Badge>;
    return <Badge className="bg-amber-100 text-amber-800 text-xs">{days}d</Badge>;
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  // A failed fetch must never masquerade as "no stale leads"
  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-6 text-center space-y-3">
        <p className="text-sm text-red-700">Couldn't load stale leads: {error}</p>
        <Button variant="outline" size="sm" onClick={() => fetchStale(pageIndex)}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (totalCount === 0) {
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
          {totalCount} lead{totalCount !== 1 ? "s" : ""} with no activity for 14+ days.
        </p>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSnoozeConfirmOpen(true)}
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

      {/* Gmail-style "select all matching" upgrade once the page is fully selected */}
      {pageFullySelected && selected.size < totalCount && (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          All {leads.length} leads on this page are selected.{" "}
          <button
            type="button"
            className="font-medium text-[#4F46E5] hover:underline disabled:opacity-50"
            onClick={selectAllMatching}
            disabled={selectingAll}
          >
            {selectingAll
              ? "Selecting..."
              : `Select all ${totalCount} stale leads`}
          </button>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={pageFullySelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all leads on this page"
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Stale</TableHead>
              <TableHead>Last Activity</TableHead>
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
                      aria-label={`Select ${lead.full_name || lead.phone || lead.email || "lead"}`}
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
                  <TableCell className="text-sm text-muted-foreground">
                    {lead.property_address || "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {pageIndex + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              disabled={pageIndex === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
              disabled={pageIndex >= totalPages - 1}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

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

      {/* Confirm bulk snooze — one mis-click could otherwise bury the whole backlog */}
      <AlertDialog open={snoozeConfirmOpen} onOpenChange={setSnoozeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Snooze {selected.size} lead{selected.size !== 1 ? "s" : ""} for 14 days?</AlertDialogTitle>
            <AlertDialogDescription>
              {selected.size} lead{selected.size !== 1 ? "s" : ""} will be hidden from this stale
              list for 14 days. They stay active and AI follow-ups continue — this only quiets the
              hygiene queue. You can Undo right after, from the toast.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSnooze} disabled={acting}>
              {acting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Processing...
                </>
              ) : (
                "Snooze 14d"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
