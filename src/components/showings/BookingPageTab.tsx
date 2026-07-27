import React, { useState, useMemo, useEffect } from "react";
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
  Plus,
  RefreshCw,
  ExternalLink,
  Smartphone,
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
  const { getSetting, updateSetting, updateMultipleSettings, loading: settingsLoading } = useOrganizationSettings();
  const { toast } = useToast();
  const orgId = userRecord?.organization_id;

  const MAX_FEATURED = 4;

  const [pickerCity, setPickerCity] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [featuredPickerOpen, setFeaturedPickerOpen] = useState(false);
  const [pendingFeaturedIds, setPendingFeaturedIds] = useState<string[] | null>(null);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [previewNonce, setPreviewNonce] = useState(0); // bump to reload the preview iframe
  const [saving, setSaving] = useState(false);

  const savedCovers = useMemo(() => {
    if (settingsLoading) return {};
    return getSetting<Record<string, string>>("city_cover_images", {}) || {};
  }, [getSetting, settingsLoading]);

  // Featured is now up to 4 (rendered as a 5s carousel). Read the array; fall
  // back to the legacy single-featured id so nothing is lost on first load.
  const savedFeaturedIds = useMemo(() => {
    if (settingsLoading) return [] as string[];
    const arr = getSetting<string[]>("featured_property_ids", []) || [];
    if (arr.length) return arr;
    const legacy = getSetting<string>("featured_property_id", "") || "";
    return legacy ? [legacy] : [];
  }, [getSetting, settingsLoading]);

  const effectiveFeaturedIds = pendingFeaturedIds ?? savedFeaturedIds;
  const effectiveCovers = useMemo(
    () => ({ ...savedCovers, ...selections }),
    [savedCovers, selections]
  );

  // Fetch ALL properties (any status) so both the featured picker and the city
  // cover photo pool can use any property's photo — "el cover que yo quiera, sin
  // importar si está disponible o no". The city LIST is still limited to cities
  // that actually surface on the public page (they have available/coming_soon
  // listings), so a cover you set never silently no-ops.
  const { data: queryResult, isLoading } = useQuery({
    queryKey: ["booking-page-photos", orgId],
    queryFn: async () => {
      if (!orgId) return { cities: [], properties: [] };
      const { data, error } = await supabase
        .from("properties")
        .select("id, address, unit_number, city, state, status, photos, bedrooms, bathrooms, rent_price, section_8_accepted")
        .eq("organization_id", orgId)
        .order("city");
      if (error) throw error;

      const cityMap = new Map<
        string,
        { publicCount: number; photos: { url: string; address: string; propertyId: string }[]; seen: Set<string> }
      >();

      for (const p of data || []) {
        const city = p.city || "Other";
        if (!cityMap.has(city)) cityMap.set(city, { publicCount: 0, photos: [], seen: new Set() });
        const group = cityMap.get(city)!;
        // Count only publicly-visible listings — decides whether the city (and
        // thus a cover) shows on the booking page — but pool photos from ALL.
        if (p.status === "available" || p.status === "coming_soon") group.publicCount += 1;

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
        .filter(([, info]) => info.publicCount > 0)
        .map(([city, info]) => ({ city, propertyCount: info.publicCount, photos: info.photos }))
        .sort((a, b) => b.propertyCount - a.propertyCount);

      return { cities, properties: (data || []) as PropertyOption[] };
    },
    enabled: !!orgId,
  });

  const cityGroups = queryResult?.cities;
  const allProperties = queryResult?.properties || [];
  // You can feature ANY property regardless of showing availability; the public
  // carousel renders each and adapts its CTA (available → book, else a
  // "Próximamente" state). Available-first so the best choices top the picker.
  const featurableProperties = useMemo(
    () =>
      [...allProperties].sort(
        (a, b) => (a.status === "available" ? 0 : 1) - (b.status === "available" ? 0 : 1)
      ),
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

  // The chosen featured properties, in the admin's saved order.
  const featuredProperties = useMemo(
    () =>
      effectiveFeaturedIds
        .map((id) => allProperties.find((p) => p.id === id))
        .filter((p): p is PropertyOption => !!p),
    [allProperties, effectiveFeaturedIds]
  );

  // Rotate the featured preview every 5s (matches the public carousel).
  useEffect(() => {
    if (featuredProperties.length <= 1) {
      setCarouselIdx(0);
      return;
    }
    const t = setInterval(
      () => setCarouselIdx((i) => (i + 1) % featuredProperties.length),
      5000
    );
    return () => clearInterval(t);
  }, [featuredProperties.length]);

  const safeIdx = featuredProperties.length ? carouselIdx % featuredProperties.length : 0;
  const currentFeatured = featuredProperties[safeIdx] || null;

  function getFirstPhoto(p: PropertyOption): string | null {
    const photos = p.photos as unknown as (string | { url?: string })[] | null;
    if (!Array.isArray(photos) || photos.length === 0) return null;
    const first = photos[0];
    return typeof first === "string" ? first : first?.url || null;
  }

  const pickerGroup = enrichedGroups.find((g) => g.city === pickerCity);

  // ---- Autosave: every pick persists immediately (optimistic + revert) ----

  const persistFeatured = async (ids: string[]) => {
    const prev = effectiveFeaturedIds;
    setPendingFeaturedIds(ids);
    setSaving(true);
    try {
      // Write the array + keep the legacy single key = first id for anything
      // still reading featured_property_id.
      await updateMultipleSettings([
        { key: "featured_property_ids", value: ids as any, category: "showings" },
        { key: "featured_property_id", value: (ids[0] || "") as any, category: "showings" },
      ]);
      setPreviewNonce((n) => n + 1);
    } catch (err) {
      setPendingFeaturedIds(prev);
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

  const toggleFeatured = (id: string) => {
    const cur = effectiveFeaturedIds;
    if (cur.includes(id)) {
      persistFeatured(cur.filter((x) => x !== id));
    } else if (cur.length < MAX_FEATURED) {
      persistFeatured([...cur, id]);
    } else {
      toast({
        title: `Maximum ${MAX_FEATURED} properties`,
        description: "Remove one to add another.",
      });
    }
  };

  const removeFeatured = (id: string) =>
    persistFeatured(effectiveFeaturedIds.filter((x) => x !== id));

  const saveCover = async (city: string, url: string) => {
    const merged = { ...savedCovers, ...selections, [city]: url };
    setSelections((p) => ({ ...p, [city]: url }));
    setPickerCity(null);
    setSaving(true);
    try {
      await updateSetting("city_cover_images", merged as any, "showings");
      setPreviewNonce((n) => n + 1);
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
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)] gap-5 items-start">
        {/* LEFT — everything you can edit */}
        <div className="space-y-5 min-w-0">
      {/* Featured Property */}
      <Card variant="glass" className="overflow-hidden">
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <Star className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Featured Properties</h3>
                <p className="text-xs text-muted-foreground">
                  Up to 4 — they rotate every 5s at the top of the booking page
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {saving && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                </span>
              )}
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {effectiveFeaturedIds.length}/{MAX_FEATURED}
              </span>
            </div>
          </div>

          {isLoading || settingsLoading ? (
            <div className="px-5 pb-5">
              <Skeleton className="h-44 w-full rounded-xl" />
            </div>
          ) : currentFeatured ? (
            <div className="relative">
              {/* Rotating cover preview */}
              <div className="relative h-44 w-full overflow-hidden bg-gradient-to-br from-indigo-100 to-indigo-50">
                {getFirstPhoto(currentFeatured) ? (
                  <img
                    key={currentFeatured.id}
                    src={getFirstPhoto(currentFeatured)!}
                    alt={currentFeatured.address}
                    className="h-full w-full object-cover animate-in fade-in duration-500"
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
                <div className="absolute top-3 right-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs bg-white/90 hover:bg-white shadow-sm backdrop-blur-sm"
                    onClick={() => setFeaturedPickerOpen(true)}
                  >
                    Manage
                  </Button>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-4 pr-16">
                  <p className="text-white font-bold text-lg leading-tight drop-shadow-sm truncate">
                    {currentFeatured.address}
                    {currentFeatured.unit_number ? ` #${currentFeatured.unit_number}` : ""}
                  </p>
                  <div className="flex items-center gap-3 text-white/85 text-xs mt-1">
                    {currentFeatured.rent_price && (
                      <span className="font-semibold text-white">
                        ${currentFeatured.rent_price.toLocaleString()}/mo
                      </span>
                    )}
                    {currentFeatured.bedrooms && (
                      <span className="flex items-center gap-1">
                        <BedDouble className="h-3 w-3" /> {currentFeatured.bedrooms} bed
                      </span>
                    )}
                    {currentFeatured.bathrooms && (
                      <span className="flex items-center gap-1">
                        <Bath className="h-3 w-3" /> {currentFeatured.bathrooms} bath
                      </span>
                    )}
                    <span className="text-white/60">
                      {currentFeatured.city}
                      {currentFeatured.state ? `, ${currentFeatured.state}` : ""}
                    </span>
                  </div>
                </div>
              </div>

              {currentFeatured.status !== "available" && (
                <div className="flex items-center gap-2 px-5 py-2 bg-amber-50 border-t border-amber-200 text-amber-700 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {currentFeatured.status?.replace(/_/g, " ")} — shown as “Próximamente” (no booking button).
                </div>
              )}

              {/* Chosen set + add tile */}
              <div className="flex items-center gap-2 px-5 py-3 border-t bg-white/40 overflow-x-auto">
                {featuredProperties.map((p, i) => (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Preview ${p.address}`}
                    onClick={() => setCarouselIdx(i)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setCarouselIdx(i);
                      }
                    }}
                    className={cn(
                      "relative h-14 w-20 rounded-lg overflow-hidden shrink-0 border-2 group cursor-pointer",
                      i === safeIdx ? "border-amber-400" : "border-transparent hover:border-slate-300"
                    )}
                  >
                    {getFirstPhoto(p) ? (
                      <img src={getFirstPhoto(p)!} alt={p.address} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center bg-slate-100">
                        <Building2 className="h-4 w-4 text-slate-300" />
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFeatured(p.id);
                      }}
                      /* Always visible on touch (no hover) so a featured item
                         can't be removed with zero affordance; hover-reveal on
                         desktop keeps the thumbnail clean. */
                      className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/60 hover:bg-red-500 text-white flex items-center justify-center opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                      aria-label={`Remove ${p.address} from featured`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {effectiveFeaturedIds.length < MAX_FEATURED && (
                  <button
                    onClick={() => setFeaturedPickerOpen(true)}
                    className="h-14 w-20 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-amber-400 hover:text-amber-500 flex flex-col items-center justify-center shrink-0 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="text-[10px]">Add</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="px-5 pb-5">
              <Button
                variant="outline"
                className="w-full h-24 border-dashed text-muted-foreground gap-2 rounded-xl"
                onClick={() => setFeaturedPickerOpen(true)}
              >
                <Star className="h-4 w-4" />
                Choose properties to feature (up to 4)
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
        <div className="grid grid-cols-1 gap-4">
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
        <div className="grid grid-cols-1 gap-4">
          {enrichedGroups.map((g) => (
            <Card
              key={g.city}
              role="button"
              tabIndex={0}
              aria-label={`Change ${g.city} cover image`}
              className="border-0 shadow-sm overflow-hidden group cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setPickerCity(g.city)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setPickerCity(g.city);
                }
              }}
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
        </div>{/* /left column */}

        {/* RIGHT — live preview, sticky while you edit on the left */}
        <div className="lg:sticky lg:top-4">
          <Card variant="glass" className="overflow-hidden">
            <CardContent className="p-0">
              <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-9 w-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                    <Smartphone className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm">Live preview</h3>
                    <p className="text-xs text-muted-foreground truncate">This is how your public page looks right now</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={() => setPreviewNonce((n) => n + 1)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh
                  </Button>
                  <Button variant="secondary" size="sm" className="h-8 gap-1 text-xs" asChild>
                    <a href="/p/book-showing" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" /> Open
                    </a>
                  </Button>
                </div>
              </div>
              <div className="border-t bg-slate-100">
                <iframe
                  key={previewNonce}
                  src={`/p/book-showing?preview=${previewNonce}`}
                  title="Booking page preview"
                  className="w-full block bg-white h-[82vh] min-h-[560px]"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>{/* /two-column grid */}

      {/* Featured properties picker (multi-select, up to 4) */}
      <Dialog open={featuredPickerOpen} onOpenChange={setFeaturedPickerOpen}>
        <DialogContent className="max-w-lg max-h-[75vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />
              Feature properties ({effectiveFeaturedIds.length}/{MAX_FEATURED})
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            Pick up to {MAX_FEATURED}. They rotate every 5s at the top of the page. Any property can be featured — available or not.
          </p>
          <div className="space-y-2 pt-1">
            {featurableProperties.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                No properties to feature.
              </p>
            )}
            {featurableProperties.map((p) => {
              const photo = getFirstPhoto(p);
              const isSelected = effectiveFeaturedIds.includes(p.id);
              const atCap = !isSelected && effectiveFeaturedIds.length >= MAX_FEATURED;
              return (
                <button
                  key={p.id}
                  onClick={() => toggleFeatured(p.id)}
                  disabled={atCap}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                    isSelected
                      ? "border-amber-400 bg-amber-50 ring-1 ring-amber-200"
                      : atCap
                        ? "border-slate-200 opacity-50 cursor-not-allowed"
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
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-sm truncate">
                        {p.address}
                        {p.unit_number ? ` #${p.unit_number}` : ""}
                      </p>
                      {p.status !== "available" && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0 text-amber-600 border-amber-300">
                          {p.status?.replace(/_/g, " ")}
                        </Badge>
                      )}
                    </div>
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
                  <div
                    className={cn(
                      "h-6 w-6 rounded-full flex items-center justify-center shrink-0 border",
                      isSelected ? "bg-amber-500 border-amber-500" : "border-slate-300"
                    )}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                  </div>
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
