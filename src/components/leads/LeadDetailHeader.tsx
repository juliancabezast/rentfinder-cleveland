import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Phone,
  CalendarPlus,
  Edit,
  AlertTriangle,
  Loader2,
  Sparkles,
  Building2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LeadStatusBadge } from "./LeadStatusBadge";
import { DoorloopStatusBadge } from "./DoorloopStatusBadge";

interface Property {
  id: string;
  address: string;
  unit_number?: string | null;
  rent_price?: number | null;
  bedrooms?: number | null;
}

interface LeadDetailHeaderProps {
  lead: {
    id: string;
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    phone: string;
    status: string;
    lead_score?: number | null;
    is_human_controlled?: boolean;
    doorloop_prospect_id?: string | null;
    ai_brief?: string | null;
  };
  property?: Property | null;
  permissions: {
    canScheduleShowing: boolean;
    canEditLeadInfo: boolean;
    canTakeHumanControl: boolean;
  };
  onScheduleShowing: () => void;
  onEdit: () => void;
  onTakeControl: () => void;
  onBriefGenerated: () => void;
}

// Small score circle (40px)
const SmallScoreCircle: React.FC<{ score: number }> = ({ score }) => {
  const getColor = (s: number) => {
    if (s <= 30) return { ring: "stroke-red-500", text: "text-red-600", bg: "bg-red-50" };
    if (s <= 50) return { ring: "stroke-amber-500", text: "text-amber-600", bg: "bg-amber-50" };
    if (s <= 70) return { ring: "stroke-green-500", text: "text-green-600", bg: "bg-green-50" };
    return { ring: "stroke-emerald-500", text: "text-emerald-600", bg: "bg-emerald-50" };
  };

  const colors = getColor(score);
  const circumference = 2 * Math.PI * 16;
  const progress = (score / 100) * circumference;

  return (
    <div className="relative w-10 h-10 shrink-0">
      <svg className="transform -rotate-90" width={40} height={40}>
        <circle cx={20} cy={20} r={16} fill="none" stroke="#e5e7eb" strokeWidth="3" />
        <circle
          cx={20}
          cy={20}
          r={16}
          fill="none"
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className={colors.ring}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("text-xs font-bold", colors.text)}>{score}</span>
      </div>
    </div>
  );
};

export const LeadDetailHeader: React.FC<LeadDetailHeaderProps> = ({
  lead,
  property,
  permissions,
  onScheduleShowing,
  onEdit,
  onTakeControl,
  onBriefGenerated,
}) => {
  const { userRecord } = useAuth();
  const [callViaAgentOpen, setCallViaAgentOpen] = useState(false);
  const [callViaAgentLoading, setCallViaAgentLoading] = useState(false);
  const [generatingBrief, setGeneratingBrief] = useState(false);

  const leadName =
    lead.full_name ||
    [lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
    "Unknown Lead";

  const handleCallViaAgent = async () => {
    if (!lead || !userRecord) return;

    setCallViaAgentLoading(true);
    try {
      const { error } = await supabase.from("agent_tasks").insert({
        lead_id: lead.id,
        organization_id: userRecord.organization_id,
        agent_type: "recapture",
        action_type: "call",
        scheduled_for: new Date().toISOString(),
        status: "pending",
        context: {
          manually_triggered: true,
          triggered_by: userRecord.id,
        },
      });

      if (error) throw error;

      toast.success(`Call queued. The AI agent will call ${leadName} shortly.`);
      setCallViaAgentOpen(false);
    } catch (error) {
      console.error("Error creating call task:", error);
      toast.error("Failed to queue call. Please try again.");
    } finally {
      setCallViaAgentLoading(false);
    }
  };

  const handleGenerateBrief = async () => {
    if (!userRecord?.id) return;

    setGeneratingBrief(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-lead-brief", {
        body: {
          lead_id: lead.id,
          user_id: userRecord.id,
        },
      });

      if (error) throw error;

      if (data?.brief) {
        toast.success("AI Brief generated successfully");
        onBriefGenerated();
      } else {
        throw new Error("No brief returned");
      }
    } catch (error) {
      console.error("Error generating brief:", error);
      toast.error("Failed to generate AI brief");
    } finally {
      setGeneratingBrief(false);
    }
  };

  // Truncate brief to ~3 lines
  const truncatedBrief = lead.ai_brief
    ? lead.ai_brief.length > 200
      ? lead.ai_brief.slice(0, 200) + "..."
      : lead.ai_brief
    : null;

  return (
    <>
      <div className="bg-white border border-[#e5e7eb] rounded-lg p-4 space-y-3">
        {/* Row 1: Name, badges, score, and actions */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Left: Name + badges + score */}
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">{leadName}</h1>
            <LeadStatusBadge status={lead.status} />
            <DoorloopStatusBadge
              leadId={lead.id}
              doorloopProspectId={lead.doorloop_prospect_id}
            />
            <SmallScoreCircle score={lead.lead_score || 50} />
          </div>

          {/* Right: Action buttons - all same outline style */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCallViaAgentOpen(true)}
              className="border-[#d1d5db] bg-white hover:bg-gray-50"
            >
              <Phone className="mr-2 h-4 w-4" />
              Call via Agent
            </Button>
            {permissions.canScheduleShowing && (
              <Button
                variant="outline"
                size="sm"
                onClick={onScheduleShowing}
                className="border-[#d1d5db] bg-white hover:bg-gray-50"
              >
                <CalendarPlus className="mr-2 h-4 w-4" />
                Schedule Showing
              </Button>
            )}
            {permissions.canEditLeadInfo && (
              <Button
                variant="outline"
                size="sm"
                onClick={onEdit}
                className="border-[#d1d5db] bg-white hover:bg-gray-50"
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            )}
            {permissions.canTakeHumanControl && !lead.is_human_controlled && (
              <Button
                variant="outline"
                size="sm"
                onClick={onTakeControl}
                className="border-destructive text-destructive hover:bg-destructive/10"
              >
                <AlertTriangle className="mr-2 h-4 w-4" />
                Take Control
              </Button>
            )}
          </div>
        </div>

        {/* Row 2: Property of interest + AI Brief */}
        <div className="flex flex-col lg:flex-row lg:items-start gap-4 pt-2 border-t border-[#e5e7eb]">
          {/* Left: Property of interest */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 text-sm">
              <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              {property ? (
                <div>
                  <span className="font-medium">{property.address}</span>
                  {property.unit_number && <span> #{property.unit_number}</span>}
                  <span className="text-muted-foreground ml-2">
                    {property.rent_price && `$${property.rent_price.toLocaleString()}/mo`}
                    {property.bedrooms && ` · ${property.bedrooms} BR`}
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground italic">No property selected</span>
              )}
            </div>
          </div>

          {/* Right: AI Brief preview */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-accent mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                {truncatedBrief ? (
                  <p className="text-sm text-muted-foreground line-clamp-3">{truncatedBrief}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No brief yet</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={handleGenerateBrief}
                disabled={generatingBrief}
              >
                {generatingBrief ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 text-accent" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Call via Agent Confirmation Dialog */}
      <AlertDialog open={callViaAgentOpen} onOpenChange={setCallViaAgentOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Call via AI Agent</AlertDialogTitle>
            <AlertDialogDescription>
              This will trigger an AI agent to call <strong>{leadName}</strong> at{" "}
              <strong>{lead.phone}</strong>. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={callViaAgentLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCallViaAgent}
              disabled={callViaAgentLoading}
            >
              {callViaAgentLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Queue Call
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
