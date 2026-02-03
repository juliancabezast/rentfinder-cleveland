import React, { useState, useMemo } from "react";
import { startOfMonth, endOfMonth } from "date-fns";
import { DateRange } from "react-day-picker";
import {
  DollarSign,
  Users,
  Calendar,
  TrendingUp,
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Settings,
  AlertCircle,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Link } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "@/components/dashboard/StatCard";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useCostData } from "@/hooks/useCostData";
import { cn } from "@/lib/utils";

// Chart colors
const CHART_COLORS = [
  "hsl(280, 73%, 17%)", // Primary purple
  "hsl(40, 100%, 59%)", // Accent gold
  "hsl(142, 71%, 45%)", // Success green
  "hsl(38, 92%, 50%)", // Warning amber
  "hsl(0, 84%, 60%)", // Destructive red
];

const SERVICE_COLORS: Record<string, string> = {
  twilio_voice: "hsl(280, 73%, 17%)",
  twilio_sms: "hsl(280, 73%, 40%)",
  bland_ai: "hsl(40, 100%, 59%)",
  openai: "hsl(142, 71%, 45%)",
  persona: "hsl(38, 92%, 50%)",
};

const SOURCE_LABELS: Record<string, string> = {
  inbound_call: "Inbound Call",
  hemlane_email: "Hemlane Email",
  website: "Website",
  referral: "Referral",
  manual: "Manual",
  sms: "SMS",
  campaign: "Campaign",
  csv_import: "CSV Import",
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
};

const ITEMS_PER_PAGE = 20;

type SortField = "full_name" | "totalCost" | "callCount" | "messageCount" | "avgCostPerInteraction";
type SortDirection = "asc" | "desc";

