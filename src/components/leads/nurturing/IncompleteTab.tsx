import React, { useState, useEffect } from "react";
import { UserX, Check, X, Loader2, Trash2, AlertTriangle } from "lucide-react";
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
import { toast } from "sonner";
import { format } from "date-fns";

// Agent name mapping (same as LeadsList)
const AGENT_NAMES: Record<string, string> = {
  aaron: "Aaron", esther: "Esther", nehemiah: "Nehemiah", ruth: "Ruth",
  elijah: "Elijah", samuel: "Samuel", zacchaeus: "Zacchaeus",
  main_inbound: "Aaron", bland_call_webhook: "Aaron", sms_inbound: "Ruth",
  hemlane_parser: "Esther", scoring: "Nehemiah", transcript_analyst: "Nehemiah",
  task_dispatcher: "Nehemiah", recapture: "Elijah", showing_confirmation: "Samuel",
  "twilio-inbound": "Aaron", "sms-inbound": "Ruth", "hemlane-parser": "Esther",
  "notification-dispatcher": "Nehemiah", campaign: "Elijah", campaign_sms: "Ruth",
  "welcome-sequence": "Elijah", "campaign-voice": "Elijah",
};

interface IncompleteLead {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  lead_score: number | null;
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
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<IncompleteLead[]>([]);
  const [editing, setEditing] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IncompleteLead | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchIncomplete();
  }, [userRecord?.organization_id, refreshKey]);

  const fetchIncomplete = async () => {
    if (!userRecord?.organization_id) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("leads")
      .select("id, full_name, phone, email, status, lead_score, source, created_at")
      .eq("organization_id", userRecord.organization_id)
      .neq("status", "lost")
      .or("full_name.is.null,phone.is.null,email.is.null")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch incomplete leads:", error.message);
      setLoading(false);
      return;
    }

    const incomplete = (data || []).filter(
      (l) => !l.full_name || !l.phone || !l.email
    );

    // Fetch next agent_task for each incomplete lead
    if (incomplete.length > 0) {
      const ids = incomplete.map((l) => l.id);
      const { data: tasks } = await supabase
        .from("agent_tasks")
        .select("lead_id, agent_type, action_type, scheduled_for")
        .in("lead_id", ids)
        .in("status", ["pending", "in_progress"])
        .order("scheduled_for", { ascending: true });

      const taskMap: Record<string, { agent_type: string; action_type: string; scheduled_for: string }> = {};
      if (tasks) {
        for (const t of tasks) {
          if (!taskMap[t.lead_id]) taskMap[t.lead_id] = t;
        }
      }

      for (const lead of incomplete) {
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

    toast.success("Updated", { description: `${editing.field.replace(/_/g, " ")} saved.` });

    // Update local state and remove from list if now complete
    setLeads((prev) => {
      const updated = prev.map((l) =>
        l.id === editing.leadId ? { ...l, [editing.field]: editValue.trim() } : l
      );
      const stillIncomplete = updated.filter((l) => !l.full_name || !l.phone || !l.email);
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

  const getSeverity = (lead: IncompleteLead): { label: string; color: string } => {
    if (!lead.full_name) return { label: "Missing name", color: "bg-red-100 text-red-800" };
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
      <span
        className="text-sm cursor-pointer hover:text-blue-600"
        onClick={() => startEdit(lead.id, field, value)}
        title="Click to edit"
      >
        {value}
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setDeleteTarget(lead)}
                      title="Delete this lead"
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete Lead
            </AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete <strong>{deleteTarget?.full_name || "this lead"}</strong> and all
              associated records?
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
    </div>
  );
};
