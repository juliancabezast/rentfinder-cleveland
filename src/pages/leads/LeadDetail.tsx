import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Phone,
  Mail,
  AlertTriangle,
  Bot,
  Edit,
  Building2,
  MapPin,
  DollarSign,
  Calendar,
  Home,
  MessageSquare,
  PhoneCall,
  Eye,
  CalendarPlus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ScoreDisplay, ScoreChange } from "@/components/leads/ScoreDisplay";
import { LeadStatusBadge } from "@/components/leads/LeadStatusBadge";
import { LeadForm } from "@/components/leads/LeadForm";
import { HumanTakeoverModal } from "@/components/leads/HumanTakeoverModal";
import { ReleaseControlModal } from "@/components/leads/ReleaseControlModal";
import { ScheduleShowingDialog } from "@/components/showings/ScheduleShowingDialog";
import type { Tables } from "@/integrations/supabase/types";

type Lead = Tables<"leads">;
type ScoreHistory = Tables<"lead_score_history">;

interface LeadWithRelations extends Lead {
  properties?: { id: string; address: string; unit_number: string | null } | null;
  human_controller?: { full_name: string } | null;
}

const LEAD_STATUSES = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "engaged", label: "Engaged" },
  { value: "nurturing", label: "Nurturing" },
  { value: "qualified", label: "Qualified" },
  { value: "showing_scheduled", label: "Showing Scheduled" },
  { value: "showed", label: "Showed" },
  { value: "in_application", label: "In Application" },
  { value: "lost", label: "Lost" },
  { value: "converted", label: "Converted" },
];

const LeadDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userRecord } = useAuth();
  const permissions = usePermissions();
  const { toast } = useToast();

  const [lead, setLead] = useState<LeadWithRelations | null>(null);
  const [scoreHistory, setScoreHistory] = useState<ScoreHistory[]>([]);
  const [calls, setCalls] = useState<Tables<"calls">[]>([]);
  const [showings, setShowings] = useState<Tables<"showings">[]>([]);
  const [communications, setCommunications] = useState<Tables<"communications">[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [editOpen, setEditOpen] = useState(false);
  const [takeoverOpen, setTakeoverOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [scheduleShowingOpen, setScheduleShowingOpen] = useState(false);

  const fetchLead = async () => {
    if (!id) return;

    setLoading(true);
    try {
      // Fetch lead with property info
      const { data: leadData, error: leadError } = await supabase
        .from("leads")
        .select(
          `
          *,
          properties:interested_property_id (id, address, unit_number)
        `
        )
        .eq("id", id)
        .single();

      if (leadError) throw leadError;

      // Fetch human controller name separately if needed
      let humanControllerName: string | null = null;
      if (leadData.human_controlled_by) {
        const { data: userData } = await supabase
          .from("users")
          .select("full_name")
          .eq("id", leadData.human_controlled_by)
          .single();
        humanControllerName = userData?.full_name || null;
      }

      setLead({
        ...leadData,
        human_controller: humanControllerName ? { full_name: humanControllerName } : null,
      });

      // Fetch related data in parallel
      const [historyRes, callsRes, showingsRes, commsRes] = await Promise.all([
        supabase
          .from("lead_score_history")
          .select("*")
          .eq("lead_id", id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("calls")
          .select("*")
          .eq("lead_id", id)
          .order("started_at", { ascending: false })
          .limit(10),
        supabase
          .from("showings")
          .select("*")
          .eq("lead_id", id)
          .order("scheduled_at", { ascending: false })
          .limit(10),
        supabase
          .from("communications")
          .select("*")
          .eq("lead_id", id)
          .order("sent_at", { ascending: false })
          .limit(10),
      ]);

      setScoreHistory(historyRes.data || []);
      setCalls(callsRes.data || []);
      setShowings(showingsRes.data || []);
      setCommunications(commsRes.data || []);
    } catch (error) {
      console.error("Error fetching lead:", error);
      toast({
        title: "Error",
        description: "Failed to load lead details.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLead();
  }, [id]);

  const handleStatusChange = async (newStatus: string) => {
    if (!lead) return;

    try {
      const { error } = await supabase
        .from("leads")
        .update({ status: newStatus })
        .eq("id", lead.id);

      if (error) throw error;

      setLead({ ...lead, status: newStatus });
      toast({ title: "Status updated" });
    } catch (error) {
      console.error("Error updating status:", error);
      toast({
        title: "Error",
        description: "Failed to update status.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <h2 className="text-xl font-medium">Lead not found</h2>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/leads")}>
          Back to Leads
        </Button>
      </div>
    );
  }

  const leadName =
    lead.full_name ||
    [lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
    "Unknown Lead";

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" size="sm" onClick={() => navigate("/leads")}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Leads
      </Button>

      {/* Human Control Banner */}
      {lead.is_human_controlled && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <p className="font-medium text-destructive">
                  This lead is under manual control
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Controlled by{" "}
                  <strong>{lead.human_controller?.full_name || "Unknown"}</strong>{" "}
                  since{" "}
                  {lead.human_controlled_at
                    ? format(new Date(lead.human_controlled_at), "MMM d, yyyy 'at' h:mm a")
                    : "unknown date"}
                </p>
                {lead.human_control_reason && (
                  <p className="text-sm mt-1">
                    <strong>Reason:</strong> {lead.human_control_reason}
                  </p>
                )}
              </div>
            </div>
            {permissions.canReleaseHumanControl && (
              <Button variant="outline" size="sm" onClick={() => setReleaseOpen(true)}>
                <Bot className="mr-2 h-4 w-4" />
                Release to Automation
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Header Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold">{leadName}</h1>
                <LeadStatusBadge status={lead.status} />
                {lead.is_priority && (
                  <Badge className="bg-amber-500 hover:bg-amber-600">Priority</Badge>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-4 text-sm">
                {lead.phone && (
                  <a
                    href={`tel:${lead.phone}`}
                    className="flex items-center gap-2 text-primary hover:underline"
                  >
                    <Phone className="h-4 w-4" />
                    {lead.phone}
                  </a>
                )}
                {lead.email && (
                  <a
                    href={`mailto:${lead.email}`}
                    className="flex items-center gap-2 text-primary hover:underline"
                  >
                    <Mail className="h-4 w-4" />
                    {lead.email}
                  </a>
                )}
              </div>

              {/* Status Dropdown */}
              {permissions.canChangeLeadStatus && (
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <Select value={lead.status} onValueChange={handleStatusChange}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-4">
              <ScoreDisplay score={lead.lead_score || 50} size="lg" />

              <div className="flex flex-wrap gap-2">
                {permissions.canScheduleShowing && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setScheduleShowingOpen(true)}
                    className="bg-accent/10 hover:bg-accent/20 text-accent-foreground"
                  >
                    <CalendarPlus className="mr-2 h-4 w-4" />
                    Schedule Showing
                  </Button>
                )}
                {permissions.canEditLeadInfo && (
                  <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                )}
                {permissions.canTakeHumanControl && !lead.is_human_controlled && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setTakeoverOpen(true)}
                  >
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    Take Control
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Contact Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Language</span>
              <span>{lead.preferred_language === "es" ? "Spanish" : "English"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Contact Preference</span>
              <span className="capitalize">{lead.contact_preference || "Any"}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">SMS Consent</span>
              <Badge variant={lead.sms_consent ? "default" : "secondary"}>
                {lead.sms_consent ? "Yes" : "No"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Call Consent</span>
              <Badge variant={lead.call_consent ? "default" : "secondary"}>
                {lead.call_consent ? "Yes" : "No"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Interest Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Interest</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {lead.properties && (
              <div className="flex items-start justify-between">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Property
                </span>
                <Link
                  to={`/properties/${lead.properties.id}`}
                  className="text-primary hover:underline text-right"
                >
                  {lead.properties.address}
                  {lead.properties.unit_number && ` #${lead.properties.unit_number}`}
                </Link>
              </div>
            )}
            {lead.interested_zip_codes && lead.interested_zip_codes.length > 0 && (
              <div className="flex items-start justify-between">
                <span className="text-muted-foreground flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Zip Codes
                </span>
                <span>{lead.interested_zip_codes.join(", ")}</span>
              </div>
            )}
            {(lead.budget_min || lead.budget_max) && (
              <div className="flex items-start justify-between">
                <span className="text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Budget
                </span>
                <span>
                  ${lead.budget_min?.toLocaleString() || "0"} - $
                  {lead.budget_max?.toLocaleString() || "∞"}
                </span>
              </div>
            )}
            {lead.move_in_date && (
              <div className="flex items-start justify-between">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Move-in Date
                </span>
                <span>{format(new Date(lead.move_in_date), "MMM d, yyyy")}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 8 Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Home className="h-5 w-5" />
              Section 8
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Has Voucher</span>
              <Badge variant={lead.has_voucher ? "default" : "secondary"}>
                {lead.has_voucher ? "Yes" : "No"}
              </Badge>
            </div>
            {lead.has_voucher && (
              <>
                {lead.voucher_amount && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount</span>
                    <span>${lead.voucher_amount.toLocaleString()}</span>
                  </div>
                )}
                {lead.voucher_status && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <span className="capitalize">{lead.voucher_status.replace("_", " ")}</span>
                  </div>
                )}
                {lead.housing_authority && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Housing Authority</span>
                    <span>{lead.housing_authority}</span>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Score History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Score History</CardTitle>
            <CardDescription>Recent changes to lead score</CardDescription>
          </CardHeader>
          <CardContent>
            {scoreHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No score changes yet.</p>
            ) : (
              <div className="space-y-4 max-h-64 overflow-y-auto">
                {scoreHistory.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 text-sm">
                    <div className="w-16 shrink-0">
                      <ScoreChange change={entry.change_amount} />
                    </div>
                    <div className="flex-1">
                      <p>{entry.reason_text}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {entry.created_at &&
                          format(new Date(entry.created_at), "MMM d, yyyy 'at' h:mm a")}{" "}
                        • {entry.triggered_by.replace("_", " ")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            {/* Calls */}
            <div>
              <h4 className="font-medium flex items-center gap-2 mb-3">
                <PhoneCall className="h-4 w-4" />
                Calls ({calls.length})
              </h4>
              {calls.length === 0 ? (
                <p className="text-sm text-muted-foreground">No calls yet.</p>
              ) : (
                <div className="space-y-2">
                  {calls.slice(0, 5).map((call) => (
                    <div
                      key={call.id}
                      className="text-sm p-2 rounded bg-muted/50 cursor-pointer hover:bg-muted"
                      onClick={() => navigate(`/calls/${call.id}`)}
                    >
                      <div className="flex justify-between">
                        <span className="capitalize">{call.direction}</span>
                        <Badge variant="secondary" className="text-xs">
                          {call.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {call.started_at &&
                          format(new Date(call.started_at), "MMM d, h:mm a")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Showings */}
            <div>
              <h4 className="font-medium flex items-center gap-2 mb-3">
                <Eye className="h-4 w-4" />
                Showings ({showings.length})
              </h4>
              {showings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No showings yet.</p>
              ) : (
                <div className="space-y-2">
                  {showings.slice(0, 5).map((showing) => (
                    <div
                      key={showing.id}
                      className="text-sm p-2 rounded bg-muted/50"
                    >
                      <div className="flex justify-between">
                        <span>
                          {showing.scheduled_at &&
                            format(new Date(showing.scheduled_at), "MMM d")}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {showing.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Communications */}
            <div>
              <h4 className="font-medium flex items-center gap-2 mb-3">
                <MessageSquare className="h-4 w-4" />
                Messages ({communications.length})
              </h4>
              {communications.length === 0 ? (
                <p className="text-sm text-muted-foreground">No messages yet.</p>
              ) : (
                <div className="space-y-2">
                  {communications.slice(0, 5).map((comm) => (
                    <div key={comm.id} className="text-sm p-2 rounded bg-muted/50">
                      <div className="flex justify-between">
                        <span className="capitalize">{comm.channel}</span>
                        <Badge variant="secondary" className="text-xs">
                          {comm.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {comm.body?.substring(0, 50)}...
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
          </DialogHeader>
          <LeadForm
            lead={lead}
            onSuccess={() => {
              setEditOpen(false);
              fetchLead();
            }}
            onCancel={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <HumanTakeoverModal
        open={takeoverOpen}
        onOpenChange={setTakeoverOpen}
        leadId={lead.id}
        leadName={leadName}
        onSuccess={fetchLead}
      />

      <ReleaseControlModal
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        leadId={lead.id}
        leadName={leadName}
        onSuccess={fetchLead}
      />

      <ScheduleShowingDialog
        open={scheduleShowingOpen}
        onOpenChange={setScheduleShowingOpen}
        preselectedLeadId={lead.id}
        preselectedLeadName={leadName}
        onSuccess={fetchLead}
      />
    </div>
  );
};

export default LeadDetail;
