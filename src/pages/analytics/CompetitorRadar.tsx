import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Target, 
  Crosshair,
  TrendingDown, 
  Award,
  Building2,
  ChevronRight,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip as RechartsTooltip, Cell } from "recharts";

interface CompetitorMention {
  id: string;
  created_at: string;
  competitor_name: string | null;
  competitor_address: string | null;
  competitor_price: number | null;
  advantage_mentioned: string | null;
  lead_chose_competitor: boolean;
  transcript_excerpt: string | null;
  lead_id: string | null;
  lead_name?: string | null;
}

interface DateRange {
  from: Date;
  to: Date;
}

const CompetitorRadar: React.FC = () => {
  const { userRecord } = useAuth();
  const [loading, setLoading] = useState(true);
  const [mentions, setMentions] = useState<CompetitorMention[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 90),
    to: new Date(),
  });
  const [advantageFilter, setAdvantageFilter] = useState<string>("all");

  useEffect(() => {
    const fetchData = async () => {
      if (!userRecord?.organization_id) return;

      setLoading(true);
      try {
        const { data: mentionsData, error } = await supabase
          .from("competitor_mentions")
          .select(`
            id, created_at, competitor_name, competitor_address, competitor_price,
            advantage_mentioned, lead_chose_competitor, transcript_excerpt, lead_id
          `)
          .eq("organization_id", userRecord.organization_id)
          .gte("created_at", startOfDay(dateRange.from).toISOString())
          .lte("created_at", endOfDay(dateRange.to).toISOString())
          .order("created_at", { ascending: false });

        if (error) throw error;

        // Fetch lead names for mentions with lead_id
        const leadIds = mentionsData?.filter(m => m.lead_id).map(m => m.lead_id) || [];
        let leadNamesMap: Record<string, string> = {};

        if (leadIds.length > 0) {
          const { data: leads } = await supabase
            .from("leads")
            .select("id, full_name")
            .in("id", leadIds);

          leads?.forEach(l => {
            leadNamesMap[l.id] = l.full_name || "Unknown";
          });
        }

        setMentions(
          (mentionsData || []).map(m => ({
            ...m,
            lead_name: m.lead_id ? leadNamesMap[m.lead_id] : null,
          }))
        );
      } catch (error) {
        console.error("Error fetching competitor data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userRecord?.organization_id, dateRange]);

  // Calculate summary stats
  const totalMentions = mentions.length;
  const leadsLost = mentions.filter(m => m.lead_chose_competitor).length;
  
  // Group by advantage
  const advantageCounts: Record<string, number> = {};
  mentions.forEach(m => {
    if (m.advantage_mentioned) {
      const adv = m.advantage_mentioned.toLowerCase();
      advantageCounts[adv] = (advantageCounts[adv] || 0) + 1;
    }
  });

  const sortedAdvantages = Object.entries(advantageCounts)
    .sort((a, b) => b[1] - a[1]);
  
  const topAdvantage = sortedAdvantages[0];

  const chartData = sortedAdvantages.slice(0, 8).map(([advantage, count]) => ({
    name: advantage.charAt(0).toUpperCase() + advantage.slice(1),
    count,
  }));

  const uniqueAdvantages = ["all", ...Object.keys(advantageCounts)];

  const filteredMentions = advantageFilter === "all"
    ? mentions
    : mentions.filter(m => m.advantage_mentioned?.toLowerCase() === advantageFilter);

  // Generate insights
  const insights = [];
  if (topAdvantage) {
    insights.push({
      icon: AlertTriangle,
      color: "text-amber-600",
      text: `${topAdvantage[0].charAt(0).toUpperCase() + topAdvantage[0].slice(1)} is the #1 reason leads explore other options (${topAdvantage[1]} mentions).`,
      suggestion: "Consider adding this feature to your properties or highlighting alternatives.",
    });
  }

  const lostRatio = totalMentions > 0 ? (leadsLost / totalMentions * 100).toFixed(0) : 0;
  if (Number(lostRatio) > 30) {
    insights.push({
      icon: TrendingDown,
      color: "text-red-600",
      text: `${lostRatio}% of leads who mentioned competitors chose them over us.`,
      suggestion: "Review pricing and features to improve competitive positioning.",
    });
  }

  const avgCompetitorPrice = mentions
    .filter(m => m.competitor_price)
    .reduce((sum, m) => sum + (m.competitor_price || 0), 0) / 
    (mentions.filter(m => m.competitor_price).length || 1);

  if (avgCompetitorPrice > 0) {
    insights.push({
      icon: Building2,
      color: "text-blue-600",
      text: `Average competitor price mentioned: $${avgCompetitorPrice.toFixed(0)}/month.`,
      suggestion: "Compare this to your property pricing to identify positioning opportunities.",
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Crosshair className="h-6 w-6" />
            Competitor Radar
          </h1>
          <p className="text-muted-foreground">
            Track what competitors are offering and why leads choose them
          </p>
        </div>
        <DateRangePicker
          date={dateRange}
          onDateChange={(range) => range && setDateRange(range as DateRange)}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card variant="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" />
              Competitor Mentions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-3xl font-bold">{totalMentions}</p>
            )}
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4" />
              Leads Lost to Competitors
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-3xl font-bold text-red-600">{leadsLost}</p>
            )}
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Award className="h-4 w-4" />
              Top Advantage They Have
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : topAdvantage ? (
              <p className="text-xl font-bold capitalize">{topAdvantage[0]}</p>
            ) : (
              <p className="text-muted-foreground">No data yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Advantage Chart */}
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Competitor Advantages</CardTitle>
            <CardDescription>What features do competitors offer that we don't?</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} />
                  <XAxis type="number" />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    width={120}
                    tick={{ fontSize: 12 }}
                  />
                  <RechartsTooltip 
                    formatter={(value: number) => [`${value} mentions`, 'Count']}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {chartData.map((_, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={index === 0 ? "hsl(var(--destructive))" : "hsl(var(--primary))"} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                <div className="text-center">
                  <Target className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>No competitor mentions recorded yet</p>
                  <p className="text-sm mt-1">This data is extracted from call transcripts via AI</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Insights Panel */}
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-accent" />
              Insights
            </CardTitle>
            <CardDescription>Actionable recommendations based on competitor data</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : insights.length > 0 ? (
              <div className="space-y-4">
                {insights.map((insight, idx) => (
                  <div key={idx} className="p-4 rounded-lg bg-muted/50 border">
                    <div className="flex items-start gap-3">
                      <insight.icon className={`h-5 w-5 shrink-0 mt-0.5 ${insight.color}`} />
                      <div>
                        <p className="font-medium text-sm">{insight.text}</p>
                        <p className="text-sm text-muted-foreground mt-1">{insight.suggestion}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Lightbulb className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Insights will appear once competitor data is collected</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Mentions Table */}
      <Card variant="glass">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Competitor Mentions</CardTitle>
            <CardDescription>Details extracted from call transcripts</CardDescription>
          </div>
          <Select value={advantageFilter} onValueChange={setAdvantageFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by advantage" />
            </SelectTrigger>
            <SelectContent>
              {uniqueAdvantages.map(adv => (
                <SelectItem key={adv} value={adv}>
                  {adv === "all" ? "All Advantages" : adv.charAt(0).toUpperCase() + adv.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredMentions.length > 0 ? (
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Competitor</TableHead>
                    <TableHead>Their Advantage</TableHead>
                    <TableHead>Chose Them?</TableHead>
                    <TableHead>Excerpt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMentions.slice(0, 20).map((mention) => (
                    <TableRow key={mention.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(mention.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        {mention.lead_id ? (
                          <Link 
                            to={`/leads/${mention.lead_id}`}
                            className="text-primary hover:underline"
                          >
                            {mention.lead_name || "View Lead"}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{mention.competitor_name || "Unknown"}</p>
                          {mention.competitor_price && (
                            <p className="text-sm text-muted-foreground">
                              ${mention.competitor_price}/mo
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {mention.advantage_mentioned ? (
                          <Badge variant="secondary" className="capitalize">
                            {mention.advantage_mentioned}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {mention.lead_chose_competitor ? (
                          <Badge variant="destructive">Yes</Badge>
                        ) : (
                          <Badge variant="outline">No</Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        {mention.transcript_excerpt ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="truncate block cursor-help text-sm">
                                {mention.transcript_excerpt.slice(0, 50)}...
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[300px]">
                              <p className="text-sm whitespace-pre-wrap">{mention.transcript_excerpt}</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Target className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No competitor mentions found for this period</p>
              <p className="text-sm mt-1">
                This data will be automatically extracted when OpenAI analyzes call transcripts
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CompetitorRadar;
