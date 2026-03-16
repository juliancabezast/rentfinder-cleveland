import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_RULES_TEXT = `Appliances are not provided.

We accept both self-pay tenants and Section 8 or other housing vouchers. For self-paying applicants, a minimum credit score of 550 is required, along with verifiable household income equal to at least 3× the monthly rent.

The application fee is $50 (non-refundable). Security deposit is equal to one month's rent and must be paid within one week of approval. A $225 one-time move-in fee applies. Application processing typically takes 3–5 business days.

Lease term is 12 months.

All utilities, including water, gas, electricity, and sewer, are the tenant's responsibility. In multi-family properties, the basement is a shared area, so tenants do not have access to the basement. While we aim to provide accurate information, details are subject to change and should be verified.`;

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
  const [rulesText, setRulesText] = useState(DEFAULT_RULES_TEXT);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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
          .eq("category", "property_rules")
          .eq("key", "global_rules_text")
          .maybeSingle();
        if (error) throw error;

        if (data?.value && typeof data.value === "string") {
          setRulesText(data.value);
        } else {
          setRulesText(DEFAULT_RULES_TEXT);
        }
      } catch (err) {
        console.error("Error loading property rules:", err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [open, userRecord?.organization_id]);

  const handleSave = async () => {
    if (!userRecord?.organization_id) return;
    setSaving(true);

    try {
      const { data: existing } = await supabase
        .from("organization_settings")
        .select("id")
        .eq("organization_id", userRecord.organization_id)
        .eq("category", "property_rules")
        .eq("key", "global_rules_text")
        .maybeSingle();

      if (existing) {
        await supabase
          .from("organization_settings")
          .update({
            value: rulesText as any,
            updated_by: userRecord.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("organization_settings").insert({
          organization_id: userRecord.organization_id,
          category: "property_rules",
          key: "global_rules_text",
          value: rulesText as any,
          description: "Global property rules — single source of truth",
          updated_by: userRecord.id,
        });
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
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Global Property Rules</DialogTitle>
          <p className="text-sm text-muted-foreground">
            These rules apply to all properties. AI agents, listings, and communications use this text as source of truth.
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rules-text">Rules & Terms</Label>
              <Textarea
                id="rules-text"
                value={rulesText}
                onChange={(e) => setRulesText(e.target.value)}
                rows={16}
                className="text-sm leading-relaxed"
              />
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => setRulesText(DEFAULT_RULES_TEXT)}
              >
                Reset to default
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Rules
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
