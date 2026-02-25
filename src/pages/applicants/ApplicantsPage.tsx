import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  FileText,
  ExternalLink,
  Trash2,
  ArrowRight,
  Loader2,
  UserCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { ScoreDisplay } from "@/components/leads/ScoreDisplay";
import { EmptyState } from "@/components/ui/EmptyState";

interface Applicant {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  lead_score: number | null;
  status: string;
  updated_at: string;
  created_at: string;
  source: string | null;
  property_address?: string;
  interested_property_id: string | null;
}

const NEXT_STATUSES = [
  { value: "converted", label: "Converted (Leased)" },
  { value: "lost", label: "Lost" },
  { value: "showing_scheduled", label: "Back to Showing Scheduled" },
  { value: "qualified", label: "Back to Qualified" },
];

const ApplicantsPage = () => {
  const { userRecord } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [search, setSearch] = useState("");
  const [removeDialog, setRemoveDialog] = useState<Applicant | null>(null);
  const [moveDialog, setMoveDialog] = useState<Applicant | null>(null);
  const [nextStatus, setNextStatus] = useState("converted");
  const [saving, setSaving] = useState(false);

  const fetchApplicants = async () => {
    if (!userRecord?.organization_id) return;
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("leads")
        .select(`
          id, full_name, email, phone, lead_score, status,
          updated_at, created_at, source, interested_property_id,
          properties(address, city)
        `)
        .eq("organization_id", userRecord.organization_id)
        .eq("status", "in_application")
        .order("updated_at", { ascending: false });

      if (error) throw error;

      setApplicants(
        (data || []).map((l: any) => ({
          id: l.id,
          full_name: l.full_name,
          email: l.email,
          phone: l.phone,
          lead_score: l.lead_score,
          status: l.status,
          updated_at: l.updated_at,
          created_at: l.created_at,
          source: l.source,
          interested_property_id: l.interested_property_id,
          property_address: l.properties
            ? `${l.properties.address}, ${l.properties.city}`
            : undefined,
        }))
      );
    } catch (err) {
      console.error("Error fetching applicants:", err);
      toast.error("Failed to load applicants");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplicants();
  }, [userRecord?.organization_id]);

  const handleMoveStatus = async () => {
    if (!moveDialog) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from("leads")
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", moveDialog.id);

      if (error) throw error;

      toast.success(
        `${moveDialog.full_name || "Lead"} moved to ${nextStatus.replace(/_/g, " ")}`
      );
      setMoveDialog(null);
      fetchApplicants();
    } catch (err) {
      console.error("Error updating status:", err);
      toast.error("Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!removeDialog) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from("leads")
        .update({
          status: "lost",
          updated_at: new Date().toISOString(),
        })
        .eq("id", removeDialog.id);

      if (error) throw error;

      toast.success(
        `${removeDialog.full_name || "Lead"} removed from applicants`
      );
      setRemoveDialog(null);
      fetchApplicants();
    } catch (err) {
      console.error("Error removing applicant:", err);
      toast.error("Failed to remove applicant");
    } finally {
      setSaving(false);
    }
  };

  const filtered = applicants.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.full_name?.toLowerCase().includes(q) ||
      a.email?.toLowerCase().includes(q) ||
      a.phone?.includes(q) ||
      a.property_address?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Applicants</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Leads currently in the application stage ({applicants.length})
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, phone..."
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
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12">
              <EmptyState
                icon={UserCheck}
                title="No applicants"
                description={
                  search
                    ? "No applicants match your search"
                    : "Leads in the 'in_application' stage will appear here"
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((applicant) => (
                  <TableRow
                    key={applicant.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/leads/${applicant.id}`)}
                  >
                    <TableCell className="font-medium">
                      {applicant.full_name || "Unknown"}
                      {applicant.source && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          {applicant.source}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {applicant.email && (
                          <div className="text-muted-foreground">{applicant.email}</div>
                        )}
                        {applicant.phone && (
                          <div className="text-muted-foreground">{applicant.phone}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {applicant.property_address ? (
                        <span className="text-sm">{applicant.property_address}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">No property</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {applicant.lead_score != null ? (
                        <ScoreDisplay score={applicant.lead_score} size="sm" />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(applicant.updated_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          title="View lead detail"
                          onClick={() => navigate(`/leads/${applicant.id}`)}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Move to another stage"
                          onClick={() => {
                            setNextStatus("converted");
                            setMoveDialog(applicant);
                          }}
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Remove from applicants"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setRemoveDialog(applicant)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Move Status Dialog */}
      <Dialog open={!!moveDialog} onOpenChange={() => setMoveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Applicant</DialogTitle>
            <DialogDescription>
              Move <strong>{moveDialog?.full_name || "this lead"}</strong> to a
              different stage.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={nextStatus} onValueChange={setNextStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NEXT_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialog(null)}>
              Cancel
            </Button>
            <Button onClick={handleMoveStatus} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <Dialog open={!!removeDialog} onOpenChange={() => setRemoveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Applicant</DialogTitle>
            <DialogDescription>
              This will mark{" "}
              <strong>{removeDialog?.full_name || "this lead"}</strong> as{" "}
              <strong>Lost</strong> and remove them from the applicants list.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={saving}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ApplicantsPage;
