import React from "react";
import { Badge } from "@/components/ui/badge";
import { LeadStatusBadge } from "./LeadStatusBadge";

interface LeadProfileCardProps {
  lead: {
    preferred_language?: string | null;
    contact_preference?: string | null;
    source?: string | null;
    status: string;
    budget_min?: number | null;
    budget_max?: number | null;
    move_in_date?: string | null;
    bedrooms_needed?: number | null;
    has_voucher?: boolean | null;
    voucher_amount?: number | null;
    housing_authority?: string | null;
  };
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
  campaign: "Campaign Outreach",
};

const PendingValue: React.FC = () => (
  <span className="text-muted-foreground italic text-sm">Pending</span>
);

export const LeadProfileCard: React.FC<LeadProfileCardProps> = ({ lead }) => {
  const formatBudget = () => {
    if (!lead.budget_min && !lead.budget_max) return null;
    const min = lead.budget_min ? `$${lead.budget_min.toLocaleString()}` : "$0";
    const max = lead.budget_max ? `$${lead.budget_max.toLocaleString()}` : "∞";
    return `${min} - ${max}`;
  };

  const formatMoveIn = () => {
    if (!lead.move_in_date) return null;
    return new Date(lead.move_in_date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-4">Lead Profile</h3>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Left Column */}
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Language</span>
            <span>{lead.preferred_language === "es" ? "Spanish" : "English"}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Contact Preference</span>
            <span className="capitalize">{lead.contact_preference || <PendingValue />}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Source</span>
            <span>{SOURCE_LABELS[lead.source || ""] || lead.source || <PendingValue />}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Status</span>
            <LeadStatusBadge status={lead.status} />
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Budget</span>
            <span>{formatBudget() || <PendingValue />}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Move-in Date</span>
            <span>{formatMoveIn() || <PendingValue />}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Bedrooms Needed</span>
            <span>
              {lead.bedrooms_needed ? `${lead.bedrooms_needed} BR` : <PendingValue />}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Has Voucher</span>
            <Badge variant={lead.has_voucher ? "default" : "secondary"} className="text-xs">
              {lead.has_voucher ? "Yes" : "No"}
            </Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Voucher Amount</span>
            <span>
              {lead.has_voucher && lead.voucher_amount
                ? `$${lead.voucher_amount.toLocaleString()}`
                : <PendingValue />}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Housing Authority</span>
            <span className="truncate max-w-[120px]">
              {lead.has_voucher && lead.housing_authority ? (
                lead.housing_authority
              ) : (
                <PendingValue />
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
