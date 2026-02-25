import React, { useState, useEffect } from "react";
import { UserX, Check, X, Loader2, AlertTriangle } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";

interface IncompleteLead {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  lead_score: number | null;
  source: string | null;
  created_at: string;
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
      .or(
        "full_name.is.null,phone.is.null,email.is.null"
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch incomplete leads:", error.message);
      setLoading(false);
      return;
    }

    // Filter further: exclude leads that have all 3 fields (the OR filter catches any null)
    const incomplete = (data || []).filter(
      (l) => !l.full_name || !l.phone || !l.email
    );

    setLeads(incomplete);
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

    // Sync first/last name when updating full_name
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

    toast.success("Updated", { description: `${editing.field.replace("_", " ")} saved.` });

    // Update local state
    setLeads((prev) =>
      prev.map((l) =>
        l.id === editing.leadId ? { ...l, [editing.field]: editValue.trim() } : l
      )
    );

    // Remove from list if now complete
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
          + Add {field.replace("_", " ")}
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
              <TableHead>Source</TableHead>
              <TableHead>Created</TableHead>
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
                  <TableCell className="text-sm text-muted-foreground">
                    {lead.source || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(lead.created_at), "MMM d")}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
