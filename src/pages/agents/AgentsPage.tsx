import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Bot,
  Search,
  Activity,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Zap,
  TrendingUp,
  Phone,
  Brain,
  MessageSquare,
  ShieldCheck,
  RefreshCw,
  Server,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, formatDistanceToNow, startOfHour, addHours, isWithinInterval } from "date-fns";
import { cn } from "@/lib/utils";

// Biblical name to functional name mapping — 12 operational agents
const AGENT_DISPLAY_NAMES: Record<string, string> = {
  // Dept 1: Recepción
  aaron: "Inbound Calls",
  twilio_inbound: "Inbound Calls",
  deborah: "Call Processor & Smart Matcher",
  bland_call: "Call Processor & Smart Matcher",
  ruth: "SMS Conversational Agent",
  sms_inbound: "SMS Conversational Agent",
  // Dept 2: Evaluación
  daniel: "Lead Scoring (AI)",
  scoring: "Lead Scoring (AI)",
  isaiah: "Transcript Analyst",
  transcript_analyst: "Transcript Analyst",
  // Dept 3: Operaciones
  nehemiah: "Operations Director",
  task_dispatcher: "Operations Director",
  // Dept 4: Ventas
  elijah: "Outbound Sales & Recapture",
  recapture: "Outbound Sales & Recapture",
  no_show_followup: "Showing Lifecycle",
  no_show_follow_up: "Showing Lifecycle",
  samuel: "Showing Lifecycle",
  showing_confirmation: "Showing Lifecycle",
  post_showing: "Showing Lifecycle",
  // Dept 6: Inteligencia
  solomon: "Conversion Predictor",
  conversion_predictor: "Conversion Predictor",
  moses: "Insight Generator",
  insight_generator: "Insight Generator",
  david: "Report Generator",
  report_generator: "Report Generator",
  // Dept 7: Administración
  ezra: "Doorloop Bridge",
  doorloop_pull: "Doorloop Bridge",
  doorloop_push: "Doorloop Bridge",
  zacchaeus: "Health & Cost Monitor",
  cost_tracker: "Health & Cost Monitor",
  health_checker: "Health & Cost Monitor",
  // Legacy mappings (tasks created before reorganization)
  naomi: "Showing Lifecycle",
  jonah: "Showing Lifecycle",
  abigail: "Showing Lifecycle",
  priscilla: "Showing Lifecycle",
  campaign: "Outbound Sales & Recapture",
  campaign_voice: "Outbound Sales & Recapture",
  welcome_sequence: "Outbound Sales & Recapture",
};

const CATEGORY_CONFIG = [
  { key: "system", label: "System", icon: Server },
  { key: "voice", label: "Voice", icon: Phone },
  { key: "communication", label: "Communication", icon: MessageSquare },
  { key: "intelligence", label: "Analytics", icon: Brain },
  { key: "verification", label: "Compliance", icon: ShieldCheck },
  { key: "sync", label: "Sync", icon: RefreshCw },
];

const STATUS_CONFIG: Record<string, { color: string; bgColor: string; pulse?: boolean }> = {
  idle: { color: "text-gray-500", bgColor: "bg-gray-400" },
  active: { color: "text-green-500", bgColor: "bg-green-500", pulse: true },
  error: { color: "text-red-500", bgColor: "bg-red-500" },
  disabled: { color: "text-gray-300", bgColor: "bg-gray-300" },
  degraded: { color: "text-amber-500", bgColor: "bg-amber-500" },
};

interface Agent {
  id: string;
  agent_key: string;
  biblical_name: string;
  display_role: string;
  description: string;
  category: string;
  status: string;
  is_enabled: boolean;
  executions_today: number;
  successes_today: number;
  failures_today: number;
  last_execution_at: string | null;
}

interface AgentTask {
  id: string;
  agent_type: string;
  action_type: string;
  scheduled_for: string;
  status: string;
  lead_id: string;
  leads?: { full_name: string | null; first_name: string | null; last_name: string | null } | null;
}

interface ActivityLog {
  id: string;
  agent_key: string;
  action: string;
  status: string;
  message: string;
  execution_ms: number | null;
  created_at: string;
  related_lead_id: string | null;
}

