import React, { useState, useEffect } from "react";
import { Merge, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface LeadRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  source: string | null;
  created_at: string;
  last_contact_at: string | null;
}

interface MergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  winner: LeadRow;
  loser: LeadRow;
  onMergeComplete: () => void;
}

// Status progression order (higher index = more advanced)
export const STATUS_ORDER = [
  "new", "contacted", "engaged", "nurturing", "qualified",
  "showing_scheduled", "showed", "in_application", "converted",
];

function displayValue(val: any): string {
  if (val === null || val === undefined || val === "") return "(empty)";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  return String(val);
}

export function autoPickDefault(
  key: string,
  winnerVal: any,
  loserVal: any
): "winner" | "loser" {
  // If one is empty, pick the other
  if (!winnerVal && loserVal) return "loser";
  if (winnerVal && !loserVal) return "winner";

  // For status, pick more advanced
  if (key === "status") {
    const wi = STATUS_ORDER.indexOf(winnerVal);
    const li = STATUS_ORDER.indexOf(loserVal);
    return li > wi ? "loser" : "winner";
  }

  // For consent, pick true
  if (key === "sms_consent" || key === "call_consent") {
    if (loserVal === true && winnerVal !== true) return "loser";
    return "winner";
  }

  // Default: keep winner's value
  return "winner";
}

// Every key here must be in merge_leads' override whitelist — the RPC rejects anything else.
export const MERGE_FIELDS = [
  { key: "full_name", label: "Full Name" },
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "status", label: "Status" },
  { key: "source", label: "Source" },
  { key: "source_detail", label: "Source Detail" },
  { key: "budget_min", label: "Budget Min" },
  { key: "budget_max", label: "Budget Max" },
  { key: "move_in_date", label: "Move-in Date" },
  { key: "has_voucher", label: "Has Voucher" },
  { key: "voucher_amount", label: "Voucher Amount" },
  { key: "preferred_language", label: "Language" },
  { key: "contact_preference", label: "Contact Preference" },
  { key: "sms_consent", label: "SMS Consent" },
  { key: "call_consent", label: "Call Consent" },
];

// User-visible tables counted for the "records to move" preview. The merge_leads
// RPC itself re-points EVERY linked table (incl. lead_reminders, leasing_activity,
// inbound_emails, notifications, referrals, system_logs) — this list is display-only.
const PREVIEW_TABLES = [
  "lead_notes", "calls", "showings", "agent_tasks", "consent_log",
  "communications", "cost_records", "email_events", "lead_property_interests",
];

/**
 * Collect the loser-side values chosen to survive the merge, in the shape
 * merge_leads expects. Empty loser values are skipped — the RPC applies
 * overrides with COALESCE, so they could never clear a winner field anyway.
 */
function buildOverrides(
  loserFull: any,
  pick: (key: string) => "winner" | "loser"
): Record<string, any> {
  const overrides: Record<string, any> = {};
  for (const f of MERGE_FIELDS) {
    const loserVal = loserFull[f.key];
    if (pick(f.key) === "loser" && loserVal !== null && loserVal !== undefined && loserVal !== "") {
      overrides[f.key] = loserVal;
    }
  }
  // Keep first/last name in sync when the loser's full name wins
  if (overrides.full_name) {
    const parts = String(overrides.full_name).trim().split(" ");
    if (parts[0]) overrides.first_name = parts[0];
    const rest = parts.slice(1).join(" ");
    if (rest) overrides.last_name = rest;
  }
  return overrides;
}

/**
 * Merge loser into winner via the atomic merge_leads RPC. The RPC applies the
 * field overrides, re-points ALL related tables (incl. email_events,
 * lead_reminders, leasing_activity), logs the merge and deletes the loser —
 * all in one transaction. Overrides are auto-picked: fill empty fields, most
 * advanced status, consent = true.
 */
