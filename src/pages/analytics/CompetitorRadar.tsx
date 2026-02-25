import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "@/components/dashboard/StatCard";
import {
  Target,
  Building2,
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  Clock,
  RefreshCw,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface RentBenchmark {
  id: string;
  property_id: string;
  our_rent: number | null;
  market_avg_rent: number | null;
  market_low: number | null;
  market_high: number | null;
  sample_size: number | null;
  ai_summary: string | null;
  analyzed_at: string;
  property?: {
    address: string;
    bedrooms: number | null;
    status: string;
    city: string | null;
    state: string | null;
  } | null;
}

const RentBenchmarkPage: React.FC = () => {
  const { userRecord } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [benchmarks, setBenchmarks] = useState<RentBenchmark[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBenchmarks();
  }, [userRecord?.organization_id]);

  const fetchBenchmarks = async () => {
    if (!userRecord?.organization_id) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error: err } = await supabase
        .from("rent_benchmarks")
        .select(`
          id, property_id, our_rent, market_avg_rent, market_low, market_high,
          sample_size, ai_summary, analyzed_at,
          properties:property_id (address, bedrooms, status, city, state)
        `)
        .eq("organization_id", userRecord.organization_id)
        .order("analyzed_at", { ascending: false });

      if (err) throw err;

      // Normalize the join (Supabase returns single object for FK join)
      const normalized = (data || []).map((b: any) => ({
        ...b,
        property: b.properties || null,
      }));
      setBenchmarks(normalized);
    } catch (err) {
      console.error("Error fetching benchmarks:", err);
      setError("Could not load benchmark data. Make sure the rent_benchmarks table exists.");
    } finally {
      setLoading(false);
    }
  };

  const handleRunAnalysis = async () => {
    if (!userRecord?.organization_id) return;
    setRunning(true);

    try {
      const { data, error: err } = await supabase.functions.invoke("agent-rent-benchmark", {
        body: { organization_id: userRecord.organization_id },
      });

      if (err) throw err;

      const result = data as { properties_analyzed?: number; error?: string };
      if (result.error) {
        toast({ title: "Analysis Error", description: result.error, variant: "destructive" });
      } else {
        toast({ title: "Analysis Complete", description: `Analyzed ${result.properties_analyzed || 0} properties` });
        fetchBenchmarks();
      }
    } catch (err) {
      console.error("Analysis error:", err);
      toast({ title: "Error", description: "Failed to run analysis. Make sure the edge function is deployed.", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  // Summary calculations
  const propertiesAnalyzed = benchmarks.length;
  const withOurRent = benchmarks.filter(b => b.our_rent != null && b.our_rent > 0);
  const avgOurRent = withOurRent.length > 0
    ? Math.round(withOurRent.reduce((s, b) => s + (b.our_rent || 0), 0) / withOurRent.length)
    : 0;
  const withMarketRent = benchmarks.filter(b => b.market_avg_rent != null && b.market_avg_rent > 0);
  const avgMarketRent = withMarketRent.length > 0
    ? Math.round(withMarketRent.reduce((s, b) => s + (b.market_avg_rent || 0), 0) / withMarketRent.length)
    : 0;
  // Positive = our rent is above market, negative = below market
  const rentDiffPct = avgOurRent > 0 && avgMarketRent > 0
    ? Math.round(((avgOurRent - avgMarketRent) / avgMarketRent) * 100)
    : null;

  const lastAnalyzed = benchmarks.length > 0
    ? format(new Date(benchmarks[0].analyzed_at), "MMM d, yyyy 'at' h:mm a")
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Target className="h-6 w-6" />
            Rent Benchmark
          </h1>
          <p className="text-muted-foreground">
            AI-powered market rent analysis for your properties
          </p>
        </div>
        <Button
          onClick={handleRunAnalysis}
          disabled={running}
          className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold min-h-[44px] shrink-0"
        >
          {running ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Run Analysis
            </>
          )}
        </Button>
      </div>

      {/* Last updated banner */}
      {lastAnalyzed && (
        <div className="flex items-center gap-2 rounded-lg bg-muted/40 border px-4 py-2 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>Last analyzed: {lastAnalyzed}</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <Card variant="glass" className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-800">{error}</p>
              <p className="text-amber-700 mt-1">
                Run this SQL in the Supabase Dashboard to create the table, then run the analysis.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Properties Analyzed"
          value={propertiesAnalyzed}
          icon={Building2}
          loading={loading}
        />
        <StatCard
          title="Avg Our Rent"
          value={avgOurRent > 0 ? `$${avgOurRent.toLocaleString()}` : "N/A"}
          icon={DollarSign}
          loading={loading}
        />
        <StatCard
          title="Avg Market Rent"
          value={avgMarketRent > 0 ? `$${avgMarketRent.toLocaleString()}` : "N/A"}
          icon={TrendingUp}
          loading={loading}
        />
        <StatCard
          title="vs Market"
          value={rentDiffPct != null ? `${rentDiffPct > 0 ? "+" : ""}${rentDiffPct}%` : "N/A"}
          icon={rentDiffPct != null && rentDiffPct > 0 ? TrendingUp : rentDiffPct != null && rentDiffPct < 0 ? TrendingDown : Minus}
          subtitle={rentDiffPct != null
            ? rentDiffPct > 0 ? "above market avg" : rentDiffPct < 0 ? "below market avg" : "at market avg"
            : undefined}
          loading={loading}
        />
      </div>

      {/* Benchmark Table */}
      <Card variant="glass">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Property Rent Comparison</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : benchmarks.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Target className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-lg font-medium">No benchmark data yet</h3>
              <p className="text-muted-foreground text-sm mt-1 max-w-md">
                Click "Run Analysis" to analyze your properties against market rents using AI.
                The analysis uses OpenAI to research comparable rents within 1 mile of each property.
              </p>
            </div>
          ) : (
            <div className="-mx-4 px-4 overflow-x-auto sm:mx-0 sm:px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Property</TableHead>
                    <TableHead className="text-right">Our Rent</TableHead>
                    <TableHead className="text-right">Market Avg</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                    <TableHead className="text-center hidden md:table-cell">Range</TableHead>
                    <TableHead className="text-center hidden md:table-cell">Samples</TableHead>
                    <TableHead className="hidden lg:table-cell">AI Summary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {benchmarks.map(b => {
                    const diff = b.our_rent && b.market_avg_rent
                      ? b.our_rent - b.market_avg_rent
                      : null;
                    const diffPct = diff != null && b.market_avg_rent
                      ? Math.round((diff / b.market_avg_rent) * 100)
                      : null;
                    const isBelow = diff != null && diff < 0;
                    const isAbove = diff != null && diff > 0;
                    const isClose = diffPct != null && Math.abs(diffPct) <= 5;

                    return (
                      <TableRow key={b.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{b.property?.address || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground">
                              {b.property?.bedrooms ? `${b.property.bedrooms} BR` : ""}
                              {b.property?.city ? ` · ${b.property.city}` : ""}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {b.our_rent ? `$${b.our_rent.toLocaleString()}` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {b.market_avg_rent ? `$${b.market_avg_rent.toLocaleString()}` : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {diff != null ? (
                            <span className={cn(
                              "flex items-center justify-end gap-1 font-semibold text-sm",
                              isClose ? "text-amber-600" :
                              isBelow ? "text-green-600" :
                              "text-red-600"
                            )}>
                              {isBelow ? <TrendingDown className="h-3.5 w-3.5" /> :
                               isAbove ? <TrendingUp className="h-3.5 w-3.5" /> :
                               <Minus className="h-3.5 w-3.5" />}
                              {diff > 0 ? "+" : "-"}${Math.abs(diff).toLocaleString()}
                              <span className="text-xs opacity-70">({diffPct != null ? `${diffPct > 0 ? "+" : ""}${diffPct}` : 0}%)</span>
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground hidden md:table-cell">
                          {b.market_low && b.market_high
                            ? `$${b.market_low.toLocaleString()} – $${b.market_high.toLocaleString()}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-center hidden md:table-cell">
                          {b.sample_size ? (
                            <Badge variant="outline" className="text-xs">{b.sample_size}</Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="max-w-[200px] hidden lg:table-cell">
                          {b.ai_summary ? (
                            <p className="text-xs text-muted-foreground truncate" title={b.ai_summary}>
                              {b.ai_summary}
                            </p>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RentBenchmarkPage;
