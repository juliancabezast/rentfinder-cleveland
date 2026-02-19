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

      // Load existing property interests from junction table
      if (lead?.id) {
        const { data: interests } = await supabase
          .from("lead_property_interests")
          .select("property_id")
          .eq("lead_id", lead.id);

        if (interests && interests.length > 0) {
          setSelectedPropertyIds(interests.map((i: any) => i.property_id));
        } else if (lead.interested_property_id) {
          // Fallback to legacy single FK
          setSelectedPropertyIds([lead.interested_property_id]);
        }
      }
    };

    fetchData();
  }, [userRecord?.organization_id, lead?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userRecord?.organization_id) return;

    setLoading(true);
    try {
      // Base lead data — interested_property_id keeps first selection for backward compat
      const leadData = {
        organization_id: userRecord.organization_id,
        first_name: formData.first_name || null,
        last_name: formData.last_name || null,
        full_name: [formData.first_name, formData.last_name]
          .filter(Boolean)
          .join(" ") || null,
        phone: formData.phone,
        email: formData.email || null,
        preferred_language: formData.preferred_language,
        status: formData.status,
        source: formData.source,
        interested_property_id: selectedPropertyIds[0] || null,
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
        sms_consent_at: formData.sms_consent ? new Date().toISOString() : null,
        call_consent: formData.call_consent,
        call_consent_at: formData.call_consent ? new Date().toISOString() : null,
        // If creating a new lead and user is a leasing_agent, auto-assign to themselves
        assigned_leasing_agent_id: !lead && userRecord.role === "leasing_agent" 
          ? userRecord.id 
          : (lead?.assigned_leasing_agent_id ?? null),
      };

      if (lead) {
        const { error } = await supabase
          .from("leads")
          .update(leadData)
          .eq("id", lead.id);
        if (error) throw error;

        // Sync junction table: delete old, insert new
        await supabase
          .from("lead_property_interests")
          .delete()
          .eq("lead_id", lead.id);

        if (selectedPropertyIds.length > 0) {
          await supabase.from("lead_property_interests").insert(
            selectedPropertyIds.map((pid) => ({
              organization_id: userRecord.organization_id,
              lead_id: lead.id,
              property_id: pid,
            }))
          );
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
        if (error) throw error;
        
        // Sync junction table for new lead
        if (newLead?.id && selectedPropertyIds.length > 0) {
          await supabase.from("lead_property_interests").insert(
            selectedPropertyIds.map((pid) => ({
              organization_id: userRecord.organization_id,
              lead_id: newLead.id,
              property_id: pid,
            }))
          );
        }

        toast({ title: "Success", description: "Lead created successfully." });

        // Trigger smart matching for the new lead
        if (newLead?.id) {
          try {
            const { data: matchData } = await supabase.functions.invoke('match-properties', {
              body: {
                organization_id: userRecord.organization_id,
                lead_id: newLead.id,
              },
            });
            
            const matches = matchData?.matches || [];
            const highScoreMatches = matches.filter((m: any) => m.match_score > 70);
            
            if (highScoreMatches.length > 0) {
              toast({
                title: `✨ Found ${highScoreMatches.length} matching properties!`,
                description: "View the lead details to see property recommendations.",
              });
              
              // Auto-populate with top match if lead didn't specify any properties
              if (selectedPropertyIds.length === 0 && matches.length > 0) {
                await supabase
                  .from("leads")
                  .update({ interested_property_id: matches[0].property_id })
                  .eq("id", newLead.id);
                await supabase.from("lead_property_interests").insert({
                  organization_id: userRecord.organization_id,
                  lead_id: newLead.id,
                  property_id: matches[0].property_id,
                });
              }
            }
          } catch (matchError) {
            // Don't fail the lead creation if matching fails
            console.error("Error running property matching:", matchError);
          }
        }
        
        onSuccess();
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
              value={formData.last_name}
              onChange={(e) =>
                setFormData((f) => ({ ...f, last_name: e.target.value }))
              }
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone *</Label>
            <Input
              id="phone"
              type="tel"
              required
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
              value={formData.email}
              onChange={(e) =>
                setFormData((f) => ({ ...f, email: e.target.value }))
              }
            />
          </div>
        </div>
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
          <div className="space-y-2 sm:col-span-3">
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
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer"
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
