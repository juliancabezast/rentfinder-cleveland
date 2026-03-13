import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
          .eq("id", group.id);
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
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>City</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div>
              <Label>State</Label>
              <Input value={state} onChange={(e) => setState(e.target.value)} />
            </div>
            <div>
              <Label>ZIP</Label>
              <Input
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
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
        <CardContent>
          {coverPhoto ? (
            <div className="relative aspect-video rounded-lg overflow-hidden border">
              <img
                src={coverPhoto}
                alt="Cover"
                className="w-full h-full object-cover"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 h-7 w-7"
                onClick={() => setCoverPhoto("")}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center gap-2 p-8 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
              {uploadingCover ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Click to upload cover photo
                  </span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCoverUpload}
                disabled={uploadingCover || !group?.id}
              />
            </label>
          )}
          {!group?.id && !coverPhoto && (
            <p className="text-xs text-muted-foreground mt-2">
              Save the property first, then upload a cover photo.
            </p>
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
