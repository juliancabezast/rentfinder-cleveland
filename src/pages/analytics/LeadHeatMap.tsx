import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Badge } from '@/components/ui/badge';
import { MapPin, Flame, TrendingUp, AlertTriangle, DollarSign, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ClevelandHeatGrid } from '@/components/analytics/ClevelandHeatGrid';
import { subDays, format, startOfDay, endOfDay } from 'date-fns';
import type { DateRange } from 'react-day-picker';

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
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 90),
    to: new Date(),
  });

  useEffect(() => {
    fetchData();
  }, [userRecord?.organization_id, dateRange]);

  const fetchData = async () => {
    if (!userRecord?.organization_id) return;

    setLoading(true);
    try {
      const startDate = dateRange.from ? format(startOfDay(dateRange.from), "yyyy-MM-dd'T'HH:mm:ss") : undefined;
      const endDate = dateRange.to ? format(endOfDay(dateRange.to), "yyyy-MM-dd'T'HH:mm:ss") : undefined;

      const [leadsRes, propertiesRes] = await Promise.all([
        supabase
          .from('leads')
          .select('id, interested_zip_codes, interested_property_id, budget_min, budget_max, has_voucher, status, voucher_amount')
          .eq('organization_id', userRecord.organization_id)
          .gte('created_at', startDate || '')
          .lte('created_at', endDate || '')
          .limit(2000),
        supabase
          .from('properties')
          .select('id, address, zip_code, status')
          .eq('organization_id', userRecord.organization_id)
          .limit(500),
      ]);

      if (leadsRes.data) setLeads(leadsRes.data);
      if (propertiesRes.data) setProperties(propertiesRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Build property zip lookup
  const propertyZipMap = useMemo(() => {
    const map: Record<string, string> = {};
    properties.forEach(p => {
      map[p.id] = p.zip_code;
    });
    return map;
  }, [properties]);

  // Calculate stats for each zip code
  const zipStats = useMemo(() => {
    const stats: Record<string, ZipStats> = {};
    const zipLeadMap: Record<string, Lead[]> = {};
    const zipPropertyCount: Record<string, Record<string, number>> = {};

    leads.forEach(lead => {
      const zips = new Set<string>();

      // Add interested zips
      if (lead.interested_zip_codes) {
        lead.interested_zip_codes.forEach(z => zips.add(z));
      }

      // Add property zip
      if (lead.interested_property_id && propertyZipMap[lead.interested_property_id]) {
        zips.add(propertyZipMap[lead.interested_property_id]);
      }

      zips.forEach(zip => {
        if (!zipLeadMap[zip]) zipLeadMap[zip] = [];
        zipLeadMap[zip].push(lead);

        // Track property interest
        if (lead.interested_property_id) {
          if (!zipPropertyCount[zip]) zipPropertyCount[zip] = {};
          const propId = lead.interested_property_id;
          zipPropertyCount[zip][propId] = (zipPropertyCount[zip][propId] || 0) + 1;
        }
      });
    });

    Object.entries(zipLeadMap).forEach(([zip, zipLeads]) => {
      const budgets = zipLeads
        .filter(l => l.budget_min || l.budget_max)
        .map(l => ((l.budget_min || 0) + (l.budget_max || l.budget_min || 0)) / 2);

      const avgBudget = budgets.length > 0 ? Math.round(budgets.reduce((a, b) => a + b, 0) / budgets.length) : 0;
      const voucherCount = zipLeads.filter(l => l.has_voucher).length;
      const voucherPercent = Math.round((voucherCount / zipLeads.length) * 100);
      const convertedCount = zipLeads.filter(l => l.status === 'converted').length;
      const conversionRate = Math.round((convertedCount / zipLeads.length) * 100);

      // Top properties
      const propCounts = zipPropertyCount[zip] || {};
      const topProperties = Object.entries(propCounts)
        .map(([id, count]) => {
          const prop = properties.find(p => p.id === id);
          return { id, address: prop?.address || 'Unknown', count };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      stats[zip] = {
        leadCount: zipLeads.length,
        avgBudget,
        voucherPercent,
        conversionRate,
        topProperties,
      };
    });

    return stats;
  }, [leads, propertyZipMap, properties]);

  // Calculate insights
  const insights = useMemo(() => {
    const sortedByCount = Object.entries(zipStats).sort((a, b) => b[1].leadCount - a[1].leadCount);
    const hottest = sortedByCount.slice(0, 5);

    // Find zips with leads but no properties
    const availablePropertyZips = new Set(
      properties.filter(p => p.status === 'available').map(p => p.zip_code)
    );
    const underserved = sortedByCount
      .filter(([zip]) => !availablePropertyZips.has(zip) && zipStats[zip].leadCount > 0)
      .slice(0, 5);

    // Best converting
    const sortedByConversion = Object.entries(zipStats)
      .filter(([_, s]) => s.leadCount >= 3) // Need at least 3 leads for meaningful rate
      .sort((a, b) => b[1].conversionRate - a[1].conversionRate)
      .slice(0, 5);

    // Highest voucher amounts
    const sortedByVoucher = Object.entries(zipStats)
      .filter(([_, s]) => s.avgBudget > 0)
      .sort((a, b) => b[1].avgBudget - a[1].avgBudget)
      .slice(0, 5);

    return { hottest, underserved, bestConverting: sortedByConversion, highestVoucher: sortedByVoucher };
  }, [zipStats, properties]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MapPin className="h-6 w-6" />
            Lead Demand Heat Map
          </h1>
          <p className="text-muted-foreground">
            See where prospects are searching across Cleveland
          </p>
        </div>
        <DateRangePicker
          date={dateRange}
          onDateChange={(range) => range && setDateRange(range)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Heat Grid */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Cleveland Area Zip Codes</CardTitle>
              <CardDescription>Click any zip code for detailed insights</CardDescription>
            </CardHeader>
            <CardContent>
              <ClevelandHeatGrid zipStats={zipStats} properties={properties} />
            </CardContent>
          </Card>
        </div>

        {/* Insights Panel */}
        <div className="space-y-4">
          {/* Hottest Zips */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" />
                Hottest Zip Codes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {insights.hottest.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data yet</p>
              ) : (
                insights.hottest.map(([zip, stats], i) => (
                  <div key={zip} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono">{zip}</Badge>
                    </span>
                    <span className="font-medium">{stats.leadCount} leads</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Underserved Areas */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Underserved Areas
              </CardTitle>
              <CardDescription className="text-xs">
                High demand, no available properties
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {insights.underserved.length === 0 ? (
                <p className="text-sm text-muted-foreground">All demand areas have listings!</p>
              ) : (
                insights.underserved.map(([zip, stats]) => (
                  <div key={zip} className="flex items-center justify-between text-sm">
                    <Badge variant="outline" className="font-mono">{zip}</Badge>
                    <span className="text-amber-600">{stats.leadCount} leads waiting</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Best Converting */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                Best Converting
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {insights.bestConverting.length === 0 ? (
                <p className="text-sm text-muted-foreground">Need more data</p>
              ) : (
                insights.bestConverting.map(([zip, stats]) => (
                  <div key={zip} className="flex items-center justify-between text-sm">
                    <Badge variant="outline" className="font-mono">{zip}</Badge>
                    <span className="text-green-600">{stats.conversionRate}% conversion</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Highest Budgets */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                Avg Budget by Area
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {insights.highestVoucher.length === 0 ? (
                <p className="text-sm text-muted-foreground">No budget data</p>
              ) : (
                insights.highestVoucher.map(([zip, stats]) => (
                  <div key={zip} className="flex items-center justify-between text-sm">
                    <Badge variant="outline" className="font-mono">{zip}</Badge>
                    <span className="font-medium">${stats.avgBudget.toLocaleString()}</span>
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
