import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Shield, Users, DollarSign, Clock, TrendingUp, Loader2, Lightbulb, AlertTriangle, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { subDays, format, startOfDay, endOfDay } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

interface Lead {
  id: string;
  has_voucher: boolean | null;
  voucher_amount: number | null;
  voucher_status: string | null;
  housing_authority: string | null;
  status: string;
  interested_property_id: string | null;
}

interface Property {
  id: string;
  address: string;
  rent_price: number;
  section_8_accepted: boolean | null;
  hud_inspection_ready: boolean | null;
}

const VOUCHER_STATUS_COLORS: Record<string, string> = {
  active: 'hsl(142, 76%, 36%)',
  pending: 'hsl(217, 91%, 60%)',
  expiring_soon: 'hsl(38, 92%, 50%)',
  expired: 'hsl(0, 84%, 60%)',
  unknown: 'hsl(220, 9%, 46%)',
};

const LEAD_STAGES = ['new', 'contacted', 'engaged', 'showing_scheduled', 'showed', 'converted'];

export const VoucherIntelligence: React.FC = () => {
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
          .select('id, has_voucher, voucher_amount, voucher_status, housing_authority, status, interested_property_id')
          .eq('organization_id', userRecord.organization_id)
          .gte('created_at', startDate || '')
          .lte('created_at', endDate || '')
          .limit(2000),
        supabase
          .from('properties')
          .select('id, address, rent_price, section_8_accepted, hud_inspection_ready')
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

  // Summary stats
  const summaryStats = useMemo(() => {
    const voucherLeads = leads.filter(l => l.has_voucher);
    const nonVoucherLeads = leads.filter(l => !l.has_voucher);

    const totalVoucher = voucherLeads.length;
    const voucherAmounts = voucherLeads.filter(l => l.voucher_amount).map(l => l.voucher_amount!);
    const avgVoucherAmount = voucherAmounts.length > 0
      ? Math.round(voucherAmounts.reduce((a, b) => a + b, 0) / voucherAmounts.length)
      : 0;

    const voucherConverted = voucherLeads.filter(l => l.status === 'converted').length;
    const nonVoucherConverted = nonVoucherLeads.filter(l => l.status === 'converted').length;
    const voucherConvRate = voucherLeads.length > 0 ? Math.round((voucherConverted / voucherLeads.length) * 100) : 0;
    const nonVoucherConvRate = nonVoucherLeads.length > 0 ? Math.round((nonVoucherConverted / nonVoucherLeads.length) * 100) : 0;

    const expiringSoon = voucherLeads.filter(l => l.voucher_status === 'expiring_soon').length;

    return { totalVoucher, avgVoucherAmount, voucherConvRate, nonVoucherConvRate, expiringSoon };
  }, [leads]);

  // Voucher amount distribution
  const amountDistribution = useMemo(() => {
    const buckets = [
      { range: '$0-500', min: 0, max: 500, count: 0 },
      { range: '$501-750', min: 501, max: 750, count: 0 },
      { range: '$751-1000', min: 751, max: 1000, count: 0 },
      { range: '$1001-1250', min: 1001, max: 1250, count: 0 },
      { range: '$1251-1500', min: 1251, max: 1500, count: 0 },
      { range: '$1500+', min: 1501, max: Infinity, count: 0 },
    ];

    leads.filter(l => l.has_voucher && l.voucher_amount).forEach(lead => {
      const amt = lead.voucher_amount!;
      const bucket = buckets.find(b => amt >= b.min && amt <= b.max);
      if (bucket) bucket.count++;
    });

    return buckets;
  }, [leads]);

  // Property rent price range for overlay
  const propertyPriceRange = useMemo(() => {
    const prices = properties.map(p => p.rent_price);
    return {
      min: prices.length > 0 ? Math.min(...prices) : 0,
      max: prices.length > 0 ? Math.max(...prices) : 0,
    };
  }, [properties]);

  // Voucher status breakdown
  const statusBreakdown = useMemo(() => {
    const counts: Record<string, number> = {
      active: 0,
      pending: 0,
      expiring_soon: 0,
      expired: 0,
      unknown: 0,
    };

    leads.filter(l => l.has_voucher).forEach(lead => {
      const status = lead.voucher_status || 'unknown';
      if (counts[status] !== undefined) {
        counts[status]++;
      } else {
        counts.unknown++;
      }
    });

    return Object.entries(counts)
      .filter(([_, count]) => count > 0)
      .map(([name, value]) => ({
        name: name.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
        value,
        color: VOUCHER_STATUS_COLORS[name],
      }));
  }, [leads]);

  // Conversion funnel comparison
  const funnelData = useMemo(() => {
    const voucherLeads = leads.filter(l => l.has_voucher);
    const nonVoucherLeads = leads.filter(l => !l.has_voucher);

    return LEAD_STAGES.map(stage => ({
      stage: stage.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      voucher: voucherLeads.filter(l => l.status === stage).length,
      nonVoucher: nonVoucherLeads.filter(l => l.status === stage).length,
    }));
  }, [leads]);

  // Housing authority distribution
  const authorityDistribution = useMemo(() => {
    const counts: Record<string, number> = {};

    leads.filter(l => l.has_voucher && l.housing_authority).forEach(lead => {
      const auth = lead.housing_authority!;
      counts[auth] = (counts[auth] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [leads]);

  // Pricing alignment table
  const pricingAlignment = useMemo(() => {
    return properties.map(prop => {
      const interestedLeads = leads.filter(l => l.interested_property_id === prop.id && l.has_voucher);
      const voucherAmounts = interestedLeads.filter(l => l.voucher_amount).map(l => l.voucher_amount!);
      const avgVoucher = voucherAmounts.length > 0
        ? Math.round(voucherAmounts.reduce((a, b) => a + b, 0) / voucherAmounts.length)
        : 0;
      const gap = avgVoucher > 0 ? avgVoucher - prop.rent_price : 0;
      const matchRate = voucherAmounts.length > 0
        ? Math.round((voucherAmounts.filter(v => v >= prop.rent_price).length / voucherAmounts.length) * 100)
        : 0;

      return {
        id: prop.id,
        address: prop.address,
        rent: prop.rent_price,
        avgVoucher,
        gap,
        leadCount: interestedLeads.length,
        matchRate,
      };
    }).filter(p => p.leadCount > 0).sort((a, b) => b.leadCount - a.leadCount);
  }, [leads, properties]);

  // Calculated insights
  const insights = useMemo(() => {
    const voucherLeads = leads.filter(l => l.has_voucher);
    const hudReadyProps = properties.filter(p => p.hud_inspection_ready);
    const voucherAmounts = voucherLeads.filter(l => l.voucher_amount).map(l => l.voucher_amount!);
    
    // Find median voucher amount
    const sortedAmounts = [...voucherAmounts].sort((a, b) => a - b);
    const medianVoucher = sortedAmounts.length > 0 ? sortedAmounts[Math.floor(sortedAmounts.length / 2)] : 0;

    // Calculate how many properties are under median
    const propsUnderMedian = properties.filter(p => p.rent_price <= medianVoucher);
    const matchPercent = medianVoucher > 0 ? Math.round((propsUnderMedian.length / properties.length) * 100) : 0;

    // Voucher vs non-voucher conversion comparison
    const voucherConverted = voucherLeads.filter(l => l.status === 'converted').length;
    const nonVoucherLeads = leads.filter(l => !l.has_voucher);
    const nonVoucherConverted = nonVoucherLeads.filter(l => l.status === 'converted').length;
    const voucherConvRate = voucherLeads.length > 0 ? voucherConverted / voucherLeads.length : 0;
    const nonVoucherConvRate = nonVoucherLeads.length > 0 ? nonVoucherConverted / nonVoucherLeads.length : 0;
    const conversionMultiple = nonVoucherConvRate > 0 ? (voucherConvRate / nonVoucherConvRate).toFixed(1) : '—';

    // Expiring voucher count
    const expiring = voucherLeads.filter(l => l.voucher_status === 'expiring_soon').length;

    return [
      {
        icon: DollarSign,
        text: `Properties priced under $${medianVoucher.toLocaleString()} match ${matchPercent}% of CMHA vouchers`,
        type: 'info',
      },
      {
        icon: TrendingUp,
        text: hudReadyProps.length > 0
          ? `Voucher leads convert ${conversionMultiple}x faster when property is HUD-ready`
          : 'Mark properties as HUD-ready to attract more voucher leads',
        type: 'success',
      },
      {
        icon: AlertTriangle,
        text: expiring > 0
          ? `${expiring} leads have expiring vouchers — prioritize outreach`
          : 'No vouchers expiring soon',
        type: expiring > 0 ? 'warning' : 'info',
      },
    ];
  }, [leads, properties]);

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
            <Shield className="h-6 w-6" />
            Voucher Intelligence
          </h1>
          <p className="text-muted-foreground">
            Section 8 voucher trends and insights across your portfolio
          </p>
        </div>
        <DateRangePicker
          date={dateRange}
          onDateChange={(range) => range && setDateRange(range)}
        />
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summaryStats.totalVoucher}</p>
                <p className="text-sm text-muted-foreground">Voucher Leads</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-accent/10">
                <DollarSign className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold">${summaryStats.avgVoucherAmount.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Avg Voucher Amount</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-green-500/10">
                <TrendingUp className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summaryStats.voucherConvRate}%</p>
                <p className="text-sm text-muted-foreground">Voucher Conversion</p>
                <p className="text-xs text-muted-foreground">vs {summaryStats.nonVoucherConvRate}% non-voucher</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-amber-500/10">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summaryStats.expiringSoon}</p>
                <p className="text-sm text-muted-foreground">Expiring Soon</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Voucher Amount Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Voucher Amount Distribution</CardTitle>
            <CardDescription>
              Property range: ${propertyPriceRange.min.toLocaleString()} - ${propertyPriceRange.max.toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={amountDistribution}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="range" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Voucher Status Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Voucher Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {statusBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Funnel Comparison & Authority Distribution */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Conversion Funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Voucher vs Non-Voucher Funnel</CardTitle>
            <CardDescription>Lead progression comparison</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis dataKey="stage" type="category" width={100} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="voucher" name="Voucher" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="nonVoucher" name="Non-Voucher" fill="hsl(var(--muted-foreground))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Housing Authority Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Housing Authority Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {authorityDistribution.length === 0 ? (
                <p className="text-muted-foreground text-sm">No housing authority data</p>
              ) : (
                authorityDistribution.slice(0, 6).map((auth, i) => (
                  <div key={auth.name} className="flex items-center gap-3">
                    <div className="w-24 text-sm font-medium truncate">{auth.name}</div>
                    <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{
                          width: `${(auth.count / authorityDistribution[0].count) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="w-12 text-sm text-right">{auth.count}</div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pricing Alignment Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pricing Alignment</CardTitle>
          <CardDescription>How your property rents compare to voucher amounts</CardDescription>
        </CardHeader>
        <CardContent>
          {pricingAlignment.length === 0 ? (
            <p className="text-muted-foreground text-sm">No voucher leads interested in properties yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead className="text-right">Rent</TableHead>
                  <TableHead className="text-right">Avg Voucher</TableHead>
                  <TableHead className="text-right">Gap</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Match Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pricingAlignment.slice(0, 10).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.address}</TableCell>
                    <TableCell className="text-right">${row.rent.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      {row.avgVoucher > 0 ? `$${row.avgVoucher.toLocaleString()}` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.gap !== 0 ? (
                        <span className={row.gap >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {row.gap >= 0 ? '+' : ''}${row.gap.toLocaleString()}
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-right">{row.leadCount}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={row.matchRate >= 80 ? 'default' : row.matchRate >= 50 ? 'secondary' : 'destructive'}>
                        {row.matchRate}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Insight Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {insights.map((insight, i) => (
          <Card variant="glass" key={i}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-full ${
                  insight.type === 'warning' ? 'bg-amber-500/10' :
                  insight.type === 'success' ? 'bg-green-500/10' : 'bg-primary/10'
                }`}>
                  <insight.icon className={`h-4 w-4 ${
                    insight.type === 'warning' ? 'text-amber-500' :
                    insight.type === 'success' ? 'text-green-500' : 'text-primary'
                  }`} />
                </div>
                <p className="text-sm">{insight.text}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default VoucherIntelligence;