const AgentsPage: React.FC = () => {
  const { userRecord } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("workload");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [activityStatusFilter, setActivityStatusFilter] = useState("all");
  const [activityAgentFilter, setActivityAgentFilter] = useState("all");
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  // Fetch agents
  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ["agents-page", userRecord?.organization_id],
    queryFn: async () => {
      if (!userRecord?.organization_id) return [];
      const { data, error } = await supabase
        .from("agents_registry")
        .select("*")
        .eq("organization_id", userRecord.organization_id)
        .order("biblical_name");
      if (error) throw error;
      return data as Agent[];
    },
    enabled: !!userRecord?.organization_id,
  });

  // Fetch pending tasks count per agent
  const { data: pendingTasks } = useQuery({
    queryKey: ["pending-tasks-count", userRecord?.organization_id],
    queryFn: async () => {
      if (!userRecord?.organization_id) return {};
      const { data, error } = await supabase
        .from("agent_tasks")
        .select("agent_type, status")
        .eq("organization_id", userRecord.organization_id)
        .in("status", ["pending", "in_progress"]);
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data?.forEach((task) => {
        counts[task.agent_type] = (counts[task.agent_type] || 0) + 1;
      });
      return counts;
    },
    enabled: !!userRecord?.organization_id,
  });

  // Fetch activity log
  const { data: activityLog, isLoading: activityLoading } = useQuery({
    queryKey: ["agent-activity-log-page", userRecord?.organization_id],
    queryFn: async () => {
      if (!userRecord?.organization_id) return [];
      const { data, error } = await supabase
        .from("agent_activity_log")
        .select("*")
        .eq("organization_id", userRecord.organization_id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as ActivityLog[];
    },
    enabled: !!userRecord?.organization_id,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  // Fetch scheduled tasks for the next 24h
  const { data: scheduledTasks, isLoading: scheduleLoading } = useQuery({
    queryKey: ["scheduled-tasks-24h", userRecord?.organization_id],
    queryFn: async () => {
      if (!userRecord?.organization_id) return [];
      const now = new Date();
      const tomorrow = addHours(now, 24);
      
      const { data, error } = await supabase
        .from("agent_tasks")
        .select(`
          id, agent_type, action_type, scheduled_for, status, lead_id,
          leads:lead_id (full_name, first_name, last_name)
        `)
        .eq("organization_id", userRecord.organization_id)
        .eq("status", "pending")
        .gte("scheduled_for", now.toISOString())
        .lte("scheduled_for", tomorrow.toISOString())
        .order("scheduled_for", { ascending: true });
      if (error) throw error;
      return data as AgentTask[];
    },
    enabled: !!userRecord?.organization_id,
  });

  // Fetch upcoming tasks for expanded agents
  const fetchAgentTasks = async (agentKey: string) => {
    if (!userRecord?.organization_id) return [];
    const { data } = await supabase
      .from("agent_tasks")
      .select(`id, action_type, scheduled_for, status, leads:lead_id (full_name, first_name, last_name)`)
      .eq("organization_id", userRecord.organization_id)
      .eq("agent_type", agentKey)
      .eq("status", "pending")
      .order("scheduled_for", { ascending: true })
      .limit(5);
    return data || [];
  };

  // Stats calculations
  const stats = useMemo(() => {
    if (!agents) return { active: 0, total: 0, executedToday: 0, pendingGlobal: 0, successRate: 0 };
    
    const active = agents.filter((a) => a.status === "active" || a.status === "idle").length;
    const total = agents.length;
    const executedToday = agents.reduce((sum, a) => sum + (a.executions_today || 0), 0);
    const successesToday = agents.reduce((sum, a) => sum + (a.successes_today || 0), 0);
    const failuresToday = agents.reduce((sum, a) => sum + (a.failures_today || 0), 0);
    const pendingGlobal = Object.values(pendingTasks || {}).reduce((sum, count) => sum + count, 0);
    const successRate = executedToday > 0 ? Math.round((successesToday / executedToday) * 100) : 100;

    return { active, total, executedToday, pendingGlobal, successRate };
  }, [agents, pendingTasks]);

  // Filtered agents
  const filteredAgents = useMemo(() => {
    if (!agents) return [];
    return agents.filter((agent) => {
      const matchesCategory = categoryFilter === "all" || agent.category === categoryFilter;
      const matchesSearch =
        searchQuery === "" ||
        agent.biblical_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.agent_key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.display_role.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [agents, categoryFilter, searchQuery]);

  // Filtered activity log
  const filteredActivity = useMemo(() => {
    if (!activityLog) return [];
    return activityLog.filter((log) => {
      const matchesStatus = activityStatusFilter === "all" || log.status === activityStatusFilter;
      const matchesAgent = activityAgentFilter === "all" || log.agent_key === activityAgentFilter;
      return matchesStatus && matchesAgent;
    });
  }, [activityLog, activityStatusFilter, activityAgentFilter]);

  // Group scheduled tasks by hour
  const tasksByHour = useMemo(() => {
    if (!scheduledTasks) return {};
    const grouped: Record<string, AgentTask[]> = {};
    scheduledTasks.forEach((task) => {
      const hour = format(new Date(task.scheduled_for), "yyyy-MM-dd HH:00");
      if (!grouped[hour]) grouped[hour] = [];
      grouped[hour].push(task);
    });
    return grouped;
  }, [scheduledTasks]);

  const toggleAgentExpand = (agentId: string) => {
    setExpandedAgents((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(agentId)) {
        newSet.delete(agentId);
      } else {
        newSet.add(agentId);
      }
      return newSet;
    });
  };

  const getDisplayName = (agent: Agent) => {
    const functionalName = AGENT_DISPLAY_NAMES[agent.agent_key.toLowerCase()] || 
                           AGENT_DISPLAY_NAMES[agent.biblical_name.toLowerCase()] ||
                           agent.display_role;
    return `${agent.biblical_name} — ${functionalName}`;
  };

  const getLeadName = (lead: AgentTask["leads"]) => {
    if (!lead) return "Unknown Lead";
    return lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown";
  };

  if (agentsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[500px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            AI Agents Control Center
          </h1>
          <p className="text-sm text-muted-foreground">
            Monitor and manage all AI agents in real-time
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card variant="glass">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900">
                <Bot className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Agents</p>
                <p className="text-2xl font-bold">
                  {stats.active} <span className="text-sm font-normal text-muted-foreground">/ {stats.total}</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                <Zap className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Executed Today</p>
                <p className="text-2xl font-bold">{stats.executedToday}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Tasks</p>
                <p className="text-2xl font-bold">{stats.pendingGlobal}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold">{stats.successRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="grid w-full sm:w-auto grid-cols-3">
            <TabsTrigger value="workload" className="gap-2">
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">Workload</span>
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-2">
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Activity Log</span>
            </TabsTrigger>
            <TabsTrigger value="schedule" className="gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Schedule</span>
            </TabsTrigger>
          </TabsList>

          {/* Search (visible in workload tab) */}
          {activeTab === "workload" && (
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search agents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {CATEGORY_CONFIG.map((cat) => (
                    <SelectItem key={cat.key} value={cat.key}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Workload Tab */}
        <TabsContent value="workload" className="mt-6">
          {filteredAgents.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="No agents found"
              description={searchQuery ? "Try adjusting your search" : "No agents match the selected filter"}
            />
          ) : (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {filteredAgents.map((agent, index) => {
                const statusConfig = STATUS_CONFIG[agent.status] || STATUS_CONFIG.idle;
                const isExpanded = expandedAgents.has(agent.id);
                const pending = pendingTasks?.[agent.agent_key] || 0;

                return (
                  <Card
                    key={agent.id}
                    variant="glass"
                    className="animate-fade-up transition-all hover:shadow-modern-lg"
                    style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground truncate">
                            {getDisplayName(agent)}
                          </h3>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {agent.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <span className={cn("relative flex h-2.5 w-2.5")}>
                            {statusConfig.pulse && (
                              <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", statusConfig.bgColor)} />
                            )}
                            <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", statusConfig.bgColor)} />
                          </span>
                        </div>
                      </div>

                      {/* Stats Row */}
                      <div className="flex items-center gap-3 text-xs mb-3">
                        <span className="text-amber-600 font-medium">{pending} pending</span>
                        <span className="text-muted-foreground">|</span>
                        <span className="text-green-600">{agent.successes_today} ✓</span>
                        <span className="text-red-600">{agent.failures_today} ✗</span>
                      </div>

                      {/* Progress Bar */}
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-3">
                        <div
                          className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all"
                          style={{
                            width: `${agent.executions_today > 0 
                              ? Math.round((agent.successes_today / agent.executions_today) * 100) 
                              : 0}%`,
                          }}
                        />
                      </div>

                      {/* Last Execution */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {agent.last_execution_at
                            ? formatDistanceToNow(new Date(agent.last_execution_at), { addSuffix: true })
                            : "Never"}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => toggleAgentExpand(agent.id)}
                        >
                          {isExpanded ? (
                            <>
                              <ChevronDown className="h-3 w-3 mr-1" />
                              Less
                            </>
                          ) : (
                            <>
                              <ChevronRight className="h-3 w-3 mr-1" />
                              Tasks
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Expanded: Upcoming Tasks */}
                      {isExpanded && (
                        <AgentTasksList agentKey={agent.agent_key} organizationId={userRecord?.organization_id} />
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Activity Log Tab */}
        <TabsContent value="activity" className="mt-6">
          <Card variant="glass">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-accent" />
                  Live Activity Feed
                  <span className="relative flex h-2 w-2 ml-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={activityStatusFilter} onValueChange={setActivityStatusFilter}>
                    <SelectTrigger className="w-[120px] h-9">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="failure">Failure</SelectItem>
                      <SelectItem value="skipped">Skipped</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={activityAgentFilter} onValueChange={setActivityAgentFilter}>
                    <SelectTrigger className="w-[140px] h-9">
                      <SelectValue placeholder="Agent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Agents</SelectItem>
                      {agents?.map((agent) => (
                        <SelectItem key={agent.agent_key} value={agent.agent_key}>
                          {agent.biblical_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-14" />
                  ))}
                </div>
              ) : filteredActivity.length === 0 ? (
                <EmptyState
                  icon={Activity}
                  title="No activity recorded"
                  description="Agent activity will appear here as agents execute tasks"
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Duration</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredActivity.map((log, index) => {
                        const agent = agents?.find((a) => a.agent_key === log.agent_key);
                        return (
                          <TableRow
                            key={log.id}
                            className="animate-fade-up"
                            style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
                          >
                            <TableCell className="text-muted-foreground text-sm">
                              {format(new Date(log.created_at), "MMM d, HH:mm:ss")}
                            </TableCell>
                            <TableCell className="font-medium">
                              {agent?.biblical_name || log.agent_key}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate text-sm">
                              {log.action}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs",
                                  log.status === "success" && "bg-green-100 text-green-700",
                                  log.status === "failure" && "bg-red-100 text-red-700",
                                  log.status === "skipped" && "bg-gray-100 text-gray-700",
                                  log.status === "in_progress" && "bg-blue-100 text-blue-700"
                                )}
                              >
                                {log.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {log.execution_ms ? `${log.execution_ms}ms` : "-"}
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
        </TabsContent>

        {/* Schedule Tab */}
        <TabsContent value="schedule" className="mt-6">
          <Card variant="glass">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Scheduled Tasks (Next 24 Hours)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {scheduleLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20" />
                  ))}
                </div>
              ) : Object.keys(tasksByHour).length === 0 ? (
                <EmptyState
                  icon={Calendar}
                  title="No scheduled tasks"
                  description="No tasks are scheduled for the next 24 hours"
                />
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-6">
                    {Object.entries(tasksByHour).map(([hour, tasks]) => (
                      <div key={hour}>
                        <div className="flex items-center gap-2 mb-3">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <h4 className="font-medium text-foreground">
                            {format(new Date(hour), "EEEE, MMM d 'at' h:mm a")}
                          </h4>
                          <Badge variant="secondary" className="text-xs">
                            {tasks.length} tasks
                          </Badge>
                        </div>
                        <div className="grid gap-2 pl-6 border-l-2 border-muted">
                          {tasks.map((task) => (
                            <div
                              key={task.id}
                              className="p-3 rounded-lg bg-card/50 border flex items-center justify-between"
                            >
                              <div className="flex items-center gap-3">
                                <Badge
                                  variant="outline"
                                  className="text-xs capitalize"
                                >
                                  {task.agent_type.replace(/_/g, " ")}
                                </Badge>
                                <span className="text-sm text-muted-foreground">
                                  {task.action_type}
                                </span>
                                <span className="text-sm font-medium">
                                  → {getLeadName(task.leads)}
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(task.scheduled_for), "h:mm a")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Sub-component for agent tasks list
const AgentTasksList: React.FC<{ agentKey: string; organizationId?: string }> = ({ agentKey, organizationId }) => {
  const { data: tasks, isLoading } = useQuery({
    queryKey: ["agent-tasks-preview", agentKey, organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data } = await supabase
        .from("agent_tasks")
        .select(`id, action_type, scheduled_for, status, leads:lead_id (full_name, first_name, last_name)`)
        .eq("organization_id", organizationId)
        .eq("agent_type", agentKey)
        .eq("status", "pending")
        .order("scheduled_for", { ascending: true })
        .limit(5);
      return data || [];
    },
    enabled: !!organizationId,
  });

  if (isLoading) {
    return (
      <div className="mt-3 pt-3 border-t space-y-2">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <div className="mt-3 pt-3 border-t">
        <p className="text-xs text-muted-foreground text-center py-2">No pending tasks</p>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t space-y-2">
      {tasks.map((task: any) => (
        <div key={task.id} className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline" className="text-[10px] shrink-0">
              {task.action_type}
            </Badge>
            <span className="truncate">
              {task.leads?.full_name || 
                [task.leads?.first_name, task.leads?.last_name].filter(Boolean).join(" ") || 
                "Unknown"}
            </span>
          </div>
          <span className="text-muted-foreground shrink-0 ml-2">
            {formatDistanceToNow(new Date(task.scheduled_for), { addSuffix: true })}
          </span>
        </div>
      ))}
    </div>
  );
};

export default AgentsPage;
