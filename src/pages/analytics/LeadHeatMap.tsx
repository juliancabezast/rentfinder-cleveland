import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MapPin,
  Flame,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  Loader2,
  Users,
  Map as MapIcon,
  Building2,
  Star,
  CalendarCheck,
  Activity,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { CITY_CONFIGS, type CityKey } from "@/components/analytics/ClevelandHeatGrid";
import { LeadHeatMapView } from "@/components/analytics/LeadHeatMapView";
import { fetchAllTagPairs, type TagPair } from "@/lib/leadTags";
import { cn } from "@/lib/utils";

interface Lead {
  id: string;
  interested_zip_codes: string[] | null;
  budget_min: number | null;
  budget_max: number | null;
  has_voucher: boolean | null;
  status: string;
  voucher_amount: number | null;
  created_at: string;
}

interface Property {
  id: string;
  address: string;
  zip_code: string;
  status: string;
  rent_price: number | null;
}

interface Showing {
  id: string;
  property_id: string | null;
  status: string;
  prospect_interest_level: string | null;
}

interface ZipStats {
  leadCount: number;
  avgBudget: number;
  voucherPercent: number;
  conversionRate: number;
  topProperties: Array<{ id: string; address: string; count: number }>;
}

const ORG_TZ = "America/New_York";

