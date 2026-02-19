import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Phone,
  CalendarPlus,
  Edit,
  AlertTriangle,
  Loader2,
  Sparkles,
  Building2,
  StickyNote,
  Search,
  X,
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
    email?: string | null;
    status: string;
    lead_score?: number | null;
    is_human_controlled?: boolean;
    doorloop_prospect_id?: string | null;
    ai_brief?: string | null;
    preferred_language?: string | null;
    contact_preference?: string | null;
    source?: string | null;
    source_detail?: string | null;
    budget_min?: number | null;
    budget_max?: number | null;
    move_in_date?: string | null;
    bedrooms_needed?: number | null;
    has_voucher?: boolean | null;
    voucher_amount?: number | null;
    housing_authority?: string | null;
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
  onPropertyMatched?: () => void;
  notesCount?: number;
  onNotesClick?: () => void;
}

const SOURCE_LABELS: Record<string, string> = {
  inbound_call: "Inbound Call",
  web_form: "Web Form",
  referral: "Referral",
  zillow: "Zillow",
  craigslist: "Craigslist",
  walk_in: "Walk-in",
  hemlane: "Hemlane",
  manual: "Manual Entry",
  campaign: "Campaign",
};

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

// Standard button styling
const headerButtonClass = "bg-white border border-[#d1d5db] text-[#374151] hover:bg-[#f3f4f6] h-9";

