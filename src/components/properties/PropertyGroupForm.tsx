import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, X, Plus, Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { convertToWebP } from "@/lib/imageUtils";

const PROPERTY_TYPES = [
  { value: "single_family", label: "Single Family" },
  { value: "duplex", label: "Duplex" },
  { value: "triplex", label: "Triplex" },
  { value: "fourplex", label: "Fourplex" },
];

interface NeighborhoodInfo {
  area_benefits: string[];
  nearby_places: string[];
  school_district: string;
}

export interface PropertyGroup {
  id: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  property_type: string | null;
  cover_photo: string | null;
  description: string | null;
  neighborhood_info: NeighborhoodInfo | null;
  investor_id: string | null;
}

interface PropertyGroupFormProps {
  group?: PropertyGroup | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const PropertyGroupForm: React.FC<PropertyGroupFormProps> = ({
  group,
  onSuccess,
  onCancel,
}) => {
  const { organization } = useAuth();
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  // Form state
  const [address, setAddress] = useState(group?.address || "");
  const [city, setCity] = useState(group?.city || "Cleveland");
  const [state, setState] = useState(group?.state || "OH");
  const [zipCode, setZipCode] = useState(group?.zip_code || "");
  const [propertyType, setPropertyType] = useState(group?.property_type || "single_family");
  const [coverPhoto, setCoverPhoto] = useState(group?.cover_photo || "");
  const [description, setDescription] = useState(group?.description || "");

  // Neighborhood info
  const neighborhoodData = (group?.neighborhood_info || {
    area_benefits: [],
    nearby_places: [],
    school_district: "",
  }) as NeighborhoodInfo;

  const [areaBenefits, setAreaBenefits] = useState<string[]>(neighborhoodData.area_benefits || []);
  const [nearbyPlaces, setNearbyPlaces] = useState<string[]>(neighborhoodData.nearby_places || []);
  const [schoolDistrict, setSchoolDistrict] = useState(neighborhoodData.school_district || "");
  const [newBenefit, setNewBenefit] = useState("");
  const [newPlace, setNewPlace] = useState("");

  // Photos already on this building's units, offered as cover choices — the
  // shot you want is nearly always one of them, so re-uploading it is wasted
  // work and leaves a duplicate in storage. Units are matched by group link
  // OR by the shared address string: only about half the catalog has
  // property_group_id backfilled, but every unit of a building shares the
  // address (that is how the public listings group them too).
  const [unitPhotos, setUnitPhotos] = useState<{ url: string; unit: string | null }[]>([]);
  const [loadingUnitPhotos, setLoadingUnitPhotos] = useState(false);

  useEffect(() => {
    const gid = group?.id;
    const gaddr = (group?.address || "").trim();
    if (!organization?.id || (!gid && !gaddr)) return;
    let cancelled = false;

    (async () => {
      setLoadingUnitPhotos(true);
      try {
        const base = () =>
          supabase
            .from("properties")
            .select("id, unit_number, photos")
            .eq("organization_id", organization.id);
        const [byGroup, byAddr] = await Promise.all([
          gid ? base().eq("property_group_id", gid) : Promise.resolve({ data: [] }),
          gaddr ? base().ilike("address", gaddr) : Promise.resolve({ data: [] }),
        ]);

        const seenUnits = new Set<string>();
        const seenUrls = new Set<string>();
        const out: { url: string; unit: string | null }[] = [];
        for (const row of [...(byGroup.data || []), ...(byAddr.data || [])]) {
          const r = row as { id: string; unit_number: string | null; photos: unknown };
          if (seenUnits.has(r.id)) continue;
          seenUnits.add(r.id);
          const photos = Array.isArray(r.photos) ? r.photos : [];
          for (const p of photos) {
            const url =
              typeof p === "string"
                ? p
                : (p as Record<string, unknown> | null)?.url ??
                  (p as Record<string, unknown> | null)?.src ??
                  (p as Record<string, unknown> | null)?.href;
            if (typeof url !== "string" || !url || seenUrls.has(url)) continue;
            seenUrls.add(url);
            out.push({ url, unit: r.unit_number ?? null });
          }
        }
        if (!cancelled) setUnitPhotos(out);
      } catch (error) {
        console.error("Failed to load unit photos:", error);
      } finally {
        if (!cancelled) setLoadingUnitPhotos(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [group?.id, group?.address, organization?.id]);

  // A cover that was uploaded (or set before this picker existed) belongs to no
  // unit, so it would be invisible in a grid built only from unit photos —
  // there is no full-width preview any more to fall back on. Show it as the
  // first choice, labelled so it is clearly not one of the unit shots.
  const choices = React.useMemo(() => {
    const list = unitPhotos.map((p) => ({ ...p, uploaded: false }));
    if (coverPhoto && !list.some((p) => p.url === coverPhoto)) {
      list.unshift({ url: coverPhoto, unit: null, uploaded: true });
    }
    return list;
  }, [unitPhotos, coverPhoto]);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !group?.id) return;

    setUploadingCover(true);
    try {
      const webpFile = await convertToWebP(file);
      const fileName = `${Date.now()}-cover.webp`;
      const filePath = `groups/${group.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("property-photos")
        .upload(filePath, webpFile);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("property-photos").getPublicUrl(filePath);

      setCoverPhoto(publicUrl);
      toast.success("Cover photo uploaded");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload cover photo");
    } finally {
      setUploadingCover(false);
    }
  };

  const handleSave = async () => {
    if (!organization?.id) return;
    if (!address.trim() || !zipCode.trim()) {
      toast.error("Address and ZIP code are required");
      return;
    }

    setSaving(true);
    try {
      const data = {
        address: address.trim(),
        city,
        state,
        zip_code: zipCode,
        property_type: propertyType,
        cover_photo: coverPhoto || null,
        description: description || null,
        neighborhood_info: {
          area_benefits: areaBenefits,
          nearby_places: nearbyPlaces,
          school_district: schoolDistrict,
        },
        organization_id: organization.id,
      };

      if (group?.id) {
        const { error } = await supabase
          .from("property_groups")
          .update(data)
          .eq("id", group.id)
          .eq("organization_id", organization.id);
        if (error) throw error;
        toast.success("Property updated");
      } else {
        const { error } = await supabase.from("property_groups").insert(data);
        if (error) throw error;
        toast.success("Property created");
      }

      onSuccess();
    } catch (error) {
      console.error("Error saving:", error);
      toast.error("Failed to save property");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Address */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Address</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Street Address</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="1234 Cedar Ave"
              className="min-h-[44px]"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>City</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} className="min-h-[44px]" />
            </div>
            <div>
              <Label>State</Label>
              <Input value={state} onChange={(e) => setState(e.target.value)} className="min-h-[44px]" />
            </div>
            <div>
              <Label>ZIP</Label>
              <Input
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                className="min-h-[44px]"
              />
            </div>
          </div>
          <div>
            <Label>Property Type</Label>
            <Select value={propertyType} onValueChange={setPropertyType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROPERTY_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Cover Photo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Cover Photo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Same grid the unit editor uses — the cover is picked by clicking a
              thumbnail, not previewed at full width. A building can have 90+
              unit photos, so a giant preview pushed every choice below the
              fold and made the two editors look like different products. */}
          {!group?.id ? (
            <p className="text-xs text-muted-foreground">
              Save the property first, then choose a cover photo.
            </p>
          ) : loadingUnitPhotos ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading unit photos…
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">
                {choices.length > 0
                  ? "Click a photo to make it the one shown on the website"
                  : "This building's units have no photos yet — upload a cover below."}
              </p>
              {choices.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-80 overflow-y-auto pr-1">
                  {choices.map((p) => {
                    const selected = coverPhoto === p.url;
                    return (
                      <button
                        key={p.url}
                        type="button"
                        onClick={() => setCoverPhoto(p.url)}
                        aria-pressed={selected}
                        aria-label={
                          p.unit ? `Use unit ${p.unit} photo as cover` : "Use photo as cover"
                        }
                        className={cn(
                          "relative aspect-video rounded-lg overflow-hidden border transition-all group",
                          selected ? "ring-2 ring-primary" : "hover:border-primary/50",
                        )}
                      >
                        <img
                          src={p.url}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                        {!selected && (
                          <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <span className="text-[11px] font-semibold text-white bg-black/50 px-2 py-1 rounded">
                              Set as cover
                            </span>
                          </span>
                        )}
                        {selected && (
                          <span className="absolute top-1 left-1 text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                            Cover
                          </span>
                        )}
                        {(p.unit || p.uploaded) && (
                          <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                            {p.uploaded ? "Uploaded" : p.unit}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Escape hatches: a shot no unit has, or no cover at all. */}
              <div className="flex items-center gap-3 pt-1">
                <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  {uploadingCover ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ImageIcon className="h-3.5 w-3.5" />
                  )}
                  Upload a different photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleCoverUpload}
                    disabled={uploadingCover}
                  />
                </label>
                {coverPhoto && (
                  <button
                    type="button"
                    onClick={() => setCoverPhoto("")}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-3.5 w-3.5" /> Clear cover
                  </button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Description */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="General property description..."
            rows={4}
          />
        </CardContent>
      </Card>

      {/* Neighborhood */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Neighborhood Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Area Benefits */}
          <div>
            <Label className="text-xs text-muted-foreground">Area Benefits</Label>
            <div className="space-y-1.5 mt-1">
              {areaBenefits.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={b}
                    onChange={(e) => {
                      const n = [...areaBenefits];
                      n[i] = e.target.value;
                      setAreaBenefits(n);
                    }}
                    className="h-8 text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() =>
                      setAreaBenefits(areaBenefits.filter((_, j) => j !== i))
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  value={newBenefit}
                  onChange={(e) => setNewBenefit(e.target.value)}
                  placeholder="Add benefit (e.g. Quiet neighborhood)"
                  className="h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newBenefit.trim()) {
                      e.preventDefault();
                      setAreaBenefits([...areaBenefits, newBenefit.trim()]);
                      setNewBenefit("");
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={() => {
                    if (newBenefit.trim()) {
                      setAreaBenefits([...areaBenefits, newBenefit.trim()]);
                      setNewBenefit("");
                    }
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Nearby Places */}
          <div>
            <Label className="text-xs text-muted-foreground">Nearby Places</Label>
            <div className="space-y-1.5 mt-1">
              {nearbyPlaces.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={p}
                    onChange={(e) => {
                      const n = [...nearbyPlaces];
                      n[i] = e.target.value;
                      setNearbyPlaces(n);
                    }}
                    className="h-8 text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() =>
                      setNearbyPlaces(nearbyPlaces.filter((_, j) => j !== i))
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  value={newPlace}
                  onChange={(e) => setNewPlace(e.target.value)}
                  placeholder="Add place (e.g. Walmart - 3 min)"
                  className="h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newPlace.trim()) {
                      e.preventDefault();
                      setNearbyPlaces([...nearbyPlaces, newPlace.trim()]);
                      setNewPlace("");
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={() => {
                    if (newPlace.trim()) {
                      setNearbyPlaces([...nearbyPlaces, newPlace.trim()]);
                      setNewPlace("");
                    }
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* School District */}
          <div>
            <Label className="text-xs text-muted-foreground">School District</Label>
            <Input
              value={schoolDistrict}
              onChange={(e) => setSchoolDistrict(e.target.value)}
              placeholder="Cleveland Metropolitan"
              className="h-8 text-sm mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {group?.id ? "Save Changes" : "Create Property"}
        </Button>
      </div>
    </div>
  );
};
