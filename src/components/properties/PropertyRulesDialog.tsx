import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface PropertyRules {
  deposit_amount: string;
  application_fee: string;
  section_8_accepted: boolean;
  hud_inspection_ready: boolean;
  pet_policy: string;
  lease_terms: string;
  amenities: string[];
}

const DEFAULT_RULES: PropertyRules = {
  deposit_amount: "",
  application_fee: "",
  section_8_accepted: true,
  hud_inspection_ready: true,
  pet_policy: "",
  lease_terms: "",
  amenities: [],
};

interface PropertyRulesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PropertyRulesDialog: React.FC<PropertyRulesDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { userRecord } = useAuth();
  const { toast } = useToast();
  const [rules, setRules] = useState<PropertyRules>(DEFAULT_RULES);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newAmenity, setNewAmenity] = useState("");

  // Load existing rules
  useEffect(() => {
    if (!open || !userRecord?.organization_id) return;

    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("organization_settings")
          .select("key, value")
          .eq("organization_id", userRecord.organization_id)
          .eq("category", "property_rules");
        if (error) throw error;

        const loaded = { ...DEFAULT_RULES, amenities: [] as string[] };
        for (const row of data || []) {
          const val = row.value;
          if (row.key === "deposit_amount") loaded.deposit_amount = String(val ?? "");
          if (row.key === "application_fee") loaded.application_fee = String(val ?? "");
          if (row.key === "section_8_accepted") loaded.section_8_accepted = val === true;
          if (row.key === "hud_inspection_ready") loaded.hud_inspection_ready = val === true;
          if (row.key === "pet_policy") loaded.pet_policy = String(val ?? "");
          if (row.key === "lease_terms") loaded.lease_terms = String(val ?? "");
          if (row.key === "amenities" && Array.isArray(val)) loaded.amenities = val as string[];
        }
        setRules(loaded);
      } catch (err) {
        console.error("Error loading property rules:", err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [open, userRecord?.organization_id]);

  const addAmenity = () => {
    const trimmed = newAmenity.trim();
    if (!trimmed || rules.amenities.includes(trimmed)) return;
    setRules({ ...rules, amenities: [...rules.amenities, trimmed] });
    setNewAmenity("");
  };

  const removeAmenity = (index: number) => {
    setRules({ ...rules, amenities: rules.amenities.filter((_, i) => i !== index) });
  };

  const handleSave = async () => {
    if (!userRecord?.organization_id) return;
    setSaving(true);

    try {
      const entries: { key: string; value: unknown }[] = [
        { key: "deposit_amount", value: rules.deposit_amount ? Number(rules.deposit_amount) : null },
        { key: "application_fee", value: rules.application_fee ? Number(rules.application_fee) : null },
        { key: "section_8_accepted", value: rules.section_8_accepted },
        { key: "hud_inspection_ready", value: rules.hud_inspection_ready },
        { key: "pet_policy", value: rules.pet_policy || null },
        { key: "lease_terms", value: rules.lease_terms || null },
        { key: "amenities", value: rules.amenities.length > 0 ? rules.amenities : null },
      ];

      for (const entry of entries) {
        const { data: existing } = await supabase
          .from("organization_settings")
          .select("id")
          .eq("organization_id", userRecord.organization_id)
          .eq("category", "property_rules")
          .eq("key", entry.key)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("organization_settings")
            .update({
              value: entry.value as any,
              updated_by: userRecord.id,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("organization_settings").insert({
            organization_id: userRecord.organization_id,
            category: "property_rules",
            key: entry.key,
            value: entry.value as any,
            description: `Global property rule: ${entry.key}`,
            updated_by: userRecord.id,
          });
        }
      }

      toast({ title: "Rules saved", description: "Global property rules updated." });
      onOpenChange(false);
    } catch (err) {
      console.error("Error saving property rules:", err);
      toast({ title: "Error", description: "Failed to save rules.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Global Property Rules</DialogTitle>
          <p className="text-sm text-muted-foreground">
            These rules apply to all properties.
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Deposit & Fee */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rule-deposit">Security Deposit</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input
                    id="rule-deposit"
                    type="number"
                    min="0"
                    value={rules.deposit_amount}
                    onChange={(e) => setRules({ ...rules, deposit_amount: e.target.value })}
                    placeholder="0"
                    className="pl-7"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-appfee">Application Fee</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input
                    id="rule-appfee"
                    type="number"
                    min="0"
                    value={rules.application_fee}
                    onChange={(e) => setRules({ ...rules, application_fee: e.target.value })}
                    placeholder="0"
                    className="pl-7"
                  />
                </div>
              </div>
            </div>

            {/* Programs */}
            <div className="space-y-2">
              <Label className="text-sm">Programs</Label>
              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="rule-s8"
                    checked={rules.section_8_accepted}
                    onCheckedChange={(v) => setRules({ ...rules, section_8_accepted: v === true })}
                  />
                  <Label htmlFor="rule-s8" className="text-sm font-normal">Section 8</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="rule-hud"
                    checked={rules.hud_inspection_ready}
                    onCheckedChange={(v) => setRules({ ...rules, hud_inspection_ready: v === true })}
                  />
                  <Label htmlFor="rule-hud" className="text-sm font-normal">HUD Ready</Label>
                </div>
              </div>
            </div>

            {/* Pet Policy */}
            <div className="space-y-1.5">
              <Label htmlFor="rule-pets">Pet Policy</Label>
              <Input
                id="rule-pets"
                value={rules.pet_policy}
                onChange={(e) => setRules({ ...rules, pet_policy: e.target.value })}
                placeholder="e.g. Cats and dogs allowed, $300 pet deposit"
              />
            </div>

            {/* Amenities */}
            <div className="space-y-1.5">
              <Label>Amenities</Label>
              {rules.amenities.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {rules.amenities.map((a, i) => (
                    <Badge key={i} variant="secondary" className="gap-1 pr-1">
                      {a}
                      <button
                        onClick={() => removeAmenity(i)}
                        className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={newAmenity}
                  onChange={(e) => setNewAmenity(e.target.value)}
                  placeholder="e.g. Washer/Dryer, Parking, AC..."
                  className="h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addAmenity(); }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={addAmenity}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Lease Terms */}
            <div className="space-y-1.5">
              <Label htmlFor="rule-lease">Lease Terms</Label>
              <Textarea
                id="rule-lease"
                value={rules.lease_terms}
                onChange={(e) => setRules({ ...rules, lease_terms: e.target.value })}
                placeholder="e.g. 12-month lease, first month + deposit due at signing..."
                rows={3}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Rules
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
