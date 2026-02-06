import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Phone,
  Brain,
  MessageSquare,
  ShieldCheck,
  RefreshCw,
  Server,
  Bot,
  Search,
  Filter,
  Activity,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAgentsData, CategoryStats } from '@/hooks/useAgentsData';
import { useOrganizationSettings, DEFAULT_SETTINGS } from '@/hooks/useOrganizationSettings';
import { AgentCategoryCard } from './agents/AgentCategoryCard';
import { AgentCard } from './agents/AgentCard';
import { ActivityFeedItem } from './agents/ActivityFeedItem';
import { EmptyState } from '@/components/ui/EmptyState';

const CATEGORY_CONFIG = [
  { key: 'voice', label: 'Voice Agents', icon: Phone },
  { key: 'intelligence', label: 'Intelligence Agents', icon: Brain },
  { key: 'communication', label: 'Communication Agents', icon: MessageSquare },
  { key: 'verification', label: 'Verification Agents', icon: ShieldCheck },
  { key: 'sync', label: 'Sync Agents', icon: RefreshCw },
  { key: 'system', label: 'System Agents', icon: Server },
];

export const AgentsTab: React.FC = () => {
  const {
    agents,
    activityLog,
    categoryStats,
    isLoading,
    error,
    toggleAgent,
    isToggling,
  } = useAgentsData();

  const { getSetting, updateMultipleSettings, loading: settingsLoading } = useOrganizationSettings();

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activityStatusFilter, setActivityStatusFilter] = useState<string>('all');
  const [activityAgentFilter, setActivityAgentFilter] = useState<string>('all');
  const [savingSettings, setSavingSettings] = useState(false);

  // Agent settings from organization_settings
  const agentSettings = useMemo(() => {
    if (settingsLoading) return {};
    return {
      recaptureFirstDelay: getSetting('recapture_first_delay_hours', DEFAULT_SETTINGS.recapture_first_delay_hours),
      recaptureMaxAttempts: getSetting('recapture_max_attempts', DEFAULT_SETTINGS.recapture_max_attempts),
      recaptureSchedule: (() => {
        const schedule = getSetting('recapture_schedule', DEFAULT_SETTINGS.recapture_schedule);
        return Array.isArray(schedule) ? schedule.join(', ') : '1, 2, 4, 7, 10, 14, 21';
      })(),
      confirmationHoursBefore: getSetting('confirmation_hours_before', DEFAULT_SETTINGS.confirmation_hours_before),
      confirmationMaxAttempts: getSetting('confirmation_max_attempts', DEFAULT_SETTINGS.confirmation_max_attempts),
      noShowDelayHours: getSetting('no_show_delay_hours', DEFAULT_SETTINGS.no_show_delay_hours),
      postShowingDelayHours: getSetting('post_showing_delay_hours', DEFAULT_SETTINGS.post_showing_delay_hours),
    };
  }, [getSetting, settingsLoading]);

  // Filtered agents
  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      const matchesCategory = selectedCategory === 'all' || agent.category === selectedCategory;
      const matchesSearch =
        searchQuery === '' ||
        agent.biblical_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.agent_key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.display_role.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [agents, selectedCategory, searchQuery]);

  // Filtered activity log
  const filteredActivityLog = useMemo(() => {
    return activityLog.filter((activity) => {
      const matchesStatus = activityStatusFilter === 'all' || activity.status === activityStatusFilter;
      const matchesAgent = activityAgentFilter === 'all' || activity.agent_key === activityAgentFilter;
      return matchesStatus && matchesAgent;
    });
  }, [activityLog, activityStatusFilter, activityAgentFilter]);

  const handleSaveSettings = async (agentKey: string, settings: Record<string, unknown>) => {
    setSavingSettings(true);
    try {
      const settingsToUpdate: Array<{ key: string; value: string | number | number[]; category: string }> = [];

      if (agentKey === 'recapture') {
        if (settings.recaptureFirstDelay !== undefined) {
          settingsToUpdate.push({ key: 'recapture_first_delay_hours', value: Number(settings.recaptureFirstDelay), category: 'agents' });
        }
        if (settings.recaptureMaxAttempts !== undefined) {
          settingsToUpdate.push({ key: 'recapture_max_attempts', value: Number(settings.recaptureMaxAttempts), category: 'agents' });
        }
        if (settings.recaptureSchedule !== undefined) {
          const scheduleArray = String(settings.recaptureSchedule)
            .split(',')
            .map((s) => parseInt(s.trim()))
            .filter((n) => !isNaN(n));
          settingsToUpdate.push({ key: 'recapture_schedule', value: scheduleArray, category: 'agents' });
        }
      } else if (agentKey === 'showing_confirmation') {
        if (settings.confirmationHoursBefore !== undefined) {
          settingsToUpdate.push({ key: 'confirmation_hours_before', value: Number(settings.confirmationHoursBefore), category: 'agents' });
        }
        if (settings.confirmationMaxAttempts !== undefined) {
          settingsToUpdate.push({ key: 'confirmation_max_attempts', value: Number(settings.confirmationMaxAttempts), category: 'agents' });
        }
      } else if (agentKey === 'no_show_followup') {
        if (settings.noShowDelayHours !== undefined) {
          settingsToUpdate.push({ key: 'no_show_delay_hours', value: Number(settings.noShowDelayHours), category: 'agents' });
        }
      } else if (agentKey === 'post_showing') {
        if (settings.postShowingDelayHours !== undefined) {
          settingsToUpdate.push({ key: 'post_showing_delay_hours', value: Number(settings.postShowingDelayHours), category: 'agents' });
        }
      }

      if (settingsToUpdate.length > 0) {
        await updateMultipleSettings(settingsToUpdate);
        toast.success('Agent settings saved');
      }
    } catch (err) {
      console.error('Error saving agent settings:', err);
      toast.error('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleToggleAgent = (agentId: string, isEnabled: boolean) => {
    toggleAgent({ agentId, isEnabled });
    toast.success(isEnabled ? 'Agent enabled' : 'Agent disabled');
  };

  if (isLoading || settingsLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-12" />
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card variant="glass" className="border-destructive/50">
        <CardContent className="p-6">
          <p className="text-destructive">Failed to load agents data. Please try again.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Agents Command Center
          </h2>
          <p className="text-sm text-muted-foreground">Monitor and configure all AI agents</p>
        </div>
        <Badge variant="secondary" className="self-start">
          {agents.length} agents registered
        </Badge>
      </div>

      {/* Section 1: Summary Bar */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {CATEGORY_CONFIG.map((cat) => {
          const stats = categoryStats.find((s) => s.category === cat.key) || {
            count: 0,
            activeCount: 0,
            errorCount: 0,
          };
          return (
            <AgentCategoryCard
              key={cat.key}
              title={cat.label}
              count={stats.count}
              activeCount={stats.activeCount}
              errorCount={stats.errorCount}
              icon={cat.icon}
              isActive={selectedCategory === cat.key}
              onClick={() => setSelectedCategory(selectedCategory === cat.key ? 'all' : cat.key)}
            />
          );
        })}
      </div>

      {/* Section 2: Agent Grid */}
      <Card variant="glass">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg">Agent Fleet</CardTitle>
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
            </div>
          </div>
          {/* Category Tabs */}
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="mt-3">
            <TabsList className="flex-wrap h-auto p-1">
              <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
              {CATEGORY_CONFIG.map((cat) => (
                <TabsTrigger key={cat.key} value={cat.key} className="text-xs">
                  {cat.label.replace(' Agents', '')}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {filteredAgents.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="No agents found"
              description={searchQuery ? 'Try adjusting your search' : 'No agents match the selected filter'}
            />
          ) : (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredAgents.map((agent, index) => (
                <div
                  key={agent.id}
                  className="animate-fade-up"
                  style={{
                    animationDelay: `${Math.min(index * 0.03, 0.3)}s`,
                    animationFillMode: 'both',
                  }}
                >
                  <AgentCard
                    agent={agent}
                    onToggle={handleToggleAgent}
                    isToggling={isToggling}
                    agentSettings={agentSettings}
                    onSaveSettings={handleSaveSettings}
                    isSavingSettings={savingSettings}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Live Activity Feed */}
      <Card variant="glass">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-accent" />
              Live Activity Feed
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={activityStatusFilter} onValueChange={setActivityStatusFilter}>
                <SelectTrigger className="w-[120px] h-9">
                  <Filter className="h-3 w-3 mr-1" />
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
                  <Bot className="h-3 w-3 mr-1" />
                  <SelectValue placeholder="Agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agents</SelectItem>
                  {agents.map((agent) => (
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
          {filteredActivityLog.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No activity recorded yet"
              description="Agent activity will appear here in real-time as agents execute tasks"
            />
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                {filteredActivityLog.map((activity, index) => (
                  <div
                    key={activity.id}
                    className="animate-fade-up"
                    style={{
                      animationDelay: `${Math.min(index * 0.02, 0.2)}s`,
                      animationFillMode: 'both',
                    }}
                  >
                    <ActivityFeedItem activity={activity} agents={agents} />
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