export const LeadDetailHeader: React.FC<LeadDetailHeaderProps> = ({
  lead,
  property,
  permissions,
  onScheduleShowing,
  onEdit,
  onTakeControl,
  onBriefGenerated,
  onPropertyMatched,
  notesCount = 0,
  onNotesClick,
}) => {
  const { userRecord } = useAuth();
  const [callViaAgentOpen, setCallViaAgentOpen] = useState(false);
  const [callViaAgentLoading, setCallViaAgentLoading] = useState(false);
  const [generatingBrief, setGeneratingBrief] = useState(false);

  // Property Match state
  const [matchingProperty, setMatchingProperty] = useState(false);
  const [showPropertySelector, setShowPropertySelector] = useState(false);
  const [orgProperties, setOrgProperties] = useState<
    { id: string; address: string; unit_number: string | null; city: string }[]
  >([]);
  // All properties this lead is interested in (from lead_properties junction)
  const [additionalProperties, setAdditionalProperties] = useState<
    { property_id: string; listing_source: string | null; address: string; unit_number: string | null }[]
  >([]);

  // Fetch additional properties from lead_properties junction table
  useEffect(() => {
    const fetchLeadProperties = async () => {
      if (!lead.id || !userRecord?.organization_id) return;
      try {
        const { data } = await supabase
          .from("lead_properties")
          .select("property_id, listing_source, properties(address, unit_number)")
          .eq("lead_id", lead.id)
          .eq("organization_id", userRecord.organization_id);
        if (data) {
          setAdditionalProperties(
            data.map((row: any) => ({
              property_id: row.property_id,
              listing_source: row.listing_source,
              address: row.properties?.address || "Unknown",
              unit_number: row.properties?.unit_number || null,
            }))
          );
        }
      } catch {
        // Table may not exist yet — graceful fallback
      }
    };
    fetchLeadProperties();
  }, [lead.id, userRecord?.organization_id]);

  const fetchAllProperties = async () => {
    if (!userRecord?.organization_id) return;
    const { data } = await supabase
      .from("properties")
      .select("id, address, unit_number, city")
      .eq("organization_id", userRecord.organization_id)
      .order("address");
    if (data) setOrgProperties(data);
  };

  const handlePropertyMatch = async () => {
    if (!userRecord?.organization_id) return;
    setMatchingProperty(true);

    try {
      // Extract property address from source_detail
      const sourceDetail = lead.source_detail || "";
      const addressMatch = sourceDetail.match(/Property:\s*(.+?)(?:\s*\(|$)/);

      if (addressMatch) {
        const address = addressMatch[1].trim();
        const { data } = await supabase
          .from("properties")
          .select("id, address, unit_number, city")
          .eq("organization_id", userRecord.organization_id)
          .ilike("address", `%${address}%`)
          .limit(5);

        if (data && data.length === 1) {
          // Exact match → auto-assign
          await supabase
            .from("leads")
            .update({ interested_property_id: data[0].id })
            .eq("id", lead.id);
          toast.success(`Propiedad asignada: ${data[0].address}`);
          onPropertyMatched?.();
          return;
        }

        if (data && data.length > 1) {
          setOrgProperties(data);
          setShowPropertySelector(true);
          toast.info(`${data.length} propiedades encontradas. Selecciona la correcta.`);
          return;
        }
      }

      // No match from source_detail → show all properties
      await fetchAllProperties();
      setShowPropertySelector(true);
      if (addressMatch) {
        toast.info("No se encontró match automático. Selecciona manualmente.");
      }
    } catch (err) {
      console.error("Property match error:", err);
      toast.error("Error al buscar propiedad");
    } finally {
      setMatchingProperty(false);
    }
  };

  const handlePropertySelect = async (propertyId: string) => {
    if (!propertyId || propertyId === "none") return;

    try {
      // Set as primary interested property
      await supabase
        .from("leads")
        .update({ interested_property_id: propertyId })
        .eq("id", lead.id);

      // Also record in lead_properties junction table
      if (userRecord?.organization_id) {
        await supabase
          .from("lead_properties")
          .upsert(
            {
              organization_id: userRecord.organization_id,
              lead_id: lead.id,
              property_id: propertyId,
              source: "manual_match",
            },
            { onConflict: "lead_id,property_id" }
          )
          .catch(() => {});
      }

      const selected = orgProperties.find((p) => p.id === propertyId);
      toast.success(`Propiedad asignada: ${selected?.address || "OK"}`);
      setShowPropertySelector(false);
      onPropertyMatched?.();
    } catch (err) {
      console.error("Property assign error:", err);
      toast.error("Error al asignar propiedad");
    }
  };

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

  const formatBudget = () => {
    if (!lead.budget_min && !lead.budget_max) return null;
    const min = lead.budget_min ? `$${lead.budget_min.toLocaleString()}` : "$0";
    const max = lead.budget_max ? `$${lead.budget_max.toLocaleString()}` : "∞";
    return `${min}-${max}`;
  };

  const formatMoveIn = () => {
    if (!lead.move_in_date) return null;
    return new Date(lead.move_in_date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  // Profile fields for Row 2
  const profileFields = [
    { label: "Language", value: lead.preferred_language === "es" ? "Spanish" : "English" },
    { label: "Contact", value: lead.contact_preference ? lead.contact_preference.charAt(0).toUpperCase() + lead.contact_preference.slice(1) : null },
    { label: "Source", value: SOURCE_LABELS[lead.source || ""] || lead.source },
    { label: "Budget", value: formatBudget() },
    { label: "Move-in", value: formatMoveIn() },
    { label: "Bedrooms", value: lead.bedrooms_needed ? `${lead.bedrooms_needed} BR` : null },
    { label: "Voucher", value: lead.has_voucher ? (lead.voucher_amount ? `$${lead.voucher_amount.toLocaleString()}` : "Yes") : null },
    { label: "Authority", value: lead.has_voucher && lead.housing_authority ? lead.housing_authority : null },
  ].filter(f => f.value);

  return (
    <>
      <div className="bg-[#ffffff] border border-[#e5e7eb] rounded-lg p-4 space-y-3">
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

          {/* Right: Action buttons - all same style */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCallViaAgentOpen(true)}
              className={headerButtonClass}
            >
              <Phone className="mr-2 h-4 w-4" />
              Call via Agent
            </Button>
            {permissions.canScheduleShowing && (
              <Button
                variant="outline"
                size="sm"
                onClick={onScheduleShowing}
                className={headerButtonClass}
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
                className={headerButtonClass}
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
                className="bg-white border-[#ef4444] text-[#ef4444] hover:bg-red-50 h-9"
              >
                <AlertTriangle className="mr-2 h-4 w-4" />
                Take Control
              </Button>
            )}
          </div>
        </div>

        {/* Row 2: Property + AI Brief */}
        <div className="flex flex-col lg:flex-row lg:items-start gap-4 pt-2 border-t border-[#e5e7eb]">
          {/* Left: Property of interest */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 text-sm">
              <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              {property ? (
                <div className="space-y-1">
                  <div>
                    <span className="font-medium">{property.address}</span>
                    {property.unit_number && <span> #{property.unit_number}</span>}
                    <span className="text-muted-foreground ml-2">
                      {property.rent_price && `$${property.rent_price.toLocaleString()}/mo`}
                      {property.bedrooms && ` · ${property.bedrooms} BR`}
                    </span>
                  </div>
                  {/* Additional properties from lead_properties junction */}
                  {additionalProperties
                    .filter((ap) => ap.property_id !== property.id)
                    .map((ap) => (
                      <div key={ap.property_id} className="text-xs text-muted-foreground flex items-center gap-1">
                        <span>+</span>
                        <span className="font-medium text-foreground">
                          {ap.address}
                          {ap.unit_number ? ` #${ap.unit_number}` : ""}
                        </span>
                        {ap.listing_source && (
                          <Badge variant="outline" className="h-4 px-1 text-[9px]">
                            {ap.listing_source}
                          </Badge>
                        )}
                      </div>
                    ))}
                </div>
              ) : showPropertySelector ? (
                <div className="flex items-center gap-2 flex-1">
                  <Select onValueChange={handlePropertySelect}>
                    <SelectTrigger className="h-7 text-xs w-[260px]">
                      <SelectValue placeholder="Seleccionar propiedad..." />
                    </SelectTrigger>
                    <SelectContent>
                      {orgProperties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.address}
                          {p.unit_number ? ` #${p.unit_number}` : ""} — {p.city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => setShowPropertySelector(false)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground italic">No property selected</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-xs gap-1"
                      onClick={handlePropertyMatch}
                      disabled={matchingProperty}
                    >
                      {matchingProperty ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Search className="h-3 w-3" />
                      )}
                      Property Match
                    </Button>
                  </div>
                  {/* Show additional properties even when no primary is set */}
                  {additionalProperties.length > 0 && (
                    <div className="space-y-0.5">
                      {additionalProperties.map((ap) => (
                        <div key={ap.property_id} className="text-xs text-muted-foreground flex items-center gap-1">
                          <span>+</span>
                          <span className="font-medium text-foreground">
                            {ap.address}
                            {ap.unit_number ? ` #${ap.unit_number}` : ""}
                          </span>
                          {ap.listing_source && (
                            <Badge variant="outline" className="h-4 px-1 text-[9px]">
                              {ap.listing_source}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: AI Brief preview + Notes indicator */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-accent mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                {lead.ai_brief ? (
                  <p className="text-sm text-muted-foreground line-clamp-3">{lead.ai_brief}</p>
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
              {/* Notes indicator */}
              {onNotesClick && (
                <button
                  onClick={onNotesClick}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted/50 transition-colors"
                  title="View notes"
                >
                  <StickyNote className="h-4 w-4 text-muted-foreground" />
                  {notesCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
                      {notesCount}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Row 3: Profile fields inline */}
        {profileFields.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t border-[#e5e7eb]">
            {profileFields.map((field, i) => (
              <div key={i} className="text-xs">
                <span className="text-muted-foreground">{field.label}:</span>{" "}
                <span className="text-foreground">{field.value}</span>
              </div>
            ))}
          </div>
        )}
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