const CostDashboard: React.FC = () => {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  const { data, loading, error } = useCostData(
    dateRange?.from && dateRange?.to
      ? { from: dateRange.from, to: dateRange.to }
      : undefined
  );

  // Per Lead tab state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("totalCost");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [currentPage, setCurrentPage] = useState(1);

  // Filter and sort leads
  const filteredLeads = useMemo(() => {
    if (!data?.perLead) return [];
    
    let filtered = data.perLead.filter(lead => {
      const searchLower = searchQuery.toLowerCase();
      return (
        (lead.full_name?.toLowerCase().includes(searchLower) || false) ||
        lead.phone.includes(searchQuery)
      );
    });

    filtered.sort((a, b) => {
      let aVal: string | number = a[sortField] ?? "";
      let bVal: string | number = b[sortField] ?? "";
      
      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();
      
      if (sortDirection === "asc") {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });

    return filtered;
  }, [data?.perLead, searchQuery, sortField, sortDirection]);

  const paginatedLeads = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredLeads.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredLeads, currentPage]);

  const totalPages = Math.ceil(filteredLeads.length / ITEMS_PER_PAGE);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
      </div>
    </TableHead>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            Cost Dashboard
          </h1>
          <p className="text-muted-foreground">
            Track costs per lead, property, and service
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <DateRangePicker date={dateRange} onDateChange={setDateRange} />
          {data?.overview && (
            <Badge variant="secondary" className="text-lg px-4 py-2 font-semibold">
              {formatCurrency(data.overview.totalSpend)}
            </Badge>
          )}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Card variant="glass" className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="per-lead">Per Lead</TabsTrigger>
          <TabsTrigger value="per-source">Per Source</TabsTrigger>
        </TabsList>

        {/* Tab 1: Overview */}
        <TabsContent value="overview" className="space-y-6">
          {/* Summary Cards */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Spend"
              value={formatCurrency(data?.overview.totalSpend ?? 0)}
              icon={DollarSign}
              subtitle="this period"
              loading={loading}
            />
            <StatCard
              title="Cost per Lead"
              value={data?.overview.costPerLead !== null ? formatCurrency(data.overview.costPerLead) : "N/A"}
              icon={Users}
              subtitle="total spend / leads"
              loading={loading}
            />
            <StatCard
              title="Cost per Showing"
              value={data?.overview.costPerShowing !== null ? formatCurrency(data.overview.costPerShowing) : "N/A"}
              icon={Calendar}
              subtitle="total spend / showings"
              loading={loading}
            />
            <StatCard
              title="Most Expensive"
              value={data?.overview.mostExpensiveService ?? "N/A"}
              icon={TrendingUp}
              subtitle="highest spend service"
              loading={loading}
            />
          </div>

          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Spend Over Time */}
            <Card variant="glass" className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">Monthly Spend by Service</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : data?.overview.spendOverTime.length ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart
                      data={data.overview.spendOverTime}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `$${v}`} />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="twilio_voice"
                        stackId="1"
                        stroke={SERVICE_COLORS.twilio_voice}
                        fill={SERVICE_COLORS.twilio_voice}
                        fillOpacity={0.6}
                        name="Twilio Voice"
                      />
                      <Area
                        type="monotone"
                        dataKey="twilio_sms"
                        stackId="1"
                        stroke={SERVICE_COLORS.twilio_sms}
                        fill={SERVICE_COLORS.twilio_sms}
                        fillOpacity={0.6}
                        name="Twilio SMS"
                      />
                      <Area
                        type="monotone"
                        dataKey="bland_ai"
                        stackId="1"
                        stroke={SERVICE_COLORS.bland_ai}
                        fill={SERVICE_COLORS.bland_ai}
                        fillOpacity={0.6}
                        name="Bland AI"
                      />
                      <Area
                        type="monotone"
                        dataKey="openai"
                        stackId="1"
                        stroke={SERVICE_COLORS.openai}
                        fill={SERVICE_COLORS.openai}
                        fillOpacity={0.6}
                        name="OpenAI"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex flex-col items-center justify-center text-center p-6">
                    <div className="p-4 rounded-full bg-muted/50 mb-4">
                      <DollarSign className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground text-sm">
                      Cost data will populate as integrations process calls and messages
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Spend Distribution */}
            <Card variant="glass">
              <CardHeader>
                <CardTitle className="text-lg">Spend Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : data?.overview.serviceBreakdown.length ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={data.overview.serviceBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="total"
                        nameKey="label"
                        label={({ label, percent }) =>
                          `${label} (${(percent * 100).toFixed(0)}%)`
                        }
                        labelLine={false}
                      >
                        {data.overview.serviceBreakdown.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={SERVICE_COLORS[entry.service] || CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        formatter={(value, entry: any) => (
                          <span className="text-sm">
                            {value}: {formatCurrency(entry.payload.total)}
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex flex-col items-center justify-center text-center p-6">
                    <div className="p-4 rounded-full bg-muted/50 mb-4">
                      <DollarSign className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground text-sm">
                      No cost data available for this period
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Alerts Section */}
            <Card variant="glass">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Cost Alerts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-sm text-muted-foreground">
                    <strong>Daily spend alerts:</strong>{" "}
                    <Link to="/settings" className="text-primary hover:underline">
                      Configure in Settings → Communications
                    </Link>
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-sm text-muted-foreground">
                    <strong>Single lead cost threshold:</strong>{" "}
                    <Link to="/settings" className="text-primary hover:underline">
                      Configure in Settings → Scoring
                    </Link>
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Per Lead */}
        <TabsContent value="per-lead" className="space-y-4">
          {/* Search */}
          <div className="glass-card rounded-xl p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or phone..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10"
              />
            </div>
          </div>

          {/* Table */}
          <Card variant="glass">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filteredLeads.length === 0 ? (
                <EmptyState
                  icon={DollarSign}
                  title="No lead cost data"
                  description="Cost tracking will begin when leads have calls or messages."
                />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table className="modern-table">
                      <TableHeader>
                        <TableRow>
                          <SortableHeader field="full_name">Lead</SortableHeader>
                          <TableHead>Phone</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Status</TableHead>
                          <SortableHeader field="callCount">Calls</SortableHeader>
                          <SortableHeader field="messageCount">Messages</SortableHeader>
                          <SortableHeader field="totalCost">Total Cost</SortableHeader>
                          <SortableHeader field="avgCostPerInteraction">Avg Cost</SortableHeader>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedLeads.map((lead) => (
                          <TableRow key={lead.id}>
                            <TableCell className="font-medium">
                              {lead.full_name || "Unknown"}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {lead.phone}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {SOURCE_LABELS[lead.source] || lead.source}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={lead.status} type="lead" />
                            </TableCell>
                            <TableCell>{lead.callCount}</TableCell>
                            <TableCell>{lead.messageCount}</TableCell>
                            <TableCell className="font-medium">
                              {formatCurrency(lead.totalCost)}
                            </TableCell>
                            <TableCell>
                              {formatCurrency(lead.avgCostPerInteraction)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between p-4 border-t">
                      <p className="text-sm text-muted-foreground">
                        Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
                        {Math.min(currentPage * ITEMS_PER_PAGE, filteredLeads.length)} of{" "}
                        {filteredLeads.length} leads
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Per Source */}
        <TabsContent value="per-source" className="space-y-4">
          <Card variant="glass">
            <CardHeader>
              <CardTitle className="text-lg">Cost Analysis by Lead Source</CardTitle>
              <CardDescription>
                Compare acquisition costs across different lead sources
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !data?.perSource.length ? (
                <EmptyState
                  icon={DollarSign}
                  title="No source data"
                  description="Source analysis will appear once you have leads with costs."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table className="modern-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Leads</TableHead>
                        <TableHead className="text-right">Showings</TableHead>
                        <TableHead className="text-right">Converted</TableHead>
                        <TableHead className="text-right">Total Cost</TableHead>
                        <TableHead className="text-right">Cost/Lead</TableHead>
                        <TableHead className="text-right">Cost/Showing</TableHead>
                        <TableHead className="text-right">Cost/Conversion</TableHead>
                        <TableHead className="text-right">ROI</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.perSource.map((source) => (
                        <TableRow
                          key={source.source}
                          className={cn(
                            source.isMostEfficient && "bg-emerald-50 dark:bg-emerald-950/20",
                            source.isLeastEfficient && "bg-amber-50 dark:bg-amber-950/20"
                          )}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">
                                {SOURCE_LABELS[source.source] || source.source}
                              </Badge>
                              {source.isMostEfficient && (
                                <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                                  Most Efficient
                                </Badge>
                              )}
                              {source.isLeastEfficient && (
                                <Badge className="bg-amber-100 text-amber-700 text-xs">
                                  Least Efficient
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{source.leads}</TableCell>
                          <TableCell className="text-right">{source.showings}</TableCell>
                          <TableCell className="text-right">{source.converted}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(source.totalCost)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(source.costPerLead)}
                          </TableCell>
                          <TableCell className="text-right">
                            {source.costPerShowing > 0 ? formatCurrency(source.costPerShowing) : "N/A"}
                          </TableCell>
                          <TableCell className="text-right">
                            {source.costPerConversion > 0 ? formatCurrency(source.costPerConversion) : "N/A"}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            N/A
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CostDashboard;
