import React, { useState, useEffect } from "react";
import { UserX, Check, X, Loader2, Trash2, AlertTriangle, CalendarClock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import type { TablesUpdate } from "@/integrations/supabase/types";

// Agent name mapping (same as LeadsList). Keys must match the UNDERSCORE
// agent_type values the DB actually writes (welcome_sequence, showing_nurture,
// notification_dispatcher, ...) — the earlier hyphenated keys never matched and
// leaked raw slugs into the Next Action column.
const AGENT_NAMES: Record<string, string> = {
  aaron: "Aaron", esther: "Esther", nehemiah: "Nehemiah",
  elijah: "Elijah", samuel: "Samuel", zacchaeus: "Zacchaeus",
  main_inbound: "Aaron",
  hemlane_parser: "Esther", scoring: "Nehemiah", transcript_analyst: "Nehemiah",
  task_dispatcher: "Nehemiah", recapture: "Elijah", showing_confirmation: "Samuel",
  // Canonical underscore agent_types (see agent_tasks in prod)
  welcome_sequence: "Elijah", showing_nurture: "Samuel",
  notification_dispatcher: "Nehemiah", conversion_predictor: "Nehemiah",
  sms_inbound: "Aaron", post_showing: "Samuel", no_show_followup: "Samuel",
  sheets_backup: "Zacchaeus",
  "twilio-inbound": "Aaron", "hemlane-parser": "Esther",
  "notification-dispatcher": "Nehemiah", campaign: "Elijah",
  "welcome-sequence": "Elijah",
};

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

interface IncompleteLead {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  source: string | null;
  created_at: string;
  nextAgent?: string | null;
  nextAction?: string | null;
  nextScheduled?: string | null;
}

interface IncompleteTabProps {
  refreshKey: number;
  onCountChange: (count: number) => void;
}

type EditingCell = { leadId: string; field: "full_name" | "phone" | "email" } | null;

export const IncompleteTab: React.FC<IncompleteTabProps> = ({ refreshKey, onCountChange }) => {
  const { userRecord } = useAuth();
  const permissions = usePermissions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<IncompleteLead[]>([]);
  const [editing, setEditing] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IncompleteLead | null>(null);
  const [deleteShowings, setDeleteShowings] = useState<{ date: string; property: string }[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [localRefresh, setLocalRefresh] = useState(0);

  useEffect(() => {
    fetchIncomplete();
  }, [userRecord?.organization_id, refreshKey, localRefresh]);

  const fetchIncomplete = async () => {
    if (!userRecord?.organization_id) return;
    setLoading(true);
    setError(null);

    // "Hemlane Lead (216) 555-0123"-style placeholders count as missing a name
    // even when phone/email are set — they were invisible here before (F33)
    // Paginate — the other tabs already learned the 1000-row PostgREST cap lesson.
    // Secondary sort by id keeps page boundaries deterministic.
    const data: any[] = [];
    const PAGE = 1000;
    for (let from = 0; from < 100000; from += PAGE) {
      const { data: page, error } = await supabase
        .from("leads")
        .select("id, full_name, phone, email, status, source, created_at")
        .eq("organization_id", userRecord.organization_id)
        .neq("status", "lost")
        .or("full_name.is.null,phone.is.null,email.is.null,full_name.like.Hemlane Lead*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        // Never render the success "all complete" empty state on a failed fetch —
        // surface the error and stop reporting a count so the page verdict is honest.
        console.error("Failed to fetch incomplete leads:", error.message);
        setError(error.message);
        toast.error("Could not load incomplete leads", { description: error.message });
        setLoading(false);
        return;
      }
      data.push(...(page || []));
      if (!page || page.length < PAGE) break;
    }

    const incomplete = (data || []).filter(
      (l) => !l.full_name || l.full_name.startsWith("Hemlane Lead") || !l.phone || !l.email
    );

    // Fetch next agent_task for each incomplete lead (chunked — .in() lists live
    // in the URL, so hundreds of UUIDs in one request blow past gateway limits)
    if (incomplete.length > 0) {
      const ids = incomplete.map((l) => l.id);
      const taskMap: Record<string, { agent_type: string; action_type: string; scheduled_for: string }> = {};
      // Keep worst-case rows under PostgREST's 1000-row cap: a lead in the
      // welcome sequence carries ~7 pending tasks, so 100 leads ≈ 700 rows.
      // A larger chunk could silently truncate and drop a lead's earliest task.
      const CHUNK = 100;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { data: tasks } = await supabase
          .from("agent_tasks")
          .select("lead_id, agent_type, action_type, scheduled_for")
          .eq("organization_id", userRecord.organization_id)
          .in("lead_id", ids.slice(i, i + CHUNK))
          .in("status", ["pending", "in_progress"])
          .order("scheduled_for", { ascending: true });
        for (const t of tasks || []) {
          if (!taskMap[t.lead_id]) taskMap[t.lead_id] = t;
        }
      }

      for (const lead of incomplete as any[]) {
        const task = taskMap[lead.id];
        if (task) {
          lead.nextAgent = AGENT_NAMES[task.agent_type] || task.agent_type;
          lead.nextAction = task.action_type;
          lead.nextScheduled = task.scheduled_for;
        }
      }
    }

    setLeads(incomplete as IncompleteLead[]);
    onCountChange(incomplete.length);
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

    const updateData: TablesUpdate<"leads"> = {
      [editedField]: editValue.trim(),
      updated_at: new Date().toISOString(),
    };

    if (editedField === "full_name") {
      const parts = editValue.trim().split(" ");
      updateData.first_name = parts[0] || null;
      updateData.last_name = parts.slice(1).join(" ") || null;
    }

    // Return the stored row: the capitalize_lead_name trigger rewrites names via
    // initcap, so the DB value can differ from what was typed. Org-scoped for
    // defense-in-depth (never rely on RLS alone).
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

    toast.success("Updated", { description: `${editedField.replace(/_/g, " ")} saved.` });

    // Reflect the DB-normalized values, then drop the row if it is now complete
    setLeads((prev) => {
      const updated = prev.map((l) =>
        l.id === editedId
          ? {
              ...l,
              full_name: updatedRow?.full_name ?? l.full_name,
              phone: updatedRow?.phone ?? l.phone,
              email: updatedRow?.email ?? l.email,
            }
          : l
      );
      const stillIncomplete = updated.filter(
        (l) => !l.full_name || l.full_name.startsWith("Hemlane Lead") || !l.phone || !l.email
      );
      onCountChange(stillIncomplete.length);
      return stillIncomplete;
    });

    cancelEdit();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") cancelEdit();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    // Route through the delete-lead edge function (same as SuspectTab) — it owns
    // the full FK cascade (email_events, showing deps, etc.) with the service role.
    // Hand-rolled client-side cascades destroyed child rows and then failed on the
    // lead delete itself.
    const { data, error } = await supabase.functions.invoke("delete-lead", {
      body: { lead_id: deleteTarget.id },
    });
    setDeleting(false);

    if (error || (data && data.error)) {
      // FunctionsHttpError's .message is the generic "non-2xx" string — the real
      // reason (e.g. "Only admins can delete leads") lives in the response body.
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
    setDeleteShowings([]);
  };

  const openDeleteDialog = async (lead: IncompleteLead) => {
    if (!userRecord?.organization_id) return;
    // Phone-only / email-only leads often book via Telegram or phone — warn
    // before a delete would silently cancel their upcoming showings (same guard
    // the For Review tab already had).
    const { data: upcoming, error: showErr } = await supabase
      .from("showings")
      .select("scheduled_at, properties:property_id(address)")
      .eq("organization_id", userRecord.organization_id)
      .eq("lead_id", lead.id)
      .gte("scheduled_at", new Date().toISOString())
      .in("status", ["scheduled", "confirmed"]);
    if (showErr) {
      toast.error("Could not check upcoming showings", { description: showErr.message });
      return;
    }
    setDeleteShowings(
      (upcoming || []).map((s: any) => ({
        date: s.scheduled_at,
        property: (s.properties as any)?.address || "Unknown property",
      }))
    );
    setDeleteTarget(lead);
  };

  const getSeverity = (lead: IncompleteLead): { label: string; color: string } => {
    if (!lead.full_name) return { label: "Missing name", color: "bg-red-100 text-red-800" };
    if (lead.full_name.startsWith("Hemlane Lead")) return { label: "Placeholder name", color: "bg-red-100 text-red-800" };
    if (!lead.phone && !lead.email) return { label: "No contact info", color: "bg-red-100 text-red-800" };
    if (!lead.phone) return { label: "Missing phone", color: "bg-amber-100 text-amber-800" };
    return { label: "Missing email", color: "bg-amber-100 text-amber-800" };
  };

  const renderCell = (lead: IncompleteLead, field: "full_name" | "phone" | "email") => {
    const isEditing = editing?.leadId === lead.id && editing?.field === field;
    const value = lead[field];

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
            placeholder={field === "phone" ? "+1..." : field === "email" ? "email@..." : "Full name"}
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

    if (!value) {
      return (
        <button
          className="text-sm text-blue-600 hover:underline cursor-pointer flex items-center gap-1"
          onClick={() => startEdit(lead.id, field, value)}
        >
          + Add {field.replace(/_/g, " ")}
        </button>
      );
    }

    return (
      <button
        type="button"
        className="text-sm text-left cursor-pointer hover:text-blue-600"
        onClick={() => startEdit(lead.id, field, value)}
        title="Click to edit"
      >
        {value}
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
        <p className="text-sm text-red-700">Couldn't load incomplete leads: {error}</p>
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
        icon={UserX}
        title="All leads are complete"
        description="Every lead has a name, phone, and email. Nice work!"
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {leads.length} lead{leads.length !== 1 ? "s" : ""} with missing information.
        Click on empty fields to fill them in.
      </p>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Severity</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Next Action</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => {
              const severity = getSeverity(lead);
              return (
                <TableRow key={lead.id}>
                  <TableCell>
                    <Badge className={`${severity.color} text-xs`}>
                      {severity.label}
                    </Badge>
                  </TableCell>
                  <TableCell>{renderCell(lead, "full_name")}</TableCell>
                  <TableCell>{renderCell(lead, "phone")}</TableCell>
                  <TableCell>{renderCell(lead, "email")}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {lead.nextAgent ? (
                      <div className="text-sm">
                        <span className="font-medium text-[#4F46E5]">{lead.nextAgent}</span>
                        <span className="text-muted-foreground"> · {lead.nextAction}</span>
                        {lead.nextScheduled && (
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(lead.nextScheduled), "MMM d, h:mm a")}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No action scheduled</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(lead.created_at), "MMM d")}
                  </TableCell>
                  <TableCell>
                    {/* Only admins can delete (delete-lead edge fn is admin-only);
                        showing the button to editors/leasing_agents only 403s. */}
                    {permissions.canDeleteLead && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => openDeleteDialog(lead)}
                        title="Delete this lead"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

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
                  associated records?
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
                      Deleting will cancel these showings.
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
    </div>
  );
};
