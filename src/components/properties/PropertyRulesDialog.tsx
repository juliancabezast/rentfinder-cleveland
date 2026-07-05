import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Wand2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  DEFAULT_LISTING_CONFIG,
  LISTING_MERGE_TAGS,
  SAMPLE_PROPERTY,
  loadListingConfig,
  saveListingConfig,
  renderPropertyDescription,
  applyDescriptionToAllProperties,
  type ListingTemplateConfig,
  type ListingPolicies,
} from "@/lib/listingTemplate";

interface PropertyRulesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PropertyRulesDialog: React.FC<PropertyRulesDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { userRecord } = useAuth();
  const [config, setConfig] = useState<ListingTemplateConfig>(DEFAULT_LISTING_CONFIG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open || !userRecord?.organization_id) return;
    const load = async () => {
      setLoading(true);
      try {
        setConfig(await loadListingConfig(supabase, userRecord.organization_id));
      } catch (err) {
        console.error("Error loading listing config:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [open, userRecord?.organization_id]);

  const setPolicy = <K extends keyof ListingPolicies>(k: K, v: ListingPolicies[K]) =>
    setConfig((c) => ({ ...c, policies: { ...c.policies, [k]: v } }));

  const persist = async (): Promise<boolean> => {
    if (!userRecord?.organization_id) return false;
    await saveListingConfig(supabase, userRecord.organization_id, userRecord.id, config);
    return true;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (await persist()) {
        toast.success("Template & policies saved");
        onOpenChange(false);
      }
    } catch (err) {
      console.error("Error saving listing config:", err);
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndApply = async () => {
    if (!userRecord?.organization_id) return;
    setApplying(true);
    try {
      await persist();
      const n = await applyDescriptionToAllProperties(
        supabase,
        userRecord.organization_id,
        config,
      );
      toast.success(`Saved · applied to ${n} propert${n === 1 ? "y" : "ies"}`);
      onOpenChange(false);
    } catch (err) {
      console.error("Error applying descriptions:", err);
      toast.error("Saved, but applying to properties failed");
    } finally {
      setApplying(false);
    }
  };

  const preview = renderPropertyDescription(config, SAMPLE_PROPERTY);
  const busy = saving || applying;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Listing Template &amp; Policies</DialogTitle>
          <DialogDescription>
            Define one generic description template and your leasing policies once. It generates the
            description for <strong>every</strong> property (renters, the AI matcher, and your team all
            use it) — no more writing a description per property.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Description template */}
            <div className="space-y-1.5">
              <Label htmlFor="tpl">Description template</Label>
              <Textarea
                id="tpl"
                value={config.template}
                onChange={(e) => setConfig((c) => ({ ...c, template: e.target.value }))}
                rows={4}
                className="text-sm leading-relaxed"
              />
              <div className="flex flex-wrap gap-1 pt-1">
                <span className="text-[11px] text-muted-foreground mr-1">Merge tags:</span>
                {LISTING_MERGE_TAGS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setConfig((c) => ({ ...c, template: `${c.template} ${t}` }))}
                    className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 hover:bg-slate-200"
                    title="Click to append"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Policies */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Leasing policies</Label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Append terms block
                  <Switch
                    checked={config.showPoliciesBlock}
                    onCheckedChange={(v) => setConfig((c) => ({ ...c, showPoliciesBlock: v }))}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <NumField label="Income × rent" value={config.policies.incomeMultiple}
                  onChange={(v) => setPolicy("incomeMultiple", v)} step={0.5} />
                <NumField label="Min credit score" value={config.policies.minCreditScore}
                  onChange={(v) => setPolicy("minCreditScore", v)} />
                <NumField label="Application fee ($)" value={config.policies.applicationFee}
                  onChange={(v) => setPolicy("applicationFee", v)} />
                <NumField label="Move-in fee ($)" value={config.policies.moveInFee}
                  onChange={(v) => setPolicy("moveInFee", v)} />
                <NumField label="Lease (months)" value={config.policies.leaseMonths}
                  onChange={(v) => setPolicy("leaseMonths", v)} />
                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 text-xs">
                    <Switch checked={config.policies.section8}
                      onCheckedChange={(v) => setPolicy("section8", v)} />
                    Section 8 / vouchers
                  </label>
                </div>
              </div>

              <TxtField label="Security deposit" value={config.policies.depositText}
                onChange={(v) => setPolicy("depositText", v)} />
              <TxtField label="Pet policy" value={config.policies.petPolicy}
                onChange={(v) => setPolicy("petPolicy", v)} />
              <TxtField label="Utilities" value={config.policies.utilities}
                onChange={(v) => setPolicy("utilities", v)} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TxtField label="Appliances" value={config.policies.appliances}
                  onChange={(v) => setPolicy("appliances", v)} />
                <TxtField label="Processing time" value={config.policies.processingTime}
                  onChange={(v) => setPolicy("processingTime", v)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="extra" className="text-xs">Extra notes</Label>
                <Textarea id="extra" rows={2} className="text-sm"
                  value={config.policies.extraNotes}
                  onChange={(e) => setPolicy("extraNotes", e.target.value)} />
              </div>
            </div>

            {/* Live preview */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Preview (sample: 3bd/1ba in Slavic Village at $1,100)
              </Label>
              <div className="rounded-lg border bg-slate-50 p-3 text-[13px] leading-relaxed text-slate-700 whitespace-pre-line max-h-52 overflow-y-auto">
                {preview}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1.5"
                onClick={() => setConfig(DEFAULT_LISTING_CONFIG)}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset to default
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button variant="outline" onClick={handleSave} disabled={busy}>
                  {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                  Save only
                </Button>
                <Button onClick={handleSaveAndApply} disabled={busy}
                  className="bg-[#4F46E5] hover:bg-[#4F46E5]/90 text-white gap-1.5">
                  {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  Save &amp; apply to all
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ── Small field helpers ───────────────────────────────────────────────
const NumField = ({
  label, value, onChange, step,
}: { label: string; value: number; onChange: (v: number) => void; step?: number }) => (
  <div className="space-y-1">
    <Label className="text-xs">{label}</Label>
    <Input
      type="number"
      step={step}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      className="h-9"
    />
  </div>
);

const TxtField = ({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) => (
  <div className="space-y-1">
    <Label className="text-xs">{label}</Label>
    <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-9" />
  </div>
);
