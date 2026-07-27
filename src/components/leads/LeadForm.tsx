import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ChevronsUpDown, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Lead = Tables<"leads">;

interface PropertyOption {
  id: string;
  address: string;
  unit_number: string | null;
  city: string;
  status: string;
}

interface LeadFormProps {
  lead?: Lead | null;
  onSuccess: () => void;
  onCancel: () => void;
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

const VOUCHER_STATUSES = [
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "expiring_soon", label: "Expiring Soon" },
  { value: "expired", label: "Expired" },
  { value: "unknown", label: "Unknown" },
];

const LEAD_SOURCES = [
  { value: "manual", label: "Manual Entry" },
  { value: "campaign", label: "Campaign Outreach" },
  { value: "inbound_call", label: "Inbound Call" },
  { value: "website", label: "Website" },
  { value: "referral", label: "Referral" },
  { value: "hemlane_email", label: "Hemlane Email" },
  { value: "sms", label: "SMS" },
  { value: "csv_import", label: "CSV Import" },
];

export const LeadForm: React.FC<LeadFormProps> = ({
  lead,
  onSuccess,
  onCancel,
}) => {
  const { userRecord } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [properties, setProperties] = useState<PropertyOption[]>([]);

  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [initialPropertyIds, setInitialPropertyIds] = useState<string[]>([]);
  const [interestsLoaded, setInterestsLoaded] = useState(false);
  const [propertyPopoverOpen, setPropertyPopoverOpen] = useState(false);

  const [formData, setFormData] = useState({
    first_name: lead?.first_name || "",
    last_name: lead?.last_name || "",
    phone: lead?.phone || "",
    email: lead?.email || "",
    preferred_language: lead?.preferred_language || "en",
    status: lead?.status || "new",
    source: lead?.source || "manual",
    budget_min: lead?.budget_min?.toString() || "",
    budget_max: lead?.budget_max?.toString() || "",
    move_in_date: lead?.move_in_date || "",
    has_voucher: lead?.has_voucher || false,
    voucher_amount: lead?.voucher_amount?.toString() || "",
    voucher_status: lead?.voucher_status || "",
    housing_authority: lead?.housing_authority || "",
    contact_preference: lead?.contact_preference || "any",
    sms_consent: lead?.sms_consent || false,
    call_consent: lead?.call_consent || false,
  });

  // Fetch properties + existing interests
  useEffect(() => {
    const fetchData = async () => {
      if (!userRecord?.organization_id) return;

      const { data } = await supabase
        .from("properties")
        .select("id, address, unit_number, city, status")
        .eq("organization_id", userRecord.organization_id)
        .in("status", ["available", "coming_soon"])
        .order("address");

      if (data) setProperties(data);

      // Load existing property interests from junction table (org-scoped alongside RLS)
      if (lead?.id) {
        const { data: interests } = await supabase
          .from("lead_property_interests")
          .select("property_id")
          .eq("lead_id", lead.id)
          .eq("organization_id", userRecord.organization_id);

        const existing = (interests || []).map((i: any) => i.property_id);
        setSelectedPropertyIds(existing);
        setInitialPropertyIds(existing);
      }

      // Mark interests as loaded so an early submit can't wipe existing
      // property interests via the diff sync in handleSubmit
      setInterestsLoaded(true);
    };

    fetchData();
  }, [userRecord?.organization_id, lead?.id]);

  // TCPA: every consent flip is recorded in consent_log with evidence text
  const logConsentChanges = async (targetLeadId: string) => {
    const organizationId = userRecord?.organization_id;
    if (!organizationId) return;

    const changes: { consent_type: string; granted: boolean }[] = [];
    if (formData.sms_consent !== (lead?.sms_consent ?? false)) {
      changes.push({ consent_type: "sms_marketing", granted: formData.sms_consent });
    }
    if (formData.call_consent !== (lead?.call_consent ?? false)) {
      changes.push({ consent_type: "automated_calls", granted: formData.call_consent });
    }
    if (changes.length === 0) return;

    const operator = userRecord?.full_name || userRecord?.id || "unknown user";
    const { error } = await supabase.from("consent_log").insert(
      changes.map((c) => ({
        organization_id: organizationId,
        lead_id: targetLeadId,
        consent_type: c.consent_type,
        granted: c.granted,
        method: "manual_ui",
        evidence_text: `${c.granted ? "Granted" : "Revoked"} via ${
          lead ? "Edit" : "Create"
        } Lead form by ${operator}`,
      }))
    );
    if (error) {
      console.error("Failed to write consent_log:", error);
      // TCPA evidence is non-negotiable — surface the failure instead of losing
      // it to the console. The lead itself already saved; only the audit row failed.
      toast({
        title: "Consent change not logged",
        description:
          "The lead was saved, but its consent change could not be recorded for compliance. Please retry or log it manually.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userRecord?.organization_id) return;

    // At least one contact point is required (email-only shell leads are valid)
    if (!formData.phone.trim() && !formData.email.trim()) {
      toast({
        title: "Contact info required",
        description: "Provide at least a phone number or an email.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const nowIso = new Date().toISOString();
      // Base lead data — property interests live in lead_property_interests
      const leadData = {
        organization_id: userRecord.organization_id,
        first_name: formData.first_name || null,
        last_name: formData.last_name || null,
        // Fall back to the existing full_name so editing a name-only lead (no first/last parts) doesn't wipe it
        full_name: [formData.first_name, formData.last_name]
          .filter(Boolean)
          .join(" ") || lead?.full_name || null,
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        preferred_language: formData.preferred_language,
        status: formData.status,
        source: formData.source,
        budget_min: formData.budget_min ? parseFloat(formData.budget_min) : null,
        budget_max: formData.budget_max ? parseFloat(formData.budget_max) : null,
        move_in_date: formData.move_in_date || null,
        has_voucher: formData.has_voucher,
        voucher_amount: formData.voucher_amount
          ? parseFloat(formData.voucher_amount)
          : null,
        voucher_status: formData.voucher_status || null,
        housing_authority: formData.housing_authority || null,
        contact_preference: formData.contact_preference,
        sms_consent: formData.sms_consent,
        // Preserve the original grant timestamp (TCPA evidence) even on
        // withdrawal — consent_log records the flip; only stamp now() on a new grant
        sms_consent_at: formData.sms_consent
          ? (lead?.sms_consent ? (lead?.sms_consent_at ?? nowIso) : nowIso)
          : (lead?.sms_consent_at ?? null),
        call_consent: formData.call_consent,
        call_consent_at: formData.call_consent
          ? (lead?.call_consent ? (lead?.call_consent_at ?? nowIso) : nowIso)
          : (lead?.call_consent_at ?? null),
        // If creating a new lead and user is a leasing_agent, auto-assign to themselves
        assigned_leasing_agent_id: !lead && userRecord.role === "leasing_agent"
          ? userRecord.id
          : (lead?.assigned_leasing_agent_id ?? null),
      };

      if (lead) {
        const { error } = await supabase
          .from("leads")
          .update(leadData)
          .eq("id", lead.id)
          .eq("organization_id", userRecord.organization_id);
        if (error) throw error;

        await logConsentChanges(lead.id);

        // Diff-sync junction table: only insert new tags and delete removed
        // ones, so kept tags preserve their created_at / last_interest_at /
        // source — and only once existing interests have loaded, so an early
        // submit can't wipe them
        if (interestsLoaded) {
          const toAdd = selectedPropertyIds.filter(
            (pid) => !initialPropertyIds.includes(pid)
          );
          const toRemove = initialPropertyIds.filter(
            (pid) => !selectedPropertyIds.includes(pid)
          );

          if (toRemove.length > 0) {
            const { error: deleteErr } = await supabase
              .from("lead_property_interests")
              .delete()
              .eq("lead_id", lead.id)
              .in("property_id", toRemove);
            if (deleteErr) console.error("Failed to remove property interests:", deleteErr);
          }

          if (toAdd.length > 0) {
            const { error: insertErr } = await supabase.from("lead_property_interests").insert(
              toAdd.map((pid) => ({
                organization_id: userRecord.organization_id,
                lead_id: lead.id,
                property_id: pid,
                source: "manual",
              }))
            );
            if (insertErr) {
              console.error("Failed to save property interests:", insertErr);
              toast({
                title: "Warning",
                description: "Lead saved, but its property interests couldn't be updated.",
                variant: "destructive",
              });
            }
          }
        }

        toast({ title: "Success", description: "Lead updated successfully." });
        onSuccess();
      } else {
        // Create new lead
        const { data: newLead, error } = await supabase
          .from("leads")
          .insert(leadData)
          .select("id")
          .single();

        // The BEFORE INSERT dedup trigger (noah_deduplicate_lead) merges a
        // matching lead (normalized phone, else exact email) into the existing
        // row and RETURNs NULL — so .single() sees 0 rows (PGRST116). That's a
        // successful merge, not a failure: recover the surviving lead id.
        let leadId = newLead?.id ?? null;
        let mergedIntoExisting = false;

        if (error) {
          if (error.code === "PGRST116") {
            mergedIntoExisting = true;
            const orgId = userRecord.organization_id;

            // Match the trigger's precedence: normalized phone first, then email.
            // Stored phones are E.164, so match on the trailing 10 digits to be
            // format-proof; take the oldest, which is the survivor the trigger keeps.
            const digits = (leadData.phone || "").replace(/\D/g, "");
            const last10 = digits.length >= 10 ? digits.slice(-10) : "";
            if (last10) {
              const { data: byPhone } = await supabase
                .from("leads")
                .select("id")
                .eq("organization_id", orgId)
                .ilike("phone", `%${last10}`)
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle();
              leadId = byPhone?.id ?? null;
            }
            if (!leadId && leadData.email) {
              const { data: byEmail } = await supabase
                .from("leads")
                .select("id")
                .eq("organization_id", orgId)
                .eq("email", leadData.email)
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle();
              leadId = byEmail?.id ?? null;
            }
          } else {
            throw error;
          }
        }

        if (leadId) {
          await logConsentChanges(leadId);
        }

        // Sync junction table onto whichever lead we ended up with
        // (capture a const so the value narrows to string inside the map closure)
        if (leadId && selectedPropertyIds.length > 0) {
          const targetLeadId = leadId;
          await supabase.from("lead_property_interests").insert(
            selectedPropertyIds.map((pid) => ({
              organization_id: userRecord.organization_id,
              lead_id: targetLeadId,
              property_id: pid,
              source: "manual",
            }))
          );
        }

        if (mergedIntoExisting) {
          toast({
            title: "Merged with existing lead",
            description:
              "A lead with this phone or email already existed — your changes were merged into it.",
          });
        } else {
          toast({ title: "Success", description: "Lead created successfully." });
        }

        // Close the dialog immediately — property matching is decorative and
        // should not keep the Create button spinning after we've reported success.
        onSuccess();

        // Fire smart matching for a freshly created lead without awaiting it.
        if (leadId && !mergedIntoExisting) {
          const matchLeadId = leadId;
          const orgId = userRecord.organization_id;
          const hadNoSelection = selectedPropertyIds.length === 0;
          void (async () => {
            try {
              const { data: matchData } = await supabase.functions.invoke("match-properties", {
                body: { organization_id: orgId, lead_id: matchLeadId },
              });

              const matches = matchData?.matches || [];
              const highScoreMatches = matches.filter((m: any) => m.match_score > 70);

              if (highScoreMatches.length > 0) {
                toast({
                  title: `✨ Found ${highScoreMatches.length} matching properties!`,
                  description: "Open the lead to see property recommendations.",
                });

                // Auto-populate with top match if the lead specified no properties
                if (hadNoSelection && matches.length > 0) {
                  await supabase.from("lead_property_interests").insert({
                    organization_id: orgId,
                    lead_id: matchLeadId,
                    property_id: matches[0].property_id,
                    source: "auto_match",
                  });
                }
              }
            } catch (matchError) {
              // Matching is best-effort — never surfaces as a save failure.
              console.error("Error running property matching:", matchError);
            }
          })();
        }
      }
    } catch (error) {
      console.error("Error saving lead:", error);
      toast({
        title: "Error",
        description: "Failed to save lead. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Contact Info */}
      <div className="space-y-4">
        <h3 className="font-medium">Contact Information</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="first_name">First Name</Label>
            <Input
              id="first_name"
              className="min-h-[44px]"
              value={formData.first_name}
              onChange={(e) =>
                setFormData((f) => ({ ...f, first_name: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name">Last Name</Label>
            <Input
              id="last_name"
              className="min-h-[44px]"
              value={formData.last_name}
              onChange={(e) =>
                setFormData((f) => ({ ...f, last_name: e.target.value }))
              }
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              className="min-h-[44px]"
              value={formData.phone}
              onChange={(e) =>
                setFormData((f) => ({ ...f, phone: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              className="min-h-[44px]"
              value={formData.email}
              onChange={(e) =>
                setFormData((f) => ({ ...f, email: e.target.value }))
              }
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          At least one of phone or email is required.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Preferred Language</Label>
            <Select
              value={formData.preferred_language}
              onValueChange={(v) =>
                setFormData((f) => ({ ...f, preferred_language: v }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Spanish</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Contact Preference</Label>
            <Select
              value={formData.contact_preference}
              onValueChange={(v) =>
                setFormData((f) => ({ ...f, contact_preference: v }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="call">Call Only</SelectItem>
                <SelectItem value="sms">SMS Only</SelectItem>
                <SelectItem value="email">Email Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Status & Interest */}
      <div className="space-y-4">
        <h3 className="font-medium">Status & Interest</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={formData.status}
              onValueChange={(v) => setFormData((f) => ({ ...f, status: v }))}
            >
              <SelectTrigger>
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
          <div className="space-y-2">
            <Label>Source</Label>
            <Select
              value={formData.source}
              onValueChange={(v) => setFormData((f) => ({ ...f, source: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Interested Properties</Label>
            <Popover open={propertyPopoverOpen} onOpenChange={setPropertyPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal h-auto min-h-10"
                >
                  <div className="flex flex-wrap gap-1 py-0.5">
                    {selectedPropertyIds.length === 0 ? (
                      <span className="text-muted-foreground">Select properties...</span>
                    ) : (
                      selectedPropertyIds.map((pid) => {
                        const prop = properties.find((p) => p.id === pid);
                        if (!prop) return null;
                        return (
                          <Badge
                            key={pid}
                            variant="secondary"
                            className="text-xs gap-1 pr-1"
                          >
                            {prop.address}{prop.unit_number ? ` #${prop.unit_number}` : ""}
                            <X
                              className="h-3 w-3 cursor-pointer hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPropertyIds((ids) => ids.filter((id) => id !== pid));
                              }}
                            />
                          </Badge>
                        );
                      })
                    )}
                  </div>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <ScrollArea className="max-h-[280px]">
                  <div className="p-2 space-y-1">
                    {properties.map((p) => {
                      const isSelected = selectedPropertyIds.includes(p.id);
                      const label = `${p.address}${p.unit_number ? ` #${p.unit_number}` : ""} - ${p.city}`;
                      return (
                        <div
                          key={p.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-foreground/10 cursor-pointer"
                          onClick={() => {
                            setSelectedPropertyIds((ids) =>
                              isSelected
                                ? ids.filter((id) => id !== p.id)
                                : [...ids, p.id]
                            );
                          }}
                        >
                          <Checkbox checked={isSelected} className="pointer-events-none" />
                          <span className="text-sm">{label}</span>
                        </div>
                      );
                    })}
                    {properties.length === 0 && (
                      <p className="text-sm text-muted-foreground p-2">No properties available</p>
                    )}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="budget_min">Budget Min ($)</Label>
            <Input
              id="budget_min"
              type="number"
              className="min-h-[44px]"
              value={formData.budget_min}
              onChange={(e) =>
                setFormData((f) => ({ ...f, budget_min: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="budget_max">Budget Max ($)</Label>
            <Input
              id="budget_max"
              type="number"
              className="min-h-[44px]"
              value={formData.budget_max}
              onChange={(e) =>
                setFormData((f) => ({ ...f, budget_max: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="move_in_date">Move-in Date</Label>
            <Input
              id="move_in_date"
              type="date"
              className="min-h-[44px]"
              value={formData.move_in_date}
              onChange={(e) =>
                setFormData((f) => ({ ...f, move_in_date: e.target.value }))
              }
            />
          </div>
        </div>
      </div>

      {/* Section 8 */}
      <div className="space-y-4">
        <h3 className="font-medium">Section 8 Information</h3>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="has_voucher"
            checked={formData.has_voucher}
            onCheckedChange={(c) =>
              setFormData((f) => ({ ...f, has_voucher: c === true }))
            }
          />
          <Label htmlFor="has_voucher">Has Section 8 Voucher</Label>
        </div>
        {formData.has_voucher && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="voucher_amount">Voucher Amount ($)</Label>
              <Input
                id="voucher_amount"
                type="number"
                className="min-h-[44px]"
                value={formData.voucher_amount}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, voucher_amount: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Voucher Status</Label>
              <Select
                value={formData.voucher_status || "unknown"}
                onValueChange={(v) =>
                  setFormData((f) => ({ ...f, voucher_status: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {VOUCHER_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="housing_authority">Housing Authority</Label>
              <Input
                id="housing_authority"
                className="min-h-[44px]"
                value={formData.housing_authority}
                onChange={(e) =>
                  setFormData((f) => ({
                    ...f,
                    housing_authority: e.target.value,
                  }))
                }
              />
            </div>
          </div>
        )}
      </div>

      {/* Consent */}
      <div className="space-y-4">
        <h3 className="font-medium">Communication Consent</h3>
        <div className="flex flex-wrap gap-6">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="sms_consent"
              checked={formData.sms_consent}
              onCheckedChange={(c) =>
                setFormData((f) => ({ ...f, sms_consent: c === true }))
              }
            />
            <Label htmlFor="sms_consent">SMS Consent</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="call_consent"
              checked={formData.call_consent}
              onCheckedChange={(c) =>
                setFormData((f) => ({ ...f, call_consent: c === true }))
              }
            />
            <Label htmlFor="call_consent">Call Consent</Label>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {lead ? "Update Lead" : "Create Lead"}
        </Button>
      </div>
    </form>
  );
};
