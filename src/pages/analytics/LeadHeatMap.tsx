import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-range-picker";
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
  Map,
  Building2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CITY_CONFIGS, type CityKey } from "@/components/analytics/ClevelandHeatGrid";
import { LeadHeatMapView } from "@/components/analytics/LeadHeatMapView";
import { subDays, format, startOfDay, endOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";

interface Lead {
  id: string;
  interested_zip_codes: string[] | null;
  interested_property_id: string | null;
  budget_min: number | null;
  budget_max: number | null;
  has_voucher: boolean | null;
  status: string;
  voucher_amount: number | null;
}

interface Property {
  id: string;
  address: string;
  zip_code: string;
  status: string;
}

interface ZipStats {
  leadCount: number;
  avgBudget: number;
  voucherPercent: number;
  conversionRate: number;
  topProperties: Array<{ id: string; address: string; count: number }>;
}

export const LeadHeatMap: React.FC = () => {
  const { userRecord } = useAuth();
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedCity, setSelectedCity] = useState<CityKey>("cleveland");
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 90),
    to: new Date(),
  });

  const cityConfig = CITY_CONFIGS[selectedCity];

  useEffect(() => {
    fetchData();
  }, [userRecord?.organization_id, dateRange]);

  const fetchData = async () => {
    if (!userRecord?.organization_id) return;

    setLoading(true);
    try {
      const startDate = dateRange.from
        ? format(startOfDay(dateRange.from), "yyyy-MM-dd'T'HH:mm:ss")
        : null;
      const endDate = dateRange.to
        ? format(endOfDay(dateRange.to), "yyyy-MM-dd'T'HH:mm:ss")
        : null;

      if (!startDate || !endDate) {
        setLoading(false);
        return;
      }

      const [leadsRes, propertiesRes] = await Promise.all([
        supabase
          .from("leads")
          .select(
            "id, interested_zip_codes, interested_property_id, budget_min, budget_max, has_voucher, status, voucher_amount"
          )
          .eq("organization_id", userRecord.organization_id)
          .gte("created_at", startDate)
          .lte("created_at", endDate)
          .limit(2000),
        supabase
          .from("properties")
          .select("id, address, zip_code, status")
          .eq("organization_id", userRecord.organization_id)
          .limit(500),
      ]);

      if (leadsRes.error) throw leadsRes.error;
      if (propertiesRes.error) throw propertiesRes.error;
      setLeads(leadsRes.data || []);
      setProperties(propertiesRes.data || []);
    } catch (error) {
      console.error("Error fetching heat map data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Build property zip lookup
  const propertyZipMap = useMemo(() => {
    const map: Record<string, string> = {};
    properties.forEach((p) => {
      map[p.id] = p.zip_code;
    });
    return map;
  }, [properties]);

  // Calculate stats for each zip code
  const zipStats = useMemo(() => {
    const stats: Record<string, ZipStats> = {};
    const zipLeadMap: Record<string, Lead[]> = {};
    const zipPropertyCount: Record<string, Record<string, number>> = {};

    leads.forEach((lead) => {
      const zips = new Set<string>();
      if (lead.interested_zip_codes) {
        lead.interested_zip_codes.forEach((z) => zips.add(z));
      }
      if (lead.interested_property_id && propertyZipMap[lead.interested_property_id]) {
        zips.add(propertyZipMap[lead.interested_property_id]);
      }

      zips.forEach((zip) => {
        if (!zipLeadMap[zip]) zipLeadMap[zip] = [];
        zipLeadMap[zip].push(lead);
        if (lead.interested_property_id) {
          if (!zipPropertyCount[zip]) zipPropertyCount[zip] = {};
          const propId = lead.interested_property_id;
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
  }, [leads, propertyZipMap, properties]);

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

    const bestConverting = cityStats
      .filter(([_, s]) => s.leadCount >= 3)
      .sort((a, b) => b[1].conversionRate - a[1].conversionRate)
      .slice(0, 5);

    const highestVoucher = cityStats
      .filter(([_, s]) => s.avgBudget > 0)
      .sort((a, b) => b[1].avgBudget - a[1].avgBudget)
      .slice(0, 5);

    return { hottest, underserved, bestConverting, highestVoucher };
  }, [zipStats, properties, cityConfig]);

  // Summary stats
  const summaryStats = useMemo(() => {
    const cityZipSet = new Set(cityConfig.zips.map((z) => z.zip));
    const cityEntries = Object.entries(zipStats).filter(([zip]) => cityZipSet.has(zip));
    const totalLeads = cityEntries.reduce((sum, [_, s]) => sum + s.leadCount, 0);
    const activeZips = cityEntries.filter(([_, s]) => s.leadCount > 0).length;
    const avgBudgetAll =
      cityEntries.filter(([_, s]) => s.avgBudget > 0).length > 0
        ? Math.round(
            cityEntries
              .filter(([_, s]) => s.avgBudget > 0)
              .reduce((sum, [_, s]) => sum + s.avgBudget, 0) /
              cityEntries.filter(([_, s]) => s.avgBudget > 0).length
          )
        : 0;
    const totalProps = properties.filter((p) => p.status === "available").length;
    return { totalLeads, activeZips, avgBudgetAll, totalProps };
  }, [zipStats, cityConfig, properties]);

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
          <DateRangePicker
            date={dateRange}
            onDateChange={(range) => range && setDateRange(range)}
          />
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
              <Map className="h-5 w-5 text-[#4F46E5]" />
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
                {summaryStats.avgBudgetAll > 0 ? `$${summaryStats.avgBudgetAll}` : "N/A"}
              </p>
              <p className="text-[11px] text-muted-foreground">Avg Budget</p>
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

      {/* Map + Insights grid */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Interactive Map */}
        <div className="lg:col-span-2">
          <Card variant="glass" className="overflow-hidden">
            <CardHeader className="pb-0 pt-4 px-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Map className="h-4 w-4 text-[#4F46E5]" />
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

          {/* Best Converting */}
          <Card variant="glass" className="border-l-4 border-l-green-400">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                Best Converting
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 pb-4">
              {insights.bestConverting.length === 0 ? (
                <p className="text-sm text-muted-foreground">Need more data</p>
              ) : (
                insights.bestConverting.map(([zip, stats]) => (
                  <div key={zip} className="flex items-center justify-between text-sm">
                    <Badge variant="outline" className="font-mono text-xs">
                      {zip}
                    </Badge>
                    <span className="text-green-600 font-semibold">
                      {stats.conversionRate}% conversion
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Highest Budgets */}
          <Card variant="glass" className="border-l-4 border-l-blue-400">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-blue-500" />
                Avg Budget by Area
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 pb-4">
              {insights.highestVoucher.length === 0 ? (
                <p className="text-sm text-muted-foreground">No budget data</p>
              ) : (
                insights.highestVoucher.map(([zip, stats]) => (
                  <div key={zip} className="flex items-center justify-between text-sm">
                    <Badge variant="outline" className="font-mono text-xs">
                      {zip}
                    </Badge>
                    <span className="font-semibold">${stats.avgBudget.toLocaleString()}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default LeadHeatMap;
