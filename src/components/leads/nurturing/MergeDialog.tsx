import React, { useState, useEffect } from "react";
import { Merge, Loader2, AlertTriangle, ArrowRight } from "lucide-react";
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
  lead_score: number | null;
  source: string | null;
  interested_property_id: string | null;
  created_at: string;
  last_contact_at: string | null;
  property_address?: string | null;
}

interface MergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  winner: LeadRow;
  loser: LeadRow;
  onMergeComplete: () => void;
}

// Status progression order (higher index = more advanced)
const STATUS_ORDER = [
  "new", "contacted", "engaged", "nurturing", "qualified",
  "showing_scheduled", "showed", "in_application", "converted",
];

interface MergeableField {
  key: string;
  label: string;
  winnerVal: string | null;
  loserVal: string | null;
}

function displayValue(val: any): string {
  if (val === null || val === undefined || val === "") return "(empty)";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  return String(val);
}

function autoPickDefault(
  key: string,
  winnerVal: any,
  loserVal: any
): "winner" | "loser" {
  // If one is empty, pick the other
  if (!winnerVal && loserVal) return "loser";
  if (winnerVal && !loserVal) return "winner";

  // For score, pick higher
  if (key === "lead_score") {
    return (Number(loserVal) || 0) > (Number(winnerVal) || 0) ? "loser" : "winner";
  }

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

  const MERGE_FIELDS = [
    { key: "full_name", label: "Full Name" },
    { key: "first_name", label: "First Name" },
    { key: "last_name", label: "Last Name" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "status", label: "Status" },
    { key: "lead_score", label: "Score" },
    { key: "source", label: "Source" },
    { key: "source_detail", label: "Source Detail" },
    { key: "interested_property_id", label: "Property" },
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

  useEffect(() => {
    if (open) fetchFullLeads();
  }, [open, winner.id, loser.id]);

  const fetchFullLeads = async () => {
    setLoading(true);

    const [winnerRes, loserRes] = await Promise.all([
      supabase.from("leads").select("*").eq("id", winner.id).single(),
      supabase.from("leads").select("*").eq("id", loser.id).single(),
    ]);

    if (winnerRes.data) setWinnerFull(winnerRes.data);
    if (loserRes.data) setLoserFull(loserRes.data);

    // Set auto-defaults for selections
    if (winnerRes.data && loserRes.data) {
      const defaults: Record<string, "winner" | "loser"> = {};
      for (const f of MERGE_FIELDS) {
        defaults[f.key] = autoPickDefault(f.key, winnerRes.data[f.key], loserRes.data[f.key]);
      }
      setSelections(defaults);
    }

    // Fetch related record counts for loser
    const tables = [
      "lead_notes", "calls", "showings", "agent_tasks",
      "lead_score_history", "consent_log", "communications",
    ];
    const counts: Record<string, number> = {};
    await Promise.all(
      tables.map(async (table) => {
        const { count } = await supabase
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("lead_id", loser.id);
        counts[table] = count || 0;
      })
    );
    setRelatedCounts(counts);

    setLoading(false);
  };

  const handleMerge = async () => {
    setMerging(true);

    try {
      // 1. Build field overrides from selections
      const overrides: Record<string, any> = {};
      if (winnerFull && loserFull) {
        for (const f of MERGE_FIELDS) {
          if (selections[f.key] === "loser") {
            overrides[f.key] = loserFull[f.key];
          }
        }
        if (overrides.full_name) {
          const parts = String(overrides.full_name).trim().split(" ");
          overrides.first_name = parts[0] || null;
          overrides.last_name = parts.slice(1).join(" ") || null;
        }
      }

      // 2. Apply field overrides to winner
      if (Object.keys(overrides).length > 0) {
        overrides.updated_at = new Date().toISOString();
        const { error: updateErr } = await supabase
          .from("leads")
          .update(overrides)
          .eq("id", winner.id);
        if (updateErr) throw new Error(`Update winner failed: ${updateErr.message}`);
      }

      // 3. Re-point related records from loser → winner
      const relatedTables = [
        "lead_notes", "calls", "showings", "agent_tasks",
        "lead_score_history", "consent_log", "communications",
      ];

      for (const table of relatedTables) {
        const { error: moveErr } = await supabase
          .from(table)
          .update({ lead_id: winner.id })
          .eq("lead_id", loser.id);
        // Ignore errors on tables that may have unique constraints or missing lead_id
        if (moveErr) {
          console.warn(`Merge: moving ${table} records: ${moveErr.message}`);
        }
      }

      // 4. Log the merge as a note on the winner
      await supabase.from("lead_notes").insert({
        lead_id: winner.id,
        user_id: userRecord?.id || null,
        note: `Merged duplicate lead (${loser.full_name || loser.id.slice(0, 8)}) into this record. Fields kept from duplicate: ${Object.keys(overrides).filter(k => k !== "updated_at").join(", ") || "none"}.`,
        created_at: new Date().toISOString(),
      });

      // 5. Delete the loser lead
      const { error: deleteErr } = await supabase
        .from("leads")
        .delete()
        .eq("id", loser.id);
      if (deleteErr) throw new Error(`Delete duplicate failed: ${deleteErr.message}`);

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
    if (key === "interested_property_id") {
      return lead[key]
        ? (winner.property_address || loser.property_address || lead[key]?.slice(0, 8))
        : "(empty)";
    }
    return displayValue(lead[key]);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Merge className="h-5 w-5" />
              Merge Leads
            </DialogTitle>
            <DialogDescription>
              Choose which values to keep for each field. The losing lead will be deleted and all
              its records (notes, calls, showings, etc.) will be moved to the winner.
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
              <div className="grid grid-cols-[140px_1fr_1fr] gap-2 text-sm font-medium text-muted-foreground">
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
                    className="grid grid-cols-[140px_1fr_1fr] gap-2 items-center text-sm"
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
              disabled={loading}
              className="bg-[#370d4b] hover:bg-[#370d4b]/90"
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
              {winner.full_name || "primary lead"}". The duplicate lead will be deleted and
              {totalRecordsToMove > 0
                ? ` ${totalRecordsToMove} related record${totalRecordsToMove !== 1 ? "s" : ""} will be moved.`
                : " no related records need to be moved."}
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
              className="bg-[#370d4b] hover:bg-[#370d4b]/90"
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