export const LeadHeatMap: React.FC = () => {
  const { userRecord } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [showings, setShowings] = useState<Showing[]>([]);
  const [tagPairs, setTagPairs] = useState<TagPair[]>([]);
  const [selectedCity, setSelectedCity] = useState<CityKey>("cleveland");
  // "all" = every lead since the beginning (default); otherwise "YYYY-MM" in org timezone
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  const cityConfig = CITY_CONFIGS[selectedCity];

  useEffect(() => {
    fetchData();
  }, [userRecord?.organization_id]);

  const fetchData = async () => {
    if (!userRecord?.organization_id) return;

    setLoading(true);
    try {
      // Fetch ALL leads, paginating past the PostgREST 1000-row cap.
      const fetchAllLeads = async (): Promise<Lead[]> => {
        const out: Lead[] = [];
        const PAGE = 1000;
        for (let from = 0; from < 100000; from += PAGE) {
          const { data, error } = await supabase
            .from("leads")
            .select(
              "id, interested_zip_codes, budget_min, budget_max, has_voucher, status, voucher_amount, created_at"
            )
            .eq("organization_id", userRecord.organization_id)
            .eq("is_demo", false)
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1);
          if (error) throw error;
          out.push(...((data as Lead[]) || []));
          if ((data || []).length < PAGE) break;
        }
        return out;
      };

      // Showings are low-volume, but paginate the same way to stay cap-proof.
      const fetchAllShowings = async (): Promise<Showing[]> => {
        const out: Showing[] = [];
        const PAGE = 1000;
        for (let from = 0; from < 100000; from += PAGE) {
          const { data, error } = await supabase
            .from("showings")
            .select("id, property_id, status, prospect_interest_level")
            .eq("organization_id", userRecord.organization_id)
            .eq("is_demo", false)
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1);
          if (error) throw error;
          out.push(...((data as Showing[]) || []));
          if ((data || []).length < PAGE) break;
        }
        return out;
      };

      const [allLeads, allShowings, allTagPairs, propertiesRes] = await Promise.all([
        fetchAllLeads(),
        fetchAllShowings(),
        fetchAllTagPairs(userRecord.organization_id),
        supabase
          .from("properties")
          .select("id, address, zip_code, status, rent_price")
          .eq("organization_id", userRecord.organization_id)
          .limit(500),
      ]);

      if (propertiesRes.error) throw propertiesRes.error;
      setLeads(allLeads);
      setShowings(allShowings);
      setTagPairs(allTagPairs);
      setProperties(propertiesRes.data || []);
    } catch (error) {
      console.error("Error fetching heat map data:", error);
      toast({
        title: "Error loading heat map",
        description: "Could not load lead data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Month bucketing in org timezone (DST-safe via Intl)
  const monthKeyFmt = useMemo(
    () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: ORG_TZ,
        year: "numeric",
        month: "2-digit",
      }),
    []
  );
  const monthKey = useCallback(
    (iso: string) => monthKeyFmt.format(new Date(iso)), // "YYYY-MM"
    [monthKeyFmt]
  );

  const monthOptions = useMemo(() => {
    const keys = new Set<string>();
    leads.forEach((l) => keys.add(monthKey(l.created_at)));
    return Array.from(keys)
      .sort()
      .reverse()
      .map((key) => {
        const [y, m] = key.split("-").map(Number);
        return {
          value: key,
          label: new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }),
        };
      });
  }, [leads, monthKey]);

  const filteredLeads = useMemo(
    () =>
      selectedMonth === "all"
        ? leads
        : leads.filter((l) => monthKey(l.created_at) === selectedMonth),
    [leads, selectedMonth, monthKey]
  );

  // Build property zip lookup
  const propertyZipMap = useMemo(() => {
    const map: Record<string, string> = {};
    properties.forEach((p) => {
      map[p.id] = p.zip_code;
    });
    return map;
  }, [properties]);

  // Property-interest tags per lead (from lead_property_interests)
  const tagsByLead = useMemo(() => {
    const map = new Map<string, string[]>();
    tagPairs.forEach((p) => {
      const list = map.get(p.lead_id) || [];
      list.push(p.property_id);
      map.set(p.lead_id, list);
    });
    return map;
  }, [tagPairs]);

  // Every zip a lead is interested in (explicit zips + the zips of ALL tagged properties)
  const zipsForLead = useCallback(
    (lead: Lead): string[] => {
      const zips = new Set<string>();
      if (lead.interested_zip_codes) {
        lead.interested_zip_codes.forEach((z) => zips.add(z));
      }
      for (const propId of tagsByLead.get(lead.id) || []) {
        if (propertyZipMap[propId]) zips.add(propertyZipMap[propId]);
      }
      return Array.from(zips);
    },
    [propertyZipMap, tagsByLead]
  );

  // Calculate stats for each zip code
  const zipStats = useMemo(() => {
    const stats: Record<string, ZipStats> = {};
    const zipLeadMap: Record<string, Lead[]> = {};
    const zipPropertyCount: Record<string, Record<string, number>> = {};

    filteredLeads.forEach((lead) => {
      const zips = zipsForLead(lead);

      zips.forEach((zip) => {
        if (!zipLeadMap[zip]) zipLeadMap[zip] = [];
        zipLeadMap[zip].push(lead);
        for (const propId of tagsByLead.get(lead.id) || []) {
          if (!zipPropertyCount[zip]) zipPropertyCount[zip] = {};
          zipPropertyCount[zip][propId] = (zipPropertyCount[zip][propId] || 0) + 1;
        }
      });
    });

    Object.entries(zipLeadMap).forEach(([zip, zipLeads]) => {
      const budgets = zipLeads
        .filter((l) => l.budget_min || l.budget_max)
        .map((l) => ((l.budget_min ?? 0) + (l.budget_max ?? l.budget_min ?? 0)) / 2);
      const avgBudget =
        budgets.length > 0 ? Math.round(budgets.reduce((a, b) => a + b, 0) / budgets.length) : 0;
      const voucherCount = zipLeads.filter((l) => l.has_voucher).length;
      const voucherPercent = Math.round((voucherCount / zipLeads.length) * 100);
      const convertedCount = zipLeads.filter((l) => l.status === "converted").length;
      const conversionRate = Math.round((convertedCount / zipLeads.length) * 100);

      const propCounts = zipPropertyCount[zip] || {};
      const topProperties = Object.entries(propCounts)
        .map(([id, count]) => {
          const prop = properties.find((p) => p.id === id);
          return { id, address: prop?.address || "Unknown", count };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      stats[zip] = { leadCount: zipLeads.length, avgBudget, voucherPercent, conversionRate, topProperties };
    });

    return stats;
  }, [filteredLeads, zipsForLead, tagsByLead, properties]);

  // Leads the map cannot place: no zip/property link, or in areas outside the mapped cities
  const coverage = useMemo(() => {
    const mappedZips = new Set(
      Object.values(CITY_CONFIGS).flatMap((c) => c.zips.map((z) => z.zip))
    );
    let noLocation = 0;
    let otherAreas = 0;
    filteredLeads.forEach((lead) => {
      const zips = zipsForLead(lead);
      if (zips.length === 0) noLocation++;
      else if (!zips.some((z) => mappedZips.has(z))) otherAreas++;
    });
    return { noLocation, otherAreas };
  }, [filteredLeads, zipsForLead]);

  // Per-zip completed-showing outcomes (all-time — showings are few but high-signal)
  const showingStatsByZip = useMemo(() => {
    const m: Record<string, { completed: number; high: number }> = {};
    showings.forEach((s) => {
      if (s.status !== "completed") return;
      const zip = s.property_id ? propertyZipMap[s.property_id] : undefined;
      if (!zip) return;
      if (!m[zip]) m[zip] = { completed: 0, high: 0 };
      m[zip].completed++;
      if (s.prospect_interest_level === "high") m[zip].high++;
    });
    return m;
  }, [showings, propertyZipMap]);

  // Average portfolio rent per zip
  const rentByZip = useMemo(() => {
    const m: Record<string, { sum: number; n: number }> = {};
    properties.forEach((p) => {
      if (!p.zip_code || !p.rent_price || p.rent_price <= 0) return;
      if (!m[p.zip_code]) m[p.zip_code] = { sum: 0, n: 0 };
      m[p.zip_code].sum += p.rent_price;
      m[p.zip_code].n++;
    });
    return m;
  }, [properties]);

  // Insights filtered to selected city's zips
  const insights = useMemo(() => {
    const cityZipSet = new Set(cityConfig.zips.map((z) => z.zip));

    const cityStats = Object.entries(zipStats).filter(([zip]) => cityZipSet.has(zip));
    const sortedByCount = cityStats.sort((a, b) => b[1].leadCount - a[1].leadCount);
    const hottest = sortedByCount.filter(([_, s]) => s.leadCount > 0).slice(0, 5);

    const availablePropertyZips = new Set(
      properties.filter((p) => p.status === "available").map((p) => p.zip_code)
    );
    const underserved = sortedByCount
      .filter(([zip, s]) => !availablePropertyZips.has(zip) && s.leadCount > 0)
      .slice(0, 5);

    // Avg rent by area (portfolio inventory, month-independent)
    const avgRent = Object.entries(rentByZip)
      .filter(([zip]) => cityZipSet.has(zip))
      .map(([zip, { sum, n }]) => ({ zip, avg: Math.round(sum / n), n }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);

    // Trending: rolling last 30 days vs previous 30 (now-anchored, ignores month filter)
    const nowMs = Date.now();
    const d30 = nowMs - 30 * 86400000;
    const d60 = nowMs - 60 * 86400000;
    const trendCounts: Record<string, { last: number; prev: number }> = {};
    leads.forEach((lead) => {
      const t = new Date(lead.created_at).getTime();
      if (t < d60) return;
      zipsForLead(lead).forEach((zip) => {
        if (!cityZipSet.has(zip)) return;
        if (!trendCounts[zip]) trendCounts[zip] = { last: 0, prev: 0 };
        if (t >= d30) trendCounts[zip].last++;
        else trendCounts[zip].prev++;
      });
    });
    const trending = Object.entries(trendCounts)
      .filter(([, c]) => c.last >= 5 && c.last > c.prev)
      .map(([zip, c]) => ({
        zip,
        last: c.last,
        prev: c.prev,
        pct: c.prev > 0 ? Math.round(((c.last - c.prev) / c.prev) * 100) : null,
      }))
      .sort((a, b) => (b.pct ?? 9999) - (a.pct ?? 9999))
      .slice(0, 5);

    // High prospect interest after completed showings (min 3 to avoid tiny-sample noise)
    const highInterest = Object.entries(showingStatsByZip)
      .filter(([zip, s]) => cityZipSet.has(zip) && s.completed >= 3 && s.high > 0)
      .map(([zip, s]) => ({
        zip,
        pct: Math.round((100 * s.high) / s.completed),
        high: s.high,
        completed: s.completed,
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);

    // Leads that reached showing stage or beyond (respects the month filter)
    const DEEP_STATUSES = new Set(["showing_scheduled", "showed", "in_application", "converted"]);
    const deepCounts: Record<string, number> = {};
    filteredLeads.forEach((lead) => {
      if (!DEEP_STATUSES.has(lead.status)) return;
      zipsForLead(lead).forEach((zip) => {
        if (cityZipSet.has(zip)) deepCounts[zip] = (deepCounts[zip] || 0) + 1;
      });
    });
    const advancing = Object.entries(deepCounts)
      .map(([zip, count]) => ({ zip, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Fresh demand: new leads in the last 7 days (now-anchored, ignores month filter)
    const d7 = nowMs - 7 * 86400000;
    const freshCounts: Record<string, number> = {};
    leads.forEach((lead) => {
      if (new Date(lead.created_at).getTime() < d7) return;
      zipsForLead(lead).forEach((zip) => {
        if (cityZipSet.has(zip)) freshCounts[zip] = (freshCounts[zip] || 0) + 1;
      });
    });
    const fresh = Object.entries(freshCounts)
      .map(([zip, count]) => ({ zip, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return { hottest, underserved, avgRent, trending, highInterest, advancing, fresh };
  }, [
    zipStats,
    properties,
    cityConfig,
    leads,
    filteredLeads,
    zipsForLead,
    showingStatsByZip,
    rentByZip,
  ]);

  // Summary stats
  const summaryStats = useMemo(() => {
    const cityZipSet = new Set(cityConfig.zips.map((z) => z.zip));
    const cityEntries = Object.entries(zipStats).filter(([zip]) => cityZipSet.has(zip));
    // Unique leads in this city (a lead interested in several zips counts once)
    const totalLeads = filteredLeads.filter((lead) =>
      zipsForLead(lead).some((z) => cityZipSet.has(z))
    ).length;
    const activeZips = cityEntries.filter(([_, s]) => s.leadCount > 0).length;
    const rentProps = properties.filter(
      (p) => cityZipSet.has(p.zip_code) && (p.rent_price ?? 0) > 0
    );
    const avgRentAll =
      rentProps.length > 0
        ? Math.round(rentProps.reduce((sum, p) => sum + (p.rent_price || 0), 0) / rentProps.length)
        : 0;
    const totalProps = properties.filter(
      (p) => p.status === "available" && cityZipSet.has(p.zip_code)
    ).length;
    return { totalLeads, activeZips, avgRentAll, totalProps };
  }, [zipStats, cityConfig, properties, filteredLeads, zipsForLead]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#4F46E5] mx-auto" />
          <p className="text-sm text-muted-foreground">Loading heat map data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[#4F46E5] flex items-center justify-center">
              <MapPin className="h-5 w-5 text-[#ffb22c]" />
            </div>
            Lead Demand Heat Map
          </h1>
          <p className="text-muted-foreground mt-1">
            See where prospects are searching across {cityConfig.label}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={selectedCity} onValueChange={(v) => setSelectedCity(v as CityKey)}>
            <SelectTrigger className="w-full sm:w-[180px] min-h-[44px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CITY_CONFIGS).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>
                  {cfg.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-full sm:w-[190px] min-h-[44px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              {monthOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Quick stat bubbles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card variant="glass" className="p-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-purple-600">{summaryStats.totalLeads}</p>
              <p className="text-[11px] text-muted-foreground">Total Leads</p>
            </div>
          </div>
        </Card>
        <Card variant="glass" className="p-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#4F46E5]/10 flex items-center justify-center shrink-0">
              <MapIcon className="h-5 w-5 text-[#4F46E5]" />
            </div>
            <div>
              <p className="text-xl font-bold text-[#4F46E5]">
                {summaryStats.activeZips}/{cityConfig.zips.length}
              </p>
              <p className="text-[11px] text-muted-foreground">Active Zips</p>
            </div>
          </div>
        </Card>
        <Card variant="glass" className="p-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
              <DollarSign className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-green-600">
                {summaryStats.avgRentAll > 0
                  ? `$${summaryStats.avgRentAll.toLocaleString()}`
                  : "N/A"}
              </p>
              <p className="text-[11px] text-muted-foreground">Avg Rent</p>
            </div>
          </div>
        </Card>
        <Card variant="glass" className="p-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-amber-600">{summaryStats.totalProps}</p>
              <p className="text-[11px] text-muted-foreground">Available Properties</p>
            </div>
          </div>
        </Card>
      </div>

      {(coverage.noLocation > 0 || coverage.otherAreas > 0) && (
        <p className="text-xs text-muted-foreground -mt-2">
          Not shown on the map: {coverage.noLocation} lead{coverage.noLocation !== 1 ? "s" : ""} without
          a linked property or zip
          {coverage.otherAreas > 0 &&
            ` · ${coverage.otherAreas} in areas outside ${Object.values(CITY_CONFIGS)
              .map((c) => c.label.split(",")[0])
              .join("/")}`}
          .
        </p>
      )}

      {/* Map + Insights grid */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Interactive Map */}
        <div className="lg:col-span-2">
          <Card variant="glass" className="overflow-hidden">
            <CardHeader className="pb-0 pt-4 px-4">
              <CardTitle className="text-base flex items-center gap-2">
                <MapIcon className="h-4 w-4 text-[#4F46E5]" />
                {cityConfig.label} — Zip Code Demand
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-3">
              <LeadHeatMapView
                city={selectedCity}
                zipStats={zipStats}
                properties={properties}
                zips={cityConfig.zips}
              />
            </CardContent>
          </Card>
        </div>

        {/* Insights Panel */}
        <div className="space-y-4">
          {/* Hottest Zips */}
          <Card variant="glass" className="border-l-4 border-l-orange-400">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" />
                Hottest Zip Codes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 pb-4">
              {insights.hottest.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data yet</p>
              ) : (
                insights.hottest.map(([zip, stats], i) => (
                  <div key={zip} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-xs font-bold w-5 text-center",
                        i === 0 ? "text-orange-500" : "text-muted-foreground"
                      )}>
                        {i + 1}
                      </span>
                      <Badge variant="outline" className="font-mono text-xs">
                        {zip}
                      </Badge>
                    </div>
                    <span className="font-semibold">{stats.leadCount} leads</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Trending Areas */}
          <Card variant="glass" className="border-l-4 border-l-green-400">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                Trending Areas
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                New leads: last 30 days vs. previous 30
              </p>
            </CardHeader>
            <CardContent className="space-y-2.5 pb-4">
              {insights.trending.length === 0 ? (
                <p className="text-sm text-muted-foreground">Demand holding steady</p>
              ) : (
                insights.trending.map((t) => (
                  <div key={t.zip} className="flex items-center justify-between text-sm">
                    <Badge variant="outline" className="font-mono text-xs">
                      {t.zip}
                    </Badge>
                    <span className="text-green-600 font-semibold">
                      {t.pct != null ? `+${t.pct}%` : "NEW"}
                      <span className="text-muted-foreground font-normal ml-1.5 text-xs">
                        ({t.last} vs {t.prev})
                      </span>
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* High Interest After Showing */}
          <Card variant="glass" className="border-l-4 border-l-violet-400">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Star className="h-4 w-4 text-violet-500" />
                High Interest After Showing
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Completed showings where the prospect left highly interested
              </p>
            </CardHeader>
            <CardContent className="space-y-2.5 pb-4">
              {insights.highInterest.length === 0 ? (
                <p className="text-sm text-muted-foreground">Need more completed showings</p>
              ) : (
                insights.highInterest.map((h) => (
                  <div key={h.zip} className="flex items-center justify-between text-sm">
                    <Badge variant="outline" className="font-mono text-xs">
                      {h.zip}
                    </Badge>
                    <span className="text-violet-600 font-semibold">
                      {h.pct}%
                      <span className="text-muted-foreground font-normal ml-1.5 text-xs">
                        ({h.high}/{h.completed})
                      </span>
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Underserved Areas */}
          <Card variant="glass" className="border-l-4 border-l-amber-400">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Underserved Areas
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                High demand, no available properties
              </p>
            </CardHeader>
            <CardContent className="space-y-2.5 pb-4">
              {insights.underserved.length === 0 ? (
                <p className="text-sm text-muted-foreground">All demand areas have listings!</p>
              ) : (
                insights.underserved.map(([zip, stats]) => (
                  <div key={zip} className="flex items-center justify-between text-sm">
                    <Badge variant="outline" className="font-mono text-xs">
                      {zip}
                    </Badge>
                    <span className="text-amber-600 font-medium">
                      {stats.leadCount} leads waiting
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Secondary insight row */}
      <div className="grid gap-5 md:grid-cols-3">
        {/* Avg Rent by Area */}
        <Card variant="glass" className="border-l-4 border-l-blue-400">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-blue-500" />
              Avg Rent by Area
            </CardTitle>
            <p className="text-xs text-muted-foreground">Portfolio average rent per zip</p>
          </CardHeader>
          <CardContent className="space-y-2.5 pb-4">
            {insights.avgRent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rent data</p>
            ) : (
              insights.avgRent.map((r) => (
                <div key={r.zip} className="flex items-center justify-between text-sm">
                  <Badge variant="outline" className="font-mono text-xs">
                    {r.zip}
                  </Badge>
                  <span className="font-semibold">
                    ${r.avg.toLocaleString()}
                    <span className="text-muted-foreground font-normal ml-1.5 text-xs">
                      ({r.n} {r.n === 1 ? "property" : "properties"})
                    </span>
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Advancing to Showings */}
        <Card variant="glass" className="border-l-4 border-l-indigo-400">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-indigo-500" />
              Advancing to Showings
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Leads that reached showing stage or beyond
            </p>
          </CardHeader>
          <CardContent className="space-y-2.5 pb-4">
            {insights.advancing.length === 0 ? (
              <p className="text-sm text-muted-foreground">No showing-stage leads yet</p>
            ) : (
              insights.advancing.map((a) => (
                <div key={a.zip} className="flex items-center justify-between text-sm">
                  <Badge variant="outline" className="font-mono text-xs">
                    {a.zip}
                  </Badge>
                  <span className="text-indigo-600 font-semibold">
                    {a.count} {a.count === 1 ? "lead" : "leads"}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Fresh Demand */}
        <Card variant="glass" className="border-l-4 border-l-rose-400">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-rose-500" />
              Fresh Demand
            </CardTitle>
            <p className="text-xs text-muted-foreground">New leads in the last 7 days</p>
          </CardHeader>
          <CardContent className="space-y-2.5 pb-4">
            {insights.fresh.length === 0 ? (
              <p className="text-sm text-muted-foreground">No new leads this week</p>
            ) : (
              insights.fresh.map((f) => (
                <div key={f.zip} className="flex items-center justify-between text-sm">
                  <Badge variant="outline" className="font-mono text-xs">
                    {f.zip}
                  </Badge>
                  <span className="text-rose-600 font-semibold">
                    {f.count} {f.count === 1 ? "new lead" : "new leads"}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LeadHeatMap;