export async function performMerge(
  winnerId: string,
  loserId: string,
  userId: string | null,
  orgId?: string | null
): Promise<void> {
  // Fetch full records to auto-pick which values survive. Org-scope the selects
  // for defense-in-depth (the RPC also validates org membership).
  const scope = (q: any) => (orgId ? q.eq("organization_id", orgId) : q);
  const [winnerRes, loserRes] = await Promise.all([
    scope(supabase.from("leads").select("*").eq("id", winnerId)).single(),
    scope(supabase.from("leads").select("*").eq("id", loserId)).single(),
  ]);
  if (winnerRes.error) throw new Error(winnerRes.error.message);
  if (loserRes.error) throw new Error(loserRes.error.message);
  const winnerFull: any = winnerRes.data;
  const loserFull: any = loserRes.data;

  const overrides = buildOverrides(loserFull, (key) =>
    autoPickDefault(key, winnerFull[key], loserFull[key])
  );

  const { error } = await supabase.rpc("merge_leads", {
    p_winner_id: winnerId,
    p_loser_id: loserId,
    p_field_overrides: overrides,
    p_merged_by_user_id: userId ?? undefined,
  });
  if (error) throw new Error(error.message);
}

export const MergeDialog: React.FC<MergeDialogProps> = ({
  open,
  onOpenChange,
  winner,
  loser,
  onMergeComplete,
}) => {
  const { userRecord } = useAuth();
  const [winnerFull, setWinnerFull] = useState<any>(null);
  const [loserFull, setLoserFull] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selections, setSelections] = useState<Record<string, "winner" | "loser">>({});
  const [relatedCounts, setRelatedCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (open) fetchFullLeads();
  }, [open, winner.id, loser.id, userRecord?.organization_id]);

  const fetchFullLeads = async () => {
    if (!userRecord?.organization_id) return;
    const orgId = userRecord.organization_id;
    setLoading(true);
    setWinnerFull(null);
    setLoserFull(null);

    const [winnerRes, loserRes] = await Promise.all([
      supabase.from("leads").select("*").eq("id", winner.id).eq("organization_id", orgId).single(),
      supabase.from("leads").select("*").eq("id", loser.id).eq("organization_id", orgId).single(),
    ]);

    // A merge must never run blind: abort the dialog if either record failed to load
    if (winnerRes.error || loserRes.error || !winnerRes.data || !loserRes.data) {
      toast.error("Could not load leads for merging", {
        description:
          winnerRes.error?.message || loserRes.error?.message || "Lead not found",
      });
      setLoading(false);
      onOpenChange(false);
      return;
    }

    setWinnerFull(winnerRes.data);
    setLoserFull(loserRes.data);

    // Set auto-defaults for selections
    const defaults: Record<string, "winner" | "loser"> = {};
    for (const f of MERGE_FIELDS) {
      defaults[f.key] = autoPickDefault(
        f.key,
        (winnerRes.data as any)[f.key],
        (loserRes.data as any)[f.key]
      );
    }
    setSelections(defaults);

    // Fetch related record counts for loser (preview only — the RPC moves everything)
    const counts: Record<string, number> = {};
    await Promise.all(
      PREVIEW_TABLES.map(async (table) => {
        const { count } = await supabase
          .from(table as any)
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("lead_id", loser.id);
        counts[table] = count || 0;
      })
    );
    setRelatedCounts(counts);

    setLoading(false);
  };

  const handleMerge = async () => {
    if (!winnerFull || !loserFull) return; // never merge on a failed fetch
    setMerging(true);

    try {
      // Build field overrides from the user's selections, then run ONE atomic
      // RPC: merge_leads applies the overrides, re-points ALL related records
      // (notes, showings, emails, reminders, activity, ...), logs the merge
      // and deletes the duplicate — in a single transaction.
      const overrides = buildOverrides(loserFull, (key) => selections[key] || "winner");
      const { error } = await supabase.rpc("merge_leads", {
        p_winner_id: winner.id,
        p_loser_id: loser.id,
        p_field_overrides: overrides,
        p_merged_by_user_id: userRecord?.id ?? undefined,
      });
      if (error) throw new Error(error.message);

      setMerging(false);
      setConfirmOpen(false);

      toast.success("Leads merged successfully", {
        description: `${loser.full_name || "Duplicate"} merged into ${winner.full_name || "Primary lead"}.`,
      });

      onOpenChange(false);
      onMergeComplete();
    } catch (err: any) {
      setMerging(false);
      setConfirmOpen(false);
      toast.error("Merge failed", { description: err.message });
    }
  };

  const totalRecordsToMove = Object.values(relatedCounts).reduce((a, b) => a + b, 0);

  const getDisplayValue = (lead: any, key: string): string => {
    if (!lead) return "(loading)";
    return displayValue(lead[key]);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Merge className="h-5 w-5" />
              Merge Leads
            </DialogTitle>
            <DialogDescription>
              Choose which values to keep for each field. The losing lead will be deleted and all
              its records (notes, showings, emails, etc.) will be moved to the winner in one
              atomic operation.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="space-y-3 py-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-8 flex-1" />
                  <Skeleton className="h-8 flex-1" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {/* Column headers */}
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr_1fr] gap-2 text-sm font-medium text-muted-foreground">
                <div>Field</div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  Primary (keep)
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  Duplicate (delete)
                </div>
              </div>

              <Separator />

              {/* Field rows */}
              {MERGE_FIELDS.map((field) => {
                const wVal = getDisplayValue(winnerFull, field.key);
                const lVal = getDisplayValue(loserFull, field.key);
                const bothEmpty = wVal === "(empty)" && lVal === "(empty)";
                const identical = wVal === lVal;

                if (bothEmpty) return null;

                return (
                  <div
                    key={field.key}
                    className="grid grid-cols-1 sm:grid-cols-[140px_1fr_1fr] gap-2 items-center text-sm"
                  >
                    <div className="font-medium text-muted-foreground">{field.label}</div>

                    {identical ? (
                      <div className="col-span-2 text-muted-foreground">{wVal}</div>
                    ) : (
                      <RadioGroup
                        value={selections[field.key] || "winner"}
                        onValueChange={(val) =>
                          setSelections((prev) => ({
                            ...prev,
                            [field.key]: val as "winner" | "loser",
                          }))
                        }
                        className="contents"
                      >
                        <Label
                          htmlFor={`${field.key}-winner`}
                          className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                            selections[field.key] === "winner"
                              ? "bg-green-50 border border-green-200"
                              : "hover:bg-muted/50"
                          }`}
                        >
                          <RadioGroupItem
                            value="winner"
                            id={`${field.key}-winner`}
                          />
                          <span className={wVal === "(empty)" ? "text-muted-foreground italic" : ""}>
                            {wVal}
                          </span>
                        </Label>

                        <Label
                          htmlFor={`${field.key}-loser`}
                          className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                            selections[field.key] === "loser"
                              ? "bg-green-50 border border-green-200"
                              : "hover:bg-muted/50"
                          }`}
                        >
                          <RadioGroupItem
                            value="loser"
                            id={`${field.key}-loser`}
                          />
                          <span className={lVal === "(empty)" ? "text-muted-foreground italic" : ""}>
                            {lVal}
                          </span>
                        </Label>
                      </RadioGroup>
                    )}
                  </div>
                );
              })}

              <Separator />

              {/* Related records preview */}
              {totalRecordsToMove > 0 && (
                <div className="rounded-lg border p-3 bg-muted/30">
                  <p className="text-sm font-medium mb-2">
                    Records to move from duplicate to primary:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(relatedCounts)
                      .filter(([, count]) => count > 0)
                      .map(([table, count]) => (
                        <Badge key={table} variant="secondary" className="text-xs">
                          {count} {table.replace(/_/g, " ")}
                        </Badge>
                      ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Any other linked records (reminders, activity, system logs, ...) are moved
                    automatically as well.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={loading || !winnerFull || !loserFull}
              className="bg-[#4F46E5] hover:bg-[#4F46E5]/90"
            >
              <Merge className="h-4 w-4 mr-1.5" />
              Merge Leads
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation alert */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Merge
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently merge "{loser.full_name || "duplicate"}" into "
              {winner.full_name || "primary lead"}". All of the duplicate's related records
              {totalRecordsToMove > 0
                ? ` (${totalRecordsToMove} counted, plus any linked system records)`
                : ""}{" "}
              will be moved to the primary lead, then the duplicate will be deleted.
              <br />
              <br />
              <strong>This action cannot be undone.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMerge}
              disabled={merging}
              className="bg-[#4F46E5] hover:bg-[#4F46E5]/90"
            >
              {merging ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Merging...
                </>
              ) : (
                "Confirm Merge"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
