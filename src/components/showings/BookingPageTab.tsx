import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  Loader2,
  Star,
  BedDouble,
  Bath,
  Building2,
  X,
  AlertTriangle,
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
  status: string | null;
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

export const BookingPageTab: React.FC = () => {
  const { userRecord } = useAuth();
  const { getSetting, updateSetting, loading: settingsLoading } = useOrganizationSettings();
  const { toast } = useToast();
  const orgId = userRecord?.organization_id;

  const [pickerCity, setPickerCity] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [featuredPickerOpen, setFeaturedPickerOpen] = useState(false);
  const [pendingFeaturedId, setPendingFeaturedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const savedCovers = useMemo(() => {
    if (settingsLoading) return {};
    return getSetting<Record<string, string>>("city_cover_images", {}) || {};
  }, [getSetting, settingsLoading]);

  const savedFeaturedId = useMemo(() => {
    if (settingsLoading) return "";
    return getSetting<string>("featured_property_id", "") || "";
  }, [getSetting, settingsLoading]);

  const effectiveFeaturedId = pendingFeaturedId ?? savedFeaturedId;
  const effectiveCovers = useMemo(
    () => ({ ...savedCovers, ...selections }),
    [savedCovers, selections]
  );

  // Cities/photos come from the properties the public booking page shows
  // (available + coming_soon). The featured picker is stricter — see below.
  const { data: queryResult, isLoading } = useQuery({
    queryKey: ["booking-page-photos", orgId],
    queryFn: async () => {
      if (!orgId) return { cities: [], properties: [] };
      const { data, error } = await supabase
        .from("properties")
        .select("id, address, unit_number, city, state, status, photos, bedrooms, bathrooms, rent_price, section_8_accepted")
        .eq("organization_id", orgId)
        .in("status", ["available", "coming_soon"])
        .order("city");
      if (error) throw error;

      const cityMap = new Map<
        string,
        { count: number; photos: { url: string; address: string; propertyId: string }[]; seen: Set<string> }
      >();

      for (const p of data || []) {
        const city = p.city || "Other";
        if (!cityMap.has(city)) cityMap.set(city, { count: 0, photos: [], seen: new Set() });
        const group = cityMap.get(city)!;
        group.count += 1;

        const photos = p.photos as unknown as (string | { url?: string })[] | null;
        if (Array.isArray(photos)) {
          for (const photo of photos) {
            const url = typeof photo === "string" ? photo : photo?.url;
            if (url && !group.seen.has(url)) {
              group.seen.add(url);
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
  // The public page only renders the featured card when the property is
  // 'available' — offering anything else here would be a silent no-op.
  const featurableProperties = useMemo(
    () => allProperties.filter((p) => p.status === "available"),
    [allProperties]
  );

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

  // ---- Autosave: every pick persists immediately (optimistic + revert) ----

  const saveFeatured = async (id: string) => {
    const prev = effectiveFeaturedId;
    setPendingFeaturedId(id);
    setFeaturedPickerOpen(false);
    setSaving(true);
    try {
      await updateSetting("featured_property_id", id as any, "showings");
      toast({
        title: "Saved",
        description: id
          ? "Featured property is live on the booking page."
          : "Featured property removed from the booking page.",
      });
    } catch (err) {
      setPendingFeaturedId(prev);
      console.error("Featured save failed:", err);
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const saveCover = async (city: string, url: string) => {
    const merged = { ...savedCovers, ...selections, [city]: url };
    setSelections((p) => ({ ...p, [city]: url }));
    setPickerCity(null);
    setSaving(true);
    try {
      await updateSetting("city_cover_images", merged as any, "showings");
      toast({ title: "Saved", description: `${city} cover is live on the booking page.` });
    } catch (err) {
      setSelections((p) => {
        const copy = { ...p };
        delete copy[city];
        return copy;
      });
      console.error("Cover save failed:", err);
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Featured Property */}
      <Card variant="glass" className="overflow-hidden">
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <Star className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Featured Property</h3>
                <p className="text-xs text-muted-foreground">
                  Highlighted at the top of the public booking page
                </p>
              </div>
            </div>
            {saving && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
              </span>
            )}
          </div>

          {isLoading || settingsLoading ? (
            <div className="px-5 pb-5">
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          ) : featuredProperty ? (
            <div className="relative">
              {/* Cover banner */}
              <div className="relative h-44 w-full overflow-hidden bg-gradient-to-br from-indigo-100 to-indigo-50">
                {getFirstPhoto(featuredProperty) ? (
                  <img
                    src={getFirstPhoto(featuredProperty)!}
                    alt={featuredProperty.address}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <Building2 className="h-8 w-8 text-indigo-300" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <Badge className="absolute top-3 left-3 bg-amber-500 text-white text-[10px] gap-1 shadow-sm">
                  <Star className="h-3 w-3" /> Featured
                </Badge>
                <div className="absolute top-3 right-3 flex gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs bg-white/90 hover:bg-white shadow-sm backdrop-blur-sm"
                    onClick={() => setFeaturedPickerOpen(true)}
                  >
                    Change
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs bg-white/90 hover:bg-white text-red-500 hover:text-red-600 shadow-sm backdrop-blur-sm"
                    onClick={() => saveFeatured("")}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <p className="text-white font-bold text-lg leading-tight drop-shadow-sm">
                    {featuredProperty.address}
                    {featuredProperty.unit_number ? ` #${featuredProperty.unit_number}` : ""}
                  </p>
                  <div className="flex items-center gap-3 text-white/85 text-xs mt-1">
                    {featuredProperty.rent_price && (
                      <span className="font-semibold text-white">
                        ${featuredProperty.rent_price.toLocaleString()}/mo
                      </span>
                    )}
                    {featuredProperty.bedrooms && (
                      <span className="flex items-center gap-1">
                        <BedDouble className="h-3 w-3" /> {featuredProperty.bedrooms} bed
                      </span>
                    )}
                    {featuredProperty.bathrooms && (
                      <span className="flex items-center gap-1">
                        <Bath className="h-3 w-3" /> {featuredProperty.bathrooms} bath
                      </span>
                    )}
                    <span className="text-white/60">
                      {featuredProperty.city}
                      {featuredProperty.state ? `, ${featuredProperty.state}` : ""}
                    </span>
                  </div>
                </div>
              </div>
              {featuredProperty.status !== "available" && (
                <div className="flex items-center gap-2 px-5 py-2.5 bg-amber-50 border-t border-amber-200 text-amber-700 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  This property is {featuredProperty.status?.replace(/_/g, " ")} — it won't appear
                  on the booking page until it's available again.
                </div>
              )}
            </div>
          ) : (
            <div className="px-5 pb-5">
              <Button
                variant="outline"
                className="w-full h-24 border-dashed text-muted-foreground gap-2 rounded-xl"
                onClick={() => setFeaturedPickerOpen(true)}
              >
                <Star className="h-4 w-4" />
                Choose a property to feature
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* City covers */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
          <Image className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h3 className="font-semibold text-sm">City Covers</h3>
          <p className="text-xs text-muted-foreground">
            Tap a city to change its cover image — every change saves instantly
          </p>
        </div>
      </div>

      {isLoading || settingsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2].map((i) => (
            <Card key={i} className="border-0 shadow-sm overflow-hidden">
              <Skeleton className="h-44 w-full" />
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
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <h4 className="text-white font-bold text-lg leading-tight drop-shadow-sm">
                    {g.city}
                  </h4>
                  <p className="text-white/70 text-xs mt-0.5">
                    {g.propertyCount} {g.propertyCount === 1 ? "property" : "properties"} &middot;{" "}
                    {g.photos.length} photo{g.photos.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="absolute top-3 right-3">
                  <Badge className="bg-white/90 text-slate-700 text-[10px] shadow-sm backdrop-blur-sm">
                    <Image className="h-3 w-3 mr-1" />
                    Change Cover
                  </Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Featured property picker */}
      <Dialog open={featuredPickerOpen} onOpenChange={setFeaturedPickerOpen}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />
              Choose Featured Property
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {featurableProperties.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                No available properties to feature.
              </p>
            )}
            {featurableProperties.map((p) => {
              const photo = getFirstPhoto(p);
              const isSelected = p.id === effectiveFeaturedId;
              return (
                <button
                  key={p.id}
                  onClick={() => saveFeatured(p.id)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                    isSelected
                      ? "border-amber-400 bg-amber-50 ring-1 ring-amber-200"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  <div className="h-12 w-[72px] rounded-lg overflow-hidden shrink-0 bg-slate-100">
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
                      {p.address}
                      {p.unit_number ? ` #${p.unit_number}` : ""}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                      {p.rent_price && (
                        <span className="font-medium text-slate-700">
                          ${p.rent_price.toLocaleString()}/mo
                        </span>
                      )}
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

      {/* City photo picker */}
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
                    onClick={() => saveCover(pickerGroup.city, photo.url)}
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
                      loading="lazy"
                      className="w-full h-32 object-cover"
                    />
                    {isSelected && (
                      <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-indigo-500 flex items-center justify-center shadow-sm">
                        <Check className="h-3.5 w-3.5 text-white" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 backdrop-blur-sm px-2 py-1.5">
                      <p className="text-white text-[10px] font-medium truncate">{photo.address}</p>
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
