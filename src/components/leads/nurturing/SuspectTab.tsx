import React, { useState, useEffect } from "react";
import { AlertTriangle, Trash2, Pencil, Check, X, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/EmptyState";
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
import { format } from "date-fns";

interface SuspectLead {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  lead_score: number | null;
  source: string | null;
  created_at: string;
  alerts: Alert[];
}

interface Alert {
  field: "full_name" | "phone" | "email";
  message: string;
  severity: "high" | "medium";
}

interface SuspectTabProps {
  refreshKey: number;
  onCountChange: (count: number) => void;
}

// ── Detection rules ──

function analyzeFullName(name: string | null): Alert[] {
  if (!name) return [];
  const alerts: Alert[] = [];
  const lower = name.toLowerCase().trim();

  // Contains common parsing artifacts
  const artifacts = ["com ", ".com", "http", "www.", "mailto:", "<", ">", "&amp;", "comments", "reply", "click", "unsubscribe", "view", "subject:", "re:", "fwd:"];
  for (const a of artifacts) {
    if (lower.includes(a)) {
      alerts.push({ field: "full_name", message: `Name contains "${a}" — likely a parsing error`, severity: "high" });
      break;
    }
  }

  // Name is all numbers or mostly numbers
  const digits = name.replace(/\D/g, "").length;
  if (digits > name.length * 0.5 && name.length > 2) {
    alerts.push({ field: "full_name", message: "Name is mostly numbers", severity: "high" });
  }

  // Name has email-like pattern
  if (/@/.test(name)) {
    alerts.push({ field: "full_name", message: "Name contains @ — looks like an email", severity: "high" });
  }

  // Too many words (likely a sentence, not a name)
  const wordCount = name.trim().split(/\s+/).length;
  if (wordCount > 4) {
    alerts.push({ field: "full_name", message: `Name has ${wordCount} words — may be a sentence`, severity: "medium" });
  }

  // Single character or too short
  if (lower.replace(/\s/g, "").length <= 1) {
    alerts.push({ field: "full_name", message: "Name is too short", severity: "high" });
  }

  // All uppercase or all lowercase with > 3 chars (unusual)
  if (name.length > 5 && (name === name.toUpperCase() || name === name.toLowerCase())) {
    alerts.push({ field: "full_name", message: "Name has no proper capitalization", severity: "medium" });
  }

  // Repeated characters (e.g. "aaaa bbbb")
  if (/(.)\1{3,}/.test(lower)) {
    alerts.push({ field: "full_name", message: "Name has repeated characters — likely fake", severity: "high" });
  }

  // Known test/junk names
  const junkNames = ["test", "unknown", "n/a", "none", "no name", "null", "undefined", "lead", "hemlane lead"];
  if (junkNames.includes(lower)) {
    alerts.push({ field: "full_name", message: "Name is a placeholder", severity: "high" });
  }

  return alerts;
}

function analyzePhone(phone: string | null): Alert[] {
  if (!phone) return [];
  const alerts: Alert[] = [];
  const digits = phone.replace(/\D/g, "");

  // Too short
  if (digits.length < 10) {
    alerts.push({ field: "phone", message: `Phone has only ${digits.length} digits`, severity: "high" });
  }

  // Too long
  if (digits.length > 15) {
    alerts.push({ field: "phone", message: "Phone number is unusually long", severity: "medium" });
  }

  // All same digit (e.g. 0000000000)
  if (digits.length >= 10 && /^(\d)\1+$/.test(digits)) {
    alerts.push({ field: "phone", message: "Phone is all the same digit — likely fake", severity: "high" });
  }

  // Sequential digits
  if (digits.includes("1234567") || digits.includes("7654321")) {
    alerts.push({ field: "phone", message: "Phone has sequential digits — likely fake", severity: "high" });
  }

  // Known fake numbers
  const fakePatterns = ["5551234", "0000000", "1111111", "9999999"];
  for (const p of fakePatterns) {
    if (digits.includes(p)) {
      alerts.push({ field: "phone", message: "Phone matches a known fake pattern", severity: "high" });
      break;
    }
  }

  return alerts;
}

function analyzeEmail(email: string | null): Alert[] {
  if (!email) return [];
  const alerts: Alert[] = [];
  const lower = email.toLowerCase().trim();

  // Basic format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) {
    alerts.push({ field: "email", message: "Email format is invalid", severity: "high" });
    return alerts;
  }

  // Known test/junk patterns
  const junkPatterns = ["test@", "fake@", "noreply@", "no-reply@", "example@", "nobody@", "null@"];
  for (const p of junkPatterns) {
    if (lower.startsWith(p)) {
      alerts.push({ field: "email", message: "Email looks like a test/placeholder", severity: "high" });
      break;
    }
  }

  // Unusually long local part
  const localPart = lower.split("@")[0];
  if (localPart.length > 40) {
    alerts.push({ field: "email", message: "Email local part is unusually long", severity: "medium" });
  }

  // All numbers local part
  if (/^\d+$/.test(localPart)) {
    alerts.push({ field: "email", message: "Email local part is all numbers", severity: "medium" });
  }

  return alerts;
}

