import React, { useState, useEffect, useMemo } from "react";
import { AlertTriangle, Trash2, Check, X, Loader2, Wand2, CalendarClock, RefreshCw } from "lucide-react";
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
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { format } from "date-fns";

/** Extract the real error message from a Supabase FunctionsHttpError body — its
 *  .message is only the generic "non-2xx status code" string; the reason (e.g.
 *  "Only admins can delete leads") lives in the response body. */
async function readEdgeError(error: any): Promise<string | null> {
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      return body?.error || null;
    }
  } catch {
    /* fall through to caller's fallback */
  }
  return null;
}

interface SuspectLead {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
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
  const permissions = usePermissions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);
  const [leads, setLeads] = useState<SuspectLead[]>([]);
  const [editing, setEditing] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SuspectLead | null>(null);
  const [deleteShowings, setDeleteShowings] = useState<{ date: string; property: string }[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<{
    lead: SuspectLead;
    suggestions: Record<string, string>;
  } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreAllOpen, setRestoreAllOpen] = useState(false);
  const [restoreAllProgress, setRestoreAllProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  // Only leads actually flagged for their NAME are auto-restorable — leads flagged
  // solely for phone/email issues must not get their names rewritten. Skip
  // suggestions that wouldn't change anything.
  const restorableLeads = useMemo(
    () =>
      leads
        .map((lead) => ({ lead, cleaned: suggestCleanedName(lead) }))
        .filter(
          (r): r is { lead: SuspectLead; cleaned: string } =>
            r.cleaned !== null && hasNameAlert(r.lead) && r.cleaned !== r.lead.full_name
        ),
    [leads]
  );

  useEffect(() => {
    fetchSuspect();
  }, [userRecord?.organization_id, refreshKey, localRefresh]);

  const fetchSuspect = async () => {
    if (!userRecord?.organization_id) return;
    const orgId = userRecord.organization_id;
    setLoading(true);
    setError(null);

    // Fire all 1000-row pages in parallel (mirrors DuplicatesTab) — the old
    // sequential loop made ~19 round-trips over all non-lost leads on every visit.
    const PAGE = 1000;
    let data: any[] = [];
    try {
      const cols = "id, full_name, phone, email, status, source, created_at";
      const head = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .neq("status", "lost");
      if (head.error) throw new Error(head.error.message);
      const pages = Math.max(1, Math.ceil((head.count || 0) / PAGE));
      const results = await Promise.all(
        Array.from({ length: pages }, (_, i) =>
          supabase
            .from("leads")
            .select(cols)
            .eq("organization_id", orgId)
            .neq("status", "lost")
            .order("id", { ascending: true })
            .range(i * PAGE, i * PAGE + PAGE - 1)
        )
      );
      // Keyed by id — parallel pages can overlap if rows are inserted mid-scan
      const byId = new Map<string, any>();
      for (const res of results) {
        if (res.error) throw new Error(res.error.message);
        for (const row of res.data || []) byId.set(row.id, row);
      }
      data = Array.from(byId.values());
    } catch (err: any) {
      // Never render the success "nothing to review" empty state on a failed fetch
      console.error("Failed to fetch leads for analysis:", err.message);
      setError(err.message);
      toast.error("Could not load leads for review", { description: err.message });
      setLoading(false);
      return;
    }

    const suspects: SuspectLead[] = [];
    for (const lead of data) {
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
    if (!editing || !editValue.trim() || !userRecord?.organization_id) return;
    setSaving(true);

    const editedField = editing.field;
    const editedId = editing.leadId;

    const updateData: Record<string, any> = {
      [editedField]: editValue.trim(),
      updated_at: new Date().toISOString(),
    };

    if (editedField === "full_name") {
      const parts = editValue.trim().split(" ");
      updateData.first_name = parts[0] || null;
      updateData.last_name = parts.slice(1).join(" ") || null;
    }

    // Return the stored row: the capitalize_lead_name trigger initcaps names, so
    // re-analyzing the typed value would keep a stale "no capitalization" flag.
    // Org-scoped for defense-in-depth (never rely on RLS alone).
    const { data: updatedRow, error } = await supabase
      .from("leads")
      .update(updateData)
      .eq("id", editedId)
      .eq("organization_id", userRecord.organization_id)
      .select("full_name, phone, email")
      .single();

    setSaving(false);

    if (error) {
      toast.error("Save failed", { description: error.message });
      return;
    }

    toast.success("Updated");

    // Re-analyze against the DB-normalized values
    setLeads((prev) => {
      const updated = prev.map((l) => {
        if (l.id !== editedId) return l;
        const newLead = {
          ...l,
          full_name: updatedRow?.full_name ?? l.full_name,
          phone: updatedRow?.phone ?? l.phone,
          email: updatedRow?.email ?? l.email,
        };
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

    const { data, error } = await supabase.functions.invoke("delete-lead", {
      body: { lead_id: deleteTarget.id },
    });
    setDeleting(false);

    if (error || (data && data.error)) {
      // FunctionsHttpError's .message is generic — read the real reason from the body
      const reason = data?.error || (await readEdgeError(error)) || error?.message;
      toast.error("Delete failed", { description: reason });
      setDeleteTarget(null);
      setDeleteShowings([]);
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
    if (!restoreTarget || !userRecord?.organization_id) return;
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

    const { data: updatedRow, error } = await supabase
      .from("leads")
      .update(updateData)
      .eq("id", lead.id)
      .eq("organization_id", userRecord.organization_id)
      .select("full_name, phone, email")
      .single();

    setRestoring(false);

    if (error) {
      toast.error("Restore failed", { description: error.message });
      return;
    }

    toast.success("Lead restored", {
      description: `${lead.full_name} → ${updatedRow?.full_name || suggestions.full_name || lead.full_name}`,
    });

    // Re-analyze against the DB-normalized values
    setLeads((prev) => {
      const updated = prev.map((l) => {
        if (l.id !== lead.id) return l;
        const newLead = {
          ...l,
          full_name: updatedRow?.full_name ?? l.full_name,
          phone: updatedRow?.phone ?? l.phone,
          email: updatedRow?.email ?? l.email,
        };
        const newAlerts = analyzeLead(newLead);
        return { ...newLead, alerts: newAlerts } as SuspectLead;
      });
      const stillSuspect = updated.filter((l) => l.alerts.length > 0);
      onCountChange(stillSuspect.length);
      return stillSuspect;
    });

    setRestoreTarget(null);
  };

  const handleRestoreAllClick = () => {
    if (restorableLeads.length === 0) {
      toast.info("No leads can be auto-restored. Edit or delete them manually.");
      return;
    }
    // Never bulk-rewrite names without showing the Before → After list first
    setRestoreAllOpen(true);
  };

  const handleRestoreAllConfirm = async () => {
    if (!userRecord?.organization_id) return;
    const orgId = userRecord.organization_id;
    const restorable = restorableLeads.map((r) => ({
      lead: r.lead,
      suggestions: { full_name: r.cleaned },
    }));
    setRestoreAllOpen(false);

    setRestoreAllProgress({ current: 0, total: restorable.length });
    let succeeded = 0;
    let failed = 0;
    let firstError: string | null = null;

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
        .eq("id", lead.id)
        .eq("organization_id", orgId);

      if (error) {
        failed++;
        if (!firstError) firstError = error.message;
      } else {
        succeeded++;
      }
    }

    setRestoreAllProgress(null);
    // Don't report a green success when some (or all) rows failed
    if (succeeded === 0 && failed > 0) {
      toast.error(`Restore failed: 0 of ${restorable.length} restored`, {
        description: firstError || undefined,
      });
    } else if (failed > 0) {
      toast.warning(`Restored ${succeeded} of ${restorable.length} — ${failed} failed`, {
        description: firstError || undefined,
      });
    } else {
      toast.success(`Restored ${succeeded} of ${restorable.length} leads`);
    }
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
      <button
        type="button"
        className={`text-sm text-left cursor-pointer hover:text-blue-600 ${hasAlert ? "text-red-600 font-medium" : ""}`}
        onClick={() => startEdit(lead.id, field, value)}
        title="Click to edit"
      >
        {value || "—"}
      </button>
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

  // A failed fetch must never masquerade as a clean database
  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-6 text-center space-y-3">
        <p className="text-sm text-red-700">Couldn't load leads for review: {error}</p>
        <Button variant="outline" size="sm" onClick={() => setLocalRefresh((k) => k + 1)}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
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
        {!restoreAllProgress && restorableLeads.length > 0 && (
          <Button onClick={handleRestoreAllClick} className="bg-[#4F46E5] hover:bg-[#4F46E5]/90">
            <Wand2 className="h-4 w-4 mr-1.5" />
            Restore All ({restorableLeads.length})
          </Button>
        )}
      </div>

      {restoreAllProgress && (
        <div className="rounded-lg border p-4 bg-muted/30">
          <div className="flex items-center gap-3 mb-2">
            <Loader2 className="h-4 w-4 animate-spin text-[#4F46E5]" />
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
                        className="h-8 w-8 text-[#4F46E5] hover:text-[#4F46E5] hover:bg-indigo-50"
                        onClick={() => handleRestoreClick(lead)}
                        title="Restore — clean up this lead"
                      >
                        <Wand2 className="h-4 w-4" />
                      </Button>
                    )}
                    {/* Only admins can delete (delete-lead edge fn is admin-only);
                        showing the button to editors/leasing_agents only 403s. */}
                    {permissions.canDeleteLead && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={async () => {
                          if (!userRecord?.organization_id) return;
                          const { data: upcomingShowings, error: showingsError } = await supabase
                            .from("showings")
                            .select("scheduled_at, properties:property_id(address)")
                            .eq("organization_id", userRecord.organization_id)
                            .eq("lead_id", lead.id)
                            .gte("scheduled_at", new Date().toISOString())
                            .in("status", ["scheduled", "confirmed"]);
                          if (showingsError) {
                            // Don't open the delete dialog with a silently-broken warning
                            toast.error("Could not check upcoming showings", {
                              description: showingsError.message,
                            });
                            return;
                          }
                          setDeleteShowings(
                            (upcomingShowings || []).map((s: any) => ({
                              date: s.scheduled_at,
                              property: (s.properties as any)?.address || "Unknown property",
                            }))
                          );
                          setDeleteTarget(lead);
                        }}
                        title="Delete this lead"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteShowings([]); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete Lead
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Permanently delete <strong>{deleteTarget?.full_name || "this lead"}</strong> and all
                  their associated records (notes, calls, tasks, etc.)?
                </p>
                {deleteShowings.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
                    <div className="flex items-center gap-2 font-medium text-amber-800">
                      <CalendarClock className="h-4 w-4" />
                      This lead has {deleteShowings.length} upcoming showing{deleteShowings.length > 1 ? "s" : ""}!
                    </div>
                    <ul className="text-sm text-amber-700 space-y-1 ml-6 list-disc">
                      {deleteShowings.map((s, i) => (
                        <li key={i}>
                          {format(new Date(s.date), "MMM d, yyyy 'at' h:mm a")} — {s.property}
                        </li>
                      ))}
                    </ul>
                    <p className="text-sm font-medium text-amber-800">
                      Deleting will cancel these showings. Consider restoring this lead instead.
                    </p>
                  </div>
                )}
                <p><strong>This cannot be undone.</strong></p>
              </div>
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
                deleteShowings.length > 0 ? "Delete Anyway" : "Delete Lead"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore All confirmation — bulk name rewrites always get a preview */}
      <AlertDialog open={restoreAllOpen} onOpenChange={setRestoreAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-[#4F46E5]" />
              Restore All ({restorableLeads.length})
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will rewrite the name on {restorableLeads.length} lead
                  {restorableLeads.length !== 1 ? "s" : ""}. Review the changes before
                  confirming — this cannot be undone.
                </p>
                <div className="rounded-lg border p-3 bg-muted/30 max-h-64 overflow-y-auto space-y-2">
                  {restorableLeads.map(({ lead, cleaned }) => (
                    <div key={lead.id} className="text-sm">
                      <span className="line-through text-red-600">{lead.full_name}</span>
                      <span className="text-muted-foreground mx-1.5">→</span>
                      <span className="font-medium text-green-700">{cleaned}</span>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  Phones and emails will be kept as-is.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestoreAllConfirm}
              className="bg-[#4F46E5] hover:bg-[#4F46E5]/90"
            >
              <Wand2 className="h-4 w-4 mr-1.5" />
              Restore {restorableLeads.length}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore confirmation */}
      <AlertDialog open={!!restoreTarget} onOpenChange={(open) => !open && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-[#4F46E5]" />
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
              className="bg-[#4F46E5] hover:bg-[#4F46E5]/90"
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
