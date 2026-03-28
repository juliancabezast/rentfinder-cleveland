import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Image,
  Check,
  MapPin,
  ExternalLink,
  Save,
  Loader2,
  Star,
  BedDouble,
  Bath,
  DollarSign,
  Building2,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface PropertyOption {
  id: string;
  address: string;
  unit_number: string | null;
  city: string | null;
  state: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  rent_price: number | null;
  photos: unknown;
  section_8_accepted: boolean | null;
}

interface CityPhotoGroup {
  city: string;
  propertyCount: number;
  photos: { url: string; address: string; propertyId: string }[];
  currentCover: string | null;
}

export const LandingPageTab: React.FC = () => {
  const { userRecord } = useAuth();
  const { getSetting, updateSetting, loading: settingsLoading } = useOrganizationSettings();
  const { toast } = useToast();
  const orgId = userRecord?.organization_id;

  const [pickerCity, setPickerCity] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Featured property state
  const [featuredPickerOpen, setFeaturedPickerOpen] = useState(false);
  const [pendingFeaturedId, setPendingFeaturedId] = useState<string | null>(null);
  const [featuredDirty, setFeaturedDirty] = useState(false);

  // Load saved cover images
  const savedCovers = useMemo(() => {
    if (settingsLoading) return {};
    return getSetting<Record<string, string>>("city_cover_images", {}) || {};
  }, [getSetting, settingsLoading]);

  // Saved featured property
  const savedFeaturedId = useMemo(() => {
    if (settingsLoading) return "";
    return getSetting<string>("featured_property_id", "") || "";
  }, [getSetting, settingsLoading]);

  const effectiveFeaturedId = pendingFeaturedId ?? savedFeaturedId;

  // Merge saved with local selections
  const effectiveCovers = useMemo(
    () => ({ ...savedCovers, ...selections }),
    [savedCovers, selections]
  );

  // Fetch all properties with photos
  const { data: queryResult, isLoading } = useQuery({
    queryKey: ["landing-page-photos", orgId],
    queryFn: async () => {
      if (!orgId) return { cities: [], properties: [] };
      const { data, error } = await supabase
        .from("properties")
        .select("id, address, unit_number, city, state, photos, status, bedrooms, bathrooms, rent_price, section_8_accepted")
        .eq("organization_id", orgId)
        .in("status", ["available", "active", "coming_soon"])
        .order("city");
      if (error) throw error;

      const cityMap = new Map<
        string,
        { count: number; photos: { url: string; address: string; propertyId: string }[] }
      >();

      for (const p of data || []) {
        const city = p.city || "Other";
        if (!cityMap.has(city)) cityMap.set(city, { count: 0, photos: [] });
        const group = cityMap.get(city)!;
        group.count += 1;

        const photos = p.photos as unknown as (string | { url?: string })[] | null;
        if (Array.isArray(photos)) {
          for (const photo of photos) {
            const url = typeof photo === "string" ? photo : photo?.url;
            if (url) {
              group.photos.push({
                url,
                address: `${p.address}${p.unit_number ? ` #${p.unit_number}` : ""}`,
                propertyId: p.id,
              });
            }
          }
        }
      }

      const cities = [...cityMap.entries()]
        .map(([city, info]) => ({ city, propertyCount: info.count, photos: info.photos }))
        .sort((a, b) => b.propertyCount - a.propertyCount);

      return { cities, properties: (data || []) as PropertyOption[] };
    },
    enabled: !!orgId,
  });

  const cityGroups = queryResult?.cities;
  const allProperties = queryResult?.properties || [];

  const enrichedGroups: CityPhotoGroup[] = useMemo(
    () =>
      (cityGroups || []).map((g) => ({
        ...g,
        currentCover: effectiveCovers[g.city] || g.photos[0]?.url || null,
      })),
    [cityGroups, effectiveCovers]
  );

  const featuredProperty = useMemo(
    () => allProperties.find((p) => p.id === effectiveFeaturedId) || null,
    [allProperties, effectiveFeaturedId]
  );

  function getFirstPhoto(p: PropertyOption): string | null {
    const photos = p.photos as unknown as (string | { url?: string })[] | null;
    if (!Array.isArray(photos) || photos.length === 0) return null;
    const first = photos[0];
    return typeof first === "string" ? first : first?.url || null;
  }

  const pickerGroup = enrichedGroups.find((g) => g.city === pickerCity);

  const handleSelectFeatured = (id: string) => {
    setPendingFeaturedId(id);
    setFeaturedDirty(true);
    setFeaturedPickerOpen(false);
  };

  const handleClearFeatured = () => {
    setPendingFeaturedId("");
    setFeaturedDirty(true);
  };

  const handleSelectPhoto = (city: string, url: string) => {
    setSelections((prev) => ({ ...prev, [city]: url }));
    setIsDirty(true);
    setPickerCity(null);
  };

  const anythingDirty = isDirty || featuredDirty;

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isDirty) {
        const merged = { ...savedCovers, ...selections };
        await updateSetting(
          "city_cover_images",
          merged as unknown as Record<string, unknown>,
          "showings"
        );
      }
      if (featuredDirty) {
        await updateSetting(
          "featured_property_id",
          (pendingFeaturedId ?? "") as unknown as Record<string, unknown>,
          "showings"
        );
      }
      setIsDirty(false);
      setFeaturedDirty(false);
      toast({ title: "Saved", description: "Landing page updated. Changes are live on the booking page." });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const bookingUrl = typeof window !== "undefined"
    ? `${window.location.origin}/p/book-showing`
    : "/p/book-showing";

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                <Image className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Showings Landing Page</h3>
                <p className="text-xs text-muted-foreground">
                  Choose the cover image for each city on your public booking page
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => window.open(bookingUrl, "_blank")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Preview Page
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!anythingDirty || saving}
                className="gap-1.5 bg-[#4F46E5] hover:bg-[#4F46E5]/90"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Featured Property */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <Star className="h-5 w-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-sm">Featured Property</h3>
              <p className="text-xs text-muted-foreground">
                Highlight a property at the top of the booking page
              </p>
            </div>
          </div>

          {isLoading || settingsLoading ? (
            <Skeleton className="h-20 w-full rounded-xl" />
          ) : featuredProperty ? (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50/50">
              <div className="h-16 w-24 rounded-lg overflow-hidden shrink-0 bg-slate-100">
                {getFirstPhoto(featuredProperty) ? (
                  <img
                    src={getFirstPhoto(featuredProperty)!}
                    alt={featuredProperty.address}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-indigo-100 to-indigo-50">
                    <Building2 className="h-5 w-5 text-indigo-300" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-slate-900 truncate">
                  {featuredProperty.address}
                  {featuredProperty.unit_number ? ` #${featuredProperty.unit_number}` : ""}
                </p>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                  {featuredProperty.rent_price && (
                    <span className="flex items-center gap-0.5 font-medium text-slate-700">
                      <DollarSign className="h-3 w-3" />
                      {featuredProperty.rent_price.toLocaleString()}/mo
                    </span>
                  )}
                  {featuredProperty.bedrooms && (
                    <span className="flex items-center gap-0.5">
                      <BedDouble className="h-3 w-3" /> {featuredProperty.bedrooms} bed
                    </span>
                  )}
                  {featuredProperty.bathrooms && (
                    <span className="flex items-center gap-0.5">
                      <Bath className="h-3 w-3" /> {featuredProperty.bathrooms} bath
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {featuredProperty.city}{featuredProperty.state ? `, ${featuredProperty.state}` : ""}
                </p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => setFeaturedPickerOpen(true)}
                >
                  Change
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs gap-1 text-red-500 hover:text-red-600 hover:bg-red-50"
                  onClick={handleClearFeatured}
                >
                  <X className="h-3 w-3" /> Remove
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full h-20 border-dashed text-muted-foreground gap-2"
              onClick={() => setFeaturedPickerOpen(true)}
            >
              <Star className="h-4 w-4" />
              Choose a property to feature
            </Button>
          )}
          {featuredDirty && (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50">
              Unsaved changes
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Featured property picker dialog */}
      <Dialog open={featuredPickerOpen} onOpenChange={setFeaturedPickerOpen}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />
              Choose Featured Property
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {allProperties.map((p) => {
              const photo = getFirstPhoto(p);
              const isSelected = p.id === effectiveFeaturedId;
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelectFeatured(p.id)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                    isSelected
                      ? "border-amber-400 bg-amber-50 ring-1 ring-amber-200"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  <div className="h-12 w-18 rounded-lg overflow-hidden shrink-0 bg-slate-100 w-[72px]">
                    {photo ? (
                      <img src={photo} alt={p.address} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-slate-300" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {p.address}{p.unit_number ? ` #${p.unit_number}` : ""}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                      {p.rent_price && <span className="font-medium text-slate-700">${p.rent_price.toLocaleString()}/mo</span>}
                      {p.bedrooms && <span>{p.bedrooms} bed</span>}
                      {p.bathrooms && <span>{p.bathrooms} bath</span>}
                      {p.city && <span className="text-slate-400">{p.city}</span>}
                    </div>
                  </div>
                  {isSelected && (
                    <div className="h-6 w-6 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
                      <Check className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* City cards */}
      {isLoading || settingsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2].map((i) => (
            <Card key={i} className="border-0 shadow-sm overflow-hidden">
              <Skeleton className="h-44 w-full" />
              <CardContent className="p-4">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : enrichedGroups.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <MapPin className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No active properties with photos.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {enrichedGroups.map((g) => (
            <Card
              key={g.city}
              className="border-0 shadow-sm overflow-hidden group cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setPickerCity(g.city)}
            >
              {/* Cover preview */}
              <div className="relative h-44 w-full bg-gradient-to-br from-indigo-100 to-indigo-50 overflow-hidden">
                {g.currentCover ? (
                  <img
                    src={g.currentCover}
                    alt={g.city}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Image className="h-10 w-10 text-indigo-200" />
                  </div>
                )}
                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <h4 className="text-white font-bold text-lg leading-tight drop-shadow-sm">
                    {g.city}
                  </h4>
                  <p className="text-white/70 text-xs mt-0.5">
                    {g.propertyCount} {g.propertyCount === 1 ? "property" : "properties"} &middot; {g.photos.length} photo{g.photos.length !== 1 ? "s" : ""}
                  </p>
                </div>
                {/* Edit badge */}
                <div className="absolute top-3 right-3">
                  <Badge className="bg-white/90 text-slate-700 text-[10px] shadow-sm backdrop-blur-sm">
                    <Image className="h-3 w-3 mr-1" />
                    Change Cover
                  </Badge>
                </div>
                {/* Dirty indicator */}
                {selections[g.city] && (
                  <div className="absolute top-3 left-3">
                    <Badge className="bg-amber-500 text-white text-[10px]">
                      Unsaved
                    </Badge>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Photo picker dialog */}
      <Dialog open={!!pickerCity} onOpenChange={(open) => !open && setPickerCity(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-indigo-600" />
              Choose cover image for {pickerCity}
            </DialogTitle>
          </DialogHeader>

          {pickerGroup && pickerGroup.photos.length === 0 ? (
            <div className="text-center py-8">
              <Image className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No photos available for {pickerCity}. Upload photos to your properties first.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {pickerGroup?.photos.map((photo, i) => {
                const isSelected = effectiveCovers[pickerGroup.city] === photo.url;
                return (
                  <button
                    key={`${photo.propertyId}-${i}`}
                    onClick={() => handleSelectPhoto(pickerGroup.city, photo.url)}
                    className={cn(
                      "relative rounded-xl overflow-hidden border-2 transition-all hover:shadow-md",
                      isSelected
                        ? "border-indigo-500 ring-2 ring-indigo-200"
                        : "border-transparent hover:border-slate-300"
                    )}
                  >
                    <img
                      src={photo.url}
                      alt={photo.address}
                      className="w-full h-32 object-cover"
                    />
                    {/* Selected check */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-indigo-500 flex items-center justify-center shadow-sm">
                        <Check className="h-3.5 w-3.5 text-white" />
                      </div>
                    )}
                    {/* Address label */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 backdrop-blur-sm px-2 py-1.5">
                      <p className="text-white text-[10px] font-medium truncate">
                        {photo.address}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
