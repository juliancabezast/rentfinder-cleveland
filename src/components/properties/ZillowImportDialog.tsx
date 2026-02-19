import React, { useState, useRef } from "react";
import { Globe, Loader2, Check, Home, DollarSign, Bed, Bath, Ruler, AlertCircle, Upload, ImageIcon, X, CheckCircle, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface ZillowProperty {
  address: string;
  city: string;
  state: string;
  zip_code: string;
  bedrooms: number;
  bathrooms: number;
  square_feet: number | null;
  property_type: string;
  rent_price: number;
  deposit_amount: number | null;
  application_fee: number | null;
  description: string | null;
  photos: string[];
  section_8_accepted: boolean;
  hud_inspection_ready: boolean;
  status: string;
  pet_policy: string | null;
  year_built: number | null;
  _zillow_url: string;
  _zpid: string;
  _zestimate: number | null;
  _rent_zestimate: number | null;
}

interface ZillowImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const ZillowImportDialog: React.FC<ZillowImportDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
}) => {
  const { userRecord } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<"url" | "review" | "saving">("url");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [property, setProperty] = useState<ZillowProperty | null>(null);

  // Editable fields in review step
  const [editBedrooms, setEditBedrooms] = useState("");
  const [editBathrooms, setEditBathrooms] = useState("");
  const [editSqft, setEditSqft] = useState("");
  const [editPropertyType, setEditPropertyType] = useState("house");
  const [editRent, setEditRent] = useState("");
  const [editDeposit, setEditDeposit] = useState("");
  const [editAppFee, setEditAppFee] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState("available");
  const [editSection8, setEditSection8] = useState(true);
  const [editHud, setEditHud] = useState(true);
  const [editPetPolicy, setEditPetPolicy] = useState("");

  // AI description generation
  const [generatingDesc, setGeneratingDesc] = useState(false);

  // AI screenshot extraction state
  const [aiExtracting, setAiExtracting] = useState(false);
  const [aiResults, setAiResults] = useState<Record<string, unknown> | null>(null);
  const [aiApprovals, setAiApprovals] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fieldLabels: Record<string, string> = {
    bedrooms: "Bedrooms",
    bathrooms: "Bathrooms",
    sqft: "Sq Ft",
    rent_price: "Monthly Rent",
    property_type: "Property Type",
    pet_policy: "Pet Policy",
    description: "Description",
    deposit: "Security Deposit",
    application_fee: "Application Fee",
  };

  const handleScreenshotUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !userRecord?.organization_id) return;

    setAiExtracting(true);
    setAiResults(null);

    try {
      // Convert files to base64 data URLs
      const images: string[] = [];
      for (let i = 0; i < Math.min(files.length, 4); i++) {
        const file = files[i];
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        images.push(base64);
      }

      const { data, error: fnError } = await supabase.functions.invoke(
        "extract-property-from-image",
        {
          body: {
            organization_id: userRecord.organization_id,
            images,
          },
        }
      );

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.extracted || Object.keys(data.extracted).length === 0) {
        toast({ title: "No data found", description: "AI could not extract property details from the screenshot.", variant: "destructive" });
        return;
      }

      setAiResults(data.extracted);
      // Default all fields to approved
      const approvals: Record<string, boolean> = {};
      for (const key of Object.keys(data.extracted)) {
        approvals[key] = true;
      }
      setAiApprovals(approvals);
    } catch (err) {
      toast({
        title: "Screenshot analysis failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setAiExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const applyAiResults = () => {
    if (!aiResults) return;

    if (aiApprovals.bedrooms && aiResults.bedrooms != null) setEditBedrooms(String(aiResults.bedrooms));
    if (aiApprovals.bathrooms && aiResults.bathrooms != null) setEditBathrooms(String(aiResults.bathrooms));
    if (aiApprovals.sqft && aiResults.sqft != null) setEditSqft(String(aiResults.sqft));
    if (aiApprovals.rent_price && aiResults.rent_price != null) setEditRent(String(aiResults.rent_price));
    if (aiApprovals.property_type && aiResults.property_type) setEditPropertyType(String(aiResults.property_type));
    if (aiApprovals.pet_policy && aiResults.pet_policy) setEditPetPolicy(String(aiResults.pet_policy));
    if (aiApprovals.description && aiResults.description) setEditDescription(String(aiResults.description));
    if (aiApprovals.deposit && aiResults.deposit != null) setEditDeposit(String(aiResults.deposit));
    if (aiApprovals.application_fee && aiResults.application_fee != null) setEditAppFee(String(aiResults.application_fee));

    setAiResults(null);
    setAiApprovals({});
    toast({ title: "Fields updated", description: "AI-extracted data has been applied." });
  };

  const generateAiDescription = async () => {
    if (!userRecord?.organization_id || !property) return;

    setGeneratingDesc(true);
    try {
      const context = {
        address: property.address,
        city: property.city,
        state: property.state,
        zip_code: property.zip_code,
        bedrooms: editBedrooms || "unknown",
        bathrooms: editBathrooms || "unknown",
        sqft: editSqft || "unknown",
        property_type: editPropertyType,
        rent_price: editRent || "unknown",
        pet_policy: editPetPolicy || "not specified",
        section_8: editSection8 ? "accepted" : "not accepted",
        hud_ready: editHud ? "yes" : "no",
      };

      const { data: creds } = await supabase
        .from("organization_credentials")
        .select("openai_api_key")
        .eq("organization_id", userRecord.organization_id)
        .single();

      if (!creds?.openai_api_key) {
        toast({ title: "OpenAI not configured", description: "Add your OpenAI API key in Settings → Integrations.", variant: "destructive" });
        return;
      }

      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.openai_api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: 300,
          messages: [
            {
              role: "system",
              content: `You are writing a concise rental property description optimized for AI agents that handle inbound calls and lead management. The description must:
1. Lead with the most important details: rent, beds/baths, key features
2. Be concise (3-4 sentences max)
3. Include Section 8/voucher status clearly
4. Mention pet policy if available
5. Highlight move-in readiness and standout amenities
6. Use a professional, informative tone (not marketing fluff)
7. Write in English only
Return ONLY the description text, no quotes or labels.`,
            },
            {
              role: "user",
              content: `Generate an AI-optimized property description:\n${JSON.stringify(context)}`,
            },
          ],
        }),
      });

      if (!resp.ok) throw new Error(`OpenAI error: ${resp.status}`);
      const data = await resp.json();
      const desc = data.choices?.[0]?.message?.content?.trim();
      if (desc) setEditDescription(desc);
    } catch (err) {
      toast({ title: "Generation failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setGeneratingDesc(false);
    }
  };

  const resetState = () => {
    setStep("url");
    setUrl("");
    setLoading(false);
    setError(null);
    setProperty(null);
  };

  const handleFetch = async () => {
    if (!url.trim()) return;

    if (!url.includes("zillow.com")) {
      setError("Please enter a valid Zillow URL.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "import-zillow-property",
        {
          body: {
            zillow_url: url.trim(),
            organization_id: userRecord?.organization_id,
          },
        }
      );

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.property) throw new Error("No property data returned");

      const p = data.property as ZillowProperty;
      setProperty(p);
      setEditBedrooms(String(p.bedrooms || ""));
      setEditBathrooms(String(p.bathrooms || ""));
      setEditSqft(String(p.square_feet || ""));
      setEditPropertyType(p.property_type || "house");
      setEditRent(String(p.rent_price || ""));
      setEditDeposit(String(p.deposit_amount || ""));
      setEditAppFee(String(p.application_fee || ""));
      setEditDescription(p.description || "");
      setEditStatus(p.status || "available");
      setEditSection8(p.section_8_accepted ?? true);
      setEditHud(p.hud_inspection_ready ?? true);
      setEditPetPolicy(p.pet_policy || "");
      setStep("review");
    } catch (err) {
      setError((err as Error).message || "Failed to fetch property data");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!property || !userRecord?.organization_id) return;

    setStep("saving");

    try {
      const rentPrice = parseFloat(editRent) || 0;
      if (rentPrice <= 0) {
        throw new Error("Rent price is required and must be greater than $0.");
      }

      const { error: insertErr } = await supabase.from("properties").insert({
        organization_id: userRecord.organization_id,
        address: property.address,
        city: property.city,
        state: property.state,
        zip_code: property.zip_code,
        bedrooms: parseInt(editBedrooms) || 0,
        bathrooms: parseFloat(editBathrooms) || 0,
        square_feet: parseInt(editSqft) || null,
        property_type: editPropertyType,
        rent_price: rentPrice,
        deposit_amount: parseFloat(editDeposit) || null,
        application_fee: parseFloat(editAppFee) || null,
        description: editDescription || null,
        photos: property.photos.length > 0 ? property.photos : [],
        section_8_accepted: editSection8,
        hud_inspection_ready: editHud,
        status: editStatus,
        pet_policy: editPetPolicy || null,
        special_notes: `Imported from Zillow (ZPID: ${property._zpid})`,
      });

      if (insertErr) throw insertErr;

      toast({
        title: "Property Imported",
        description: `${property.address} has been added successfully.`,
      });

      onSuccess();
      onOpenChange(false);
      resetState();
    } catch (err) {
      setError((err as Error).message || "Failed to save property");
      setStep("review");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) resetState();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-[#370d4b]" />
            Import from Zillow
          </DialogTitle>
          <DialogDescription>
            Paste a Zillow listing URL to auto-fill property details.
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: URL Input ─────────────────────────────────────── */}
        {step === "url" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="zillow-url">Zillow Listing URL</Label>
              <Input
                id="zillow-url"
                placeholder="https://www.zillow.com/homedetails/..."
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleFetch();
                }}
                className="min-h-[44px]"
              />
              <p className="text-xs text-muted-foreground">
                Copy the full URL from any Zillow listing page
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  resetState();
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleFetch}
                disabled={!url.trim() || loading}
                className="bg-[#370d4b] hover:bg-[#370d4b]/90 text-white"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  "Fetch Property"
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Review & Edit ────────────────────────────────── */}
        {step === "review" && property && (
          <div className="space-y-4">
            {/* Photo preview */}
            {property.photos.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {property.photos.slice(0, 5).map((photo, i) => (
                  <img
                    key={i}
                    src={photo}
                    alt={`Property photo ${i + 1}`}
                    className="h-24 w-36 object-cover rounded-lg shrink-0 border"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ))}
                {property.photos.length > 5 && (
                  <div className="h-24 w-36 rounded-lg border bg-muted flex items-center justify-center text-sm text-muted-foreground shrink-0">
                    +{property.photos.length - 5} more
                  </div>
                )}
              </div>
            )}

            {/* Address (read-only from URL) */}
            <Card>
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <Home className="h-5 w-5 text-[#370d4b]" />
                  {property.address}
                </div>
                <p className="text-sm text-muted-foreground">
                  {property.city}, {property.state} {property.zip_code}
                </p>
                {property._zestimate && (
                  <p className="text-xs text-muted-foreground">
                    Zestimate: ${property._zestimate.toLocaleString()} | Rent
                    Zestimate: $
                    {property._rent_zestimate?.toLocaleString() || "N/A"}/mo
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Screenshot upload for AI extraction */}
            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleScreenshotUpload(e.target.files)}
              />
              {aiExtracting ? (
                <div className="flex items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed border-[#370d4b]/30 bg-[#370d4b]/5">
                  <Loader2 className="h-5 w-5 animate-spin text-[#370d4b]" />
                  <span className="text-sm text-[#370d4b] font-medium">AI analyzing screenshots...</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-[#370d4b]/50 hover:bg-[#370d4b]/5 transition-colors cursor-pointer"
                >
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Upload screenshots to auto-fill with AI
                  </span>
                </button>
              )}
            </div>

            {/* AI extraction results popup */}
            {aiResults && Object.keys(aiResults).length > 0 && (
              <Card className="border-[#370d4b]/30 bg-[#370d4b]/5">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#370d4b] flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      AI found these details
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => { setAiResults(null); setAiApprovals({}); }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {Object.entries(aiResults).map(([key, value]) => {
                      if (value == null || value === "") return null;
                      const label = fieldLabels[key] || key;
                      const displayValue = key === "rent_price" || key === "deposit" || key === "application_fee"
                        ? `$${value}`
                        : String(value);
                      const truncated = displayValue.length > 60
                        ? displayValue.substring(0, 60) + "..."
                        : displayValue;

                      return (
                        <div
                          key={key}
                          className="flex items-center gap-3 px-3 py-2 rounded-md bg-white/70"
                        >
                          <Checkbox
                            checked={aiApprovals[key] ?? true}
                            onCheckedChange={(v) =>
                              setAiApprovals((prev) => ({ ...prev, [key]: v === true }))
                            }
                          />
                          <span className="text-sm font-medium w-28 shrink-0">{label}</span>
                          <span className="text-sm text-muted-foreground truncate">{truncated}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setAiResults(null); setAiApprovals({}); }}
                    >
                      Dismiss
                    </Button>
                    <Button
                      size="sm"
                      onClick={applyAiResults}
                      className="bg-[#370d4b] hover:bg-[#370d4b]/90 text-white"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Apply Selected
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Property details — all editable */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label htmlFor="edit-beds" className="flex items-center gap-1">
                  <Bed className="h-3 w-3" /> Bedrooms *
                </Label>
                <Input
                  id="edit-beds"
                  type="number"
                  value={editBedrooms}
                  onChange={(e) => setEditBedrooms(e.target.value)}
                  placeholder="3"
                  className="min-h-[44px]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-baths" className="flex items-center gap-1">
                  <Bath className="h-3 w-3" /> Bathrooms *
                </Label>
                <Input
                  id="edit-baths"
                  type="number"
                  step="0.5"
                  value={editBathrooms}
                  onChange={(e) => setEditBathrooms(e.target.value)}
                  placeholder="1"
                  className="min-h-[44px]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-sqft" className="flex items-center gap-1">
                  <Ruler className="h-3 w-3" /> Sq Ft
                </Label>
                <Input
                  id="edit-sqft"
                  type="number"
                  value={editSqft}
                  onChange={(e) => setEditSqft(e.target.value)}
                  placeholder="1200"
                  className="min-h-[44px]"
                />
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={editPropertyType} onValueChange={setEditPropertyType}>
                  <SelectTrigger className="min-h-[44px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="house">House</SelectItem>
                    <SelectItem value="apartment">Apartment</SelectItem>
                    <SelectItem value="duplex">Duplex</SelectItem>
                    <SelectItem value="condo">Condo</SelectItem>
                    <SelectItem value="townhouse">Townhouse</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label htmlFor="edit-rent" className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" /> Monthly Rent *
                </Label>
                <Input
                  id="edit-rent"
                  type="number"
                  value={editRent}
                  onChange={(e) => setEditRent(e.target.value)}
                  placeholder="1300"
                  className="min-h-[44px]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-deposit">Security Deposit</Label>
                <Input
                  id="edit-deposit"
                  type="number"
                  value={editDeposit}
                  onChange={(e) => setEditDeposit(e.target.value)}
                  placeholder="0"
                  className="min-h-[44px]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-appfee">Application Fee</Label>
                <Input
                  id="edit-appfee"
                  type="number"
                  value={editAppFee}
                  onChange={(e) => setEditAppFee(e.target.value)}
                  placeholder="0"
                  className="min-h-[44px]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger className="min-h-[44px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="coming_soon">Coming Soon</SelectItem>
                    <SelectItem value="in_leasing_process">
                      In Leasing
                    </SelectItem>
                    <SelectItem value="rented">Rented</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-pet">Pet Policy</Label>
                <Input
                  id="edit-pet"
                  value={editPetPolicy}
                  onChange={(e) => setEditPetPolicy(e.target.value)}
                  placeholder="e.g. Cats, dogs OK"
                  className="min-h-[44px]"
                />
              </div>
            </div>

            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-s8"
                  checked={editSection8}
                  onCheckedChange={(v) => setEditSection8(v === true)}
                />
                <Label htmlFor="edit-s8" className="text-sm">
                  Section 8 Accepted
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-hud"
                  checked={editHud}
                  onCheckedChange={(v) => setEditHud(v === true)}
                />
                <Label htmlFor="edit-hud" className="text-sm">
                  HUD Inspection Ready
                </Label>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-desc">Description</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={generateAiDescription}
                  disabled={generatingDesc}
                  className="h-7 px-2 text-xs text-[#370d4b] hover:bg-[#370d4b]/10"
                >
                  {generatingDesc ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5 mr-1" />
                      AI Magic
                    </>
                  )}
                </Button>
              </div>
              <Textarea
                id="edit-desc"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
                placeholder="Property description..."
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  setStep("url");
                  setError(null);
                }}
              >
                Back
              </Button>
              <Button
                onClick={handleSave}
                className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold"
              >
                <Check className="h-4 w-4 mr-2" />
                Import Property
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Saving ───────────────────────────────────────── */}
        {step === "saving" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-[#370d4b]" />
            <p className="text-muted-foreground">Saving property...</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