function analyzeLead(lead: { full_name: string | null; phone: string | null; email: string | null }): Alert[] {
  return [
    ...analyzeFullName(lead.full_name),
    ...analyzePhone(lead.phone),
    ...analyzeEmail(lead.email),
  ];
}

// ── Name cleaning / restoration ──

const JUNK_WORDS = [
  "com", "comments", "comment", "hemlane", "reply", "subject",
  "fwd", "re", "via", "click", "here", "view", "unsubscribe",
  "mailto", "http", "https", "www", "notification", "alert",
  "digest", "daily", "update", "message", "new", "lead",
];

/** Strip junk words and artifacts from a name, return cleaned version or null if unsalvageable */
function cleanName(name: string | null): string | null {
  if (!name) return null;

  let cleaned = name
    // Remove URLs
    .replace(/https?:\/\/\S+/gi, "")
    // Remove email addresses
    .replace(/\S+@\S+\.\S+/g, "")
    // Remove .com and similar
    .replace(/\.\w{2,4}\b/g, "")
    // Remove HTML-like tags
    .replace(/<[^>]+>/g, "")
    // Remove special characters except hyphens and apostrophes
    .replace(/[^a-zA-ZÀ-ÿ\s'-]/g, " ");

  // Remove junk words (case-insensitive, whole words)
  const words = cleaned.split(/\s+/).filter((w) => {
    const lower = w.toLowerCase().replace(/[^a-z]/g, "");
    return lower.length > 0 && !JUNK_WORDS.includes(lower);
  });

  if (words.length === 0) return null;

  // Capitalize each word properly
  const result = words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    .trim();

  return result.length >= 2 ? result : null;
}

/** Check if this lead has name alerts (meaning Restore button should show) */
function hasNameAlert(lead: SuspectLead): boolean {
  return lead.alerts.some((a) => a.field === "full_name");
}

/** Try to produce a cleaned name, or null if nothing salvageable */
function suggestCleanedName(lead: SuspectLead): string | null {
  if (!lead.full_name) return null;
  return cleanName(lead.full_name);
}

// ── Component ──

type EditingCell = { leadId: string; field: "full_name" | "phone" | "email" } | null;

export const SuspectTab: React.FC<SuspectTabProps> = ({ refreshKey, onCountChange }) => {
  const { userRecord } = useAuth();
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<SuspectLead[]>([]);
  const [editing, setEditing] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SuspectLead | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<{
    lead: SuspectLead;
    suggestions: Record<string, string>;
  } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreAllProgress, setRestoreAllProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    fetchSuspect();
  }, [userRecord?.organization_id, refreshKey]);

  const fetchSuspect = async () => {
    if (!userRecord?.organization_id) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("leads")
      .select("id, full_name, phone, email, status, lead_score, source, created_at")
      .eq("organization_id", userRecord.organization_id)
      .neq("status", "lost")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch leads for analysis:", error.message);
      setLoading(false);
      return;
    }

    const suspects: SuspectLead[] = [];
    for (const lead of data || []) {
      const alerts = analyzeLead(lead);
      if (alerts.length > 0) {
        suspects.push({ ...lead, alerts });
      }
    }

    // Sort: high severity first, then by alert count
    suspects.sort((a, b) => {
      const aHigh = a.alerts.filter((al) => al.severity === "high").length;
      const bHigh = b.alerts.filter((al) => al.severity === "high").length;
      if (bHigh !== aHigh) return bHigh - aHigh;
      return b.alerts.length - a.alerts.length;
    });

    setLeads(suspects);
    onCountChange(suspects.length);
    setLoading(false);
  };

  const startEdit = (leadId: string, field: "full_name" | "phone" | "email", currentValue: string | null) => {
    setEditing({ leadId, field });
    setEditValue(currentValue || "");
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditValue("");
  };

  const saveEdit = async () => {
    if (!editing || !editValue.trim()) return;
    setSaving(true);

    const updateData: Record<string, any> = {
      [editing.field]: editValue.trim(),
      updated_at: new Date().toISOString(),
    };

    if (editing.field === "full_name") {
      const parts = editValue.trim().split(" ");
      updateData.first_name = parts[0] || null;
      updateData.last_name = parts.slice(1).join(" ") || null;
    }

    const { error } = await supabase
      .from("leads")
      .update(updateData)
      .eq("id", editing.leadId);

    setSaving(false);

    if (error) {
      toast.error("Save failed", { description: error.message });
      return;
    }

    toast.success("Updated");

    // Re-analyze the updated lead
    setLeads((prev) => {
      const updated = prev.map((l) => {
        if (l.id !== editing.leadId) return l;
        const newLead = { ...l, [editing.field]: editValue.trim() };
        const newAlerts = analyzeLead(newLead);
        return { ...newLead, alerts: newAlerts };
      });
      // Remove leads with no alerts left
      const stillSuspect = updated.filter((l) => l.alerts.length > 0);
      onCountChange(stillSuspect.length);
      return stillSuspect;
    });

    cancelEdit();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    // Re-point related records before delete (same as merge logic)
    const leadIdTables = [
      "lead_notes", "calls", "showings", "agent_tasks",
      "lead_score_history", "consent_log", "communications",
      "cost_records", "lead_predictions", "competitor_mentions",
    ];
    for (const table of leadIdTables) {
      await supabase.from(table).delete().eq("lead_id", deleteTarget.id);
    }
    await supabase.from("system_logs").update({ related_lead_id: null }).eq("related_lead_id", deleteTarget.id);
    await supabase.from("referrals").delete().eq("referrer_lead_id", deleteTarget.id);
    await supabase.from("referrals").update({ referred_lead_id: null }).eq("referred_lead_id", deleteTarget.id);

    const { error } = await supabase.from("leads").delete().eq("id", deleteTarget.id);
    setDeleting(false);

    if (error) {
      toast.error("Delete failed", { description: error.message });
      setDeleteTarget(null);
      return;
    }

    toast.success("Lead deleted", {
      description: `${deleteTarget.full_name || "Lead"} permanently removed.`,
    });

    setLeads((prev) => {
      const remaining = prev.filter((l) => l.id !== deleteTarget.id);
      onCountChange(remaining.length);
      return remaining;
    });
    setDeleteTarget(null);
  };

  const handleRestoreClick = (lead: SuspectLead) => {
    const cleaned = suggestCleanedName(lead);
    if (cleaned) {
      // Show preview dialog
      setRestoreTarget({ lead, suggestions: { full_name: cleaned } });
    } else {
      // No auto-suggestion — open inline edit on name
      startEdit(lead.id, "full_name", "");
    }
  };

  const handleRestoreConfirm = async () => {
    if (!restoreTarget) return;
    setRestoring(true);

    const { lead, suggestions } = restoreTarget;
    const updateData: Record<string, any> = {
      ...suggestions,
      updated_at: new Date().toISOString(),
    };

    if (suggestions.full_name) {
      const parts = suggestions.full_name.trim().split(" ");
      updateData.first_name = parts[0] || null;
      updateData.last_name = parts.slice(1).join(" ") || null;
    }

    const { error } = await supabase
      .from("leads")
      .update(updateData)
      .eq("id", lead.id);

    setRestoring(false);

    if (error) {
      toast.error("Restore failed", { description: error.message });
      return;
    }

    toast.success("Lead restored", {
      description: `${lead.full_name} → ${suggestions.full_name || lead.full_name}`,
    });

    // Re-analyze
    setLeads((prev) => {
      const updated = prev.map((l) => {
        if (l.id !== lead.id) return l;
        const newLead = { ...l, ...suggestions };
        const newAlerts = analyzeLead(newLead);
        return { ...newLead, alerts: newAlerts } as SuspectLead;
      });
      const stillSuspect = updated.filter((l) => l.alerts.length > 0);
      onCountChange(stillSuspect.length);
      return stillSuspect;
    });

    setRestoreTarget(null);
  };

  const handleRestoreAll = async () => {
    // Collect all leads with a valid auto-clean suggestion
    const restorable = leads
      .map((lead) => ({ lead, cleaned: suggestCleanedName(lead) }))
      .filter((r): r is { lead: SuspectLead; cleaned: string } => r.cleaned !== null)
      .map((r) => ({ lead: r.lead, suggestions: { full_name: r.cleaned } }));

    if (restorable.length === 0) {
      toast.info("No leads can be auto-restored. Edit or delete them manually.");
      return;
    }

    setRestoreAllProgress({ current: 0, total: restorable.length });
    let succeeded = 0;

    for (let i = 0; i < restorable.length; i++) {
      const { lead, suggestions } = restorable[i];
      setRestoreAllProgress({ current: i + 1, total: restorable.length });

      const updateData: Record<string, any> = {
        ...suggestions,
        updated_at: new Date().toISOString(),
      };
      if (suggestions.full_name) {
        const parts = suggestions.full_name.trim().split(" ");
        updateData.first_name = parts[0] || null;
        updateData.last_name = parts.slice(1).join(" ") || null;
      }

      const { error } = await supabase
        .from("leads")
        .update(updateData)
        .eq("id", lead.id);

      if (!error) succeeded++;
    }

    setRestoreAllProgress(null);
    toast.success(`Restored ${succeeded} of ${restorable.length} leads`);
    fetchSuspect();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") cancelEdit();
  };

  const renderEditableCell = (lead: SuspectLead, field: "full_name" | "phone" | "email") => {
    const isEditing = editing?.leadId === lead.id && editing?.field === field;
    const value = lead[field];
    const hasAlert = lead.alerts.some((a) => a.field === field);

    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-8 text-sm"
            autoFocus
            disabled={saving}
          />
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveEdit}>
                <Check className="h-3.5 w-3.5 text-green-600" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit}>
                <X className="h-3.5 w-3.5 text-red-500" />
              </Button>
            </>
          )}
        </div>
      );
    }

    return (
      <span
        className={`text-sm cursor-pointer hover:text-blue-600 ${hasAlert ? "text-red-600 font-medium" : ""}`}
        onClick={() => startEdit(lead.id, field, value)}
        title="Click to edit"
      >
        {value || "—"}
      </span>
    );
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
        icon={AlertTriangle}
        title="Nothing to review"
        description="All leads have valid-looking names, phones, and emails."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {leads.length} lead{leads.length !== 1 ? "s" : ""} need review.
          Click on flagged fields to fix them, or delete junk leads.
        </p>
        {!restoreAllProgress && leads.some((l) => suggestCleanedName(l)) && (
          <Button onClick={handleRestoreAll} className="bg-[#370d4b] hover:bg-[#370d4b]/90">
            <Wand2 className="h-4 w-4 mr-1.5" />
            Restore All ({leads.filter((l) => suggestCleanedName(l)).length})
          </Button>
        )}
      </div>

      {restoreAllProgress && (
        <div className="rounded-lg border p-4 bg-muted/30">
          <div className="flex items-center gap-3 mb-2">
            <Loader2 className="h-4 w-4 animate-spin text-[#370d4b]" />
            <span className="text-sm font-medium">
              Restoring {restoreAllProgress.current} of {restoreAllProgress.total}...
            </span>
          </div>
          <Progress
            value={(restoreAllProgress.current / restoreAllProgress.total) * 100}
            className="h-2"
          />
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Alerts</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    {lead.alerts.map((alert, i) => (
                      <Badge
                        key={i}
                        className={`text-xs whitespace-nowrap ${
                          alert.severity === "high"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {alert.message}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>{renderEditableCell(lead, "full_name")}</TableCell>
                <TableCell>{renderEditableCell(lead, "phone")}</TableCell>
                <TableCell>{renderEditableCell(lead, "email")}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-xs">
                    {lead.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(lead.created_at), "MMM d")}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {hasNameAlert(lead) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-[#370d4b] hover:text-[#370d4b] hover:bg-purple-50"
                        onClick={() => handleRestoreClick(lead)}
                        title="Restore — clean up this lead"
                      >
                        <Wand2 className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setDeleteTarget(lead)}
                      title="Delete this lead"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete Lead
            </AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete <strong>{deleteTarget?.full_name || "this lead"}</strong> and all
              their associated records (notes, calls, tasks, etc.)?
              <br /><br />
              <strong>This cannot be undone.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Lead"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore confirmation */}
      <AlertDialog open={!!restoreTarget} onOpenChange={(open) => !open && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-[#370d4b]" />
              Restore Lead
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Clean up this lead's data and move it to the main Leads list:</p>
                {restoreTarget?.suggestions.full_name && (
                  <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Before:</span>
                      <span className="line-through text-red-600">{restoreTarget.lead.full_name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">After:</span>
                      <span className="font-medium text-green-700">{restoreTarget.suggestions.full_name}</span>
                    </div>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  Phone and email will be kept as-is.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestoreConfirm}
              disabled={restoring}
              className="bg-[#370d4b] hover:bg-[#370d4b]/90"
            >
              {restoring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Restoring...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-1.5" />
                  Restore
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
