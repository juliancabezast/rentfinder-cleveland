import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronDown, ChevronUp, Clock, AlertTriangle, Zap, Save } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Agent, AgentActivityLog, useAgentActivityLog } from '@/hooks/useAgentsData';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface AgentCardProps {
  agent: Agent;
  onToggle: (agentId: string, isEnabled: boolean) => void;
  isToggling: boolean;
  // Config props for voice agents
  agentSettings?: {
    recaptureFirstDelay?: number;
    recaptureMaxAttempts?: number;
    recaptureSchedule?: string;
    confirmationHoursBefore?: number;
    confirmationMaxAttempts?: number;
    noShowDelayHours?: number;
    postShowingDelayHours?: number;
  };
  onSaveSettings?: (agentKey: string, settings: Record<string, unknown>) => void;
  isSavingSettings?: boolean;
}

const STATUS_CONFIG: Record<string, { color: string; text: string; textColor: string; pulse?: boolean }> = {
  idle: { color: 'bg-gray-400', text: 'Idle', textColor: 'text-gray-600' },
  active: { color: 'bg-green-500', text: 'Active', textColor: 'text-green-600', pulse: true },
  error: { color: 'bg-red-500', text: 'Error', textColor: 'text-red-600' },
  disabled: { color: 'bg-gray-300', text: 'Disabled', textColor: 'text-gray-400' },
  degraded: { color: 'bg-amber-500', text: 'Degraded', textColor: 'text-amber-600' },
};

const SERVICE_COLORS: Record<string, string> = {
  twilio: 'bg-red-100 text-red-700',
  bland_ai: 'bg-blue-100 text-blue-700',
  openai: 'bg-green-100 text-green-700',
  persona: 'bg-purple-100 text-purple-700',
  doorloop: 'bg-orange-100 text-orange-700',
  resend: 'bg-pink-100 text-pink-700',
  gmail: 'bg-yellow-100 text-yellow-700',
  google_sheets: 'bg-emerald-100 text-emerald-700',
};

export const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  onToggle,
  isToggling,
  agentSettings,
  onSaveSettings,
  isSavingSettings,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { data: recentActivity } = useAgentActivityLog(isExpanded ? agent.agent_key : null);
  
  // Local state for settings
  const [localSettings, setLocalSettings] = useState(agentSettings || {});

  const statusConfig = STATUS_CONFIG[agent.status] || STATUS_CONFIG.idle;
  const hasError = agent.status === 'error';

  const handleSaveSettings = () => {
    if (onSaveSettings) {
      onSaveSettings(agent.agent_key, localSettings);
    }
  };

  const renderConfigSection = () => {
    switch (agent.agent_key) {
      case 'recapture':
        return (
          <div className="space-y-4 pt-4 border-t border-border/50">
            <h4 className="text-sm font-medium text-foreground">Configuration</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${agent.id}-delay`} className="text-xs">First Delay (hours)</Label>
                <Input
                  id={`${agent.id}-delay`}
                  type="number"
                  min={1}
                  max={168}
                  value={localSettings.recaptureFirstDelay || 24}
                  onChange={(e) => setLocalSettings({ ...localSettings, recaptureFirstDelay: parseInt(e.target.value) || 24 })}
                  className="h-8"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${agent.id}-attempts`} className="text-xs">Max Attempts</Label>
                <Input
                  id={`${agent.id}-attempts`}
                  type="number"
                  min={1}
                  max={20}
                  value={localSettings.recaptureMaxAttempts || 7}
                  onChange={(e) => setLocalSettings({ ...localSettings, recaptureMaxAttempts: parseInt(e.target.value) || 7 })}
                  className="h-8"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${agent.id}-schedule`} className="text-xs">Schedule (days)</Label>
              <Input
                id={`${agent.id}-schedule`}
                value={localSettings.recaptureSchedule || '1, 2, 4, 7, 10, 14, 21'}
                onChange={(e) => setLocalSettings({ ...localSettings, recaptureSchedule: e.target.value })}
                className="h-8"
                placeholder="1, 2, 4, 7, 10, 14, 21"
              />
            </div>
            <Button size="sm" onClick={handleSaveSettings} disabled={isSavingSettings}>
              <Save className="h-3 w-3 mr-1" />
              Save
            </Button>
          </div>
        );

      case 'showing_confirmation':
        return (
          <div className="space-y-4 pt-4 border-t border-border/50">
            <h4 className="text-sm font-medium text-foreground">Configuration</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${agent.id}-hours`} className="text-xs">Hours Before Showing</Label>
                <Input
                  id={`${agent.id}-hours`}
                  type="number"
                  min={1}
                  max={72}
                  value={localSettings.confirmationHoursBefore || 24}
                  onChange={(e) => setLocalSettings({ ...localSettings, confirmationHoursBefore: parseInt(e.target.value) || 24 })}
                  className="h-8"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${agent.id}-conf-attempts`} className="text-xs">Max Attempts</Label>
                <Input
                  id={`${agent.id}-conf-attempts`}
                  type="number"
                  min={1}
                  max={10}
                  value={localSettings.confirmationMaxAttempts || 3}
                  onChange={(e) => setLocalSettings({ ...localSettings, confirmationMaxAttempts: parseInt(e.target.value) || 3 })}
                  className="h-8"
                />
              </div>
            </div>
            <Button size="sm" onClick={handleSaveSettings} disabled={isSavingSettings}>
              <Save className="h-3 w-3 mr-1" />
              Save
            </Button>
          </div>
        );

      case 'no_show_followup':
        return (
          <div className="space-y-4 pt-4 border-t border-border/50">
            <h4 className="text-sm font-medium text-foreground">Configuration</h4>
            <div className="space-y-1.5">
              <Label htmlFor={`${agent.id}-noshow-delay`} className="text-xs">Delay After No-Show (hours)</Label>
              <Input
                id={`${agent.id}-noshow-delay`}
                type="number"
                min={0}
                max={48}
                value={localSettings.noShowDelayHours || 2}
                onChange={(e) => setLocalSettings({ ...localSettings, noShowDelayHours: parseInt(e.target.value) || 2 })}
                className="h-8 max-w-[150px]"
              />
            </div>
            <Button size="sm" onClick={handleSaveSettings} disabled={isSavingSettings}>
              <Save className="h-3 w-3 mr-1" />
              Save
            </Button>
          </div>
        );

      case 'post_showing':
        return (
          <div className="space-y-4 pt-4 border-t border-border/50">
            <h4 className="text-sm font-medium text-foreground">Configuration</h4>
            <div className="space-y-1.5">
              <Label htmlFor={`${agent.id}-post-delay`} className="text-xs">Delay After Showing (hours)</Label>
              <Input
                id={`${agent.id}-post-delay`}
                type="number"
                min={0}
                max={48}
                value={localSettings.postShowingDelayHours || 1}
                onChange={(e) => setLocalSettings({ ...localSettings, postShowingDelayHours: parseInt(e.target.value) || 1 })}
                className="h-8 max-w-[150px]"
              />
            </div>
            <Button size="sm" onClick={handleSaveSettings} disabled={isSavingSettings}>
              <Save className="h-3 w-3 mr-1" />
              Save
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card
      variant="glass"
      className={cn(
        'transition-all duration-200 hover:shadow-modern-lg',
        hasError && 'border-red-300 bg-red-50/30'
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-primary truncate">{agent.biblical_name}</h3>
              <Badge variant="secondary" className="text-[10px] font-mono">
                {agent.agent_key}
              </Badge>
            </div>
            <p className="text-sm font-medium text-accent">{agent.display_role}</p>
          </div>
          <Switch
            checked={agent.is_enabled}
            onCheckedChange={(checked) => onToggle(agent.id, checked)}
            disabled={isToggling}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-xs text-muted-foreground line-clamp-2">{agent.description}</p>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-sm">
              <p className="text-xs">{agent.description}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Status */}
        <div className="flex items-center gap-2">
          <span className={cn('relative flex h-2.5 w-2.5')}>
            {statusConfig.pulse && (
              <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', statusConfig.color)} />
            )}
            <span className={cn('relative inline-flex rounded-full h-2.5 w-2.5', statusConfig.color)} />
          </span>
          <span className={cn('text-xs font-medium', statusConfig.textColor)}>{statusConfig.text}</span>
        </div>

        {/* Required Services */}
        {agent.required_services.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {agent.required_services.map((service) => (
              <Badge
                key={service}
                variant="outline"
                className={cn('text-[10px] px-1.5 py-0', SERVICE_COLORS[service] || 'bg-gray-100 text-gray-700')}
              >
                {service}
              </Badge>
            ))}
          </div>
        )}

        {/* Stats Row */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <Zap className="h-3 w-3 text-muted-foreground" />
            <span>{agent.executions_today}</span>
          </div>
          <span className="text-green-600">✓ {agent.successes_today}</span>
          <span className="text-red-600">✗ {agent.failures_today}</span>
        </div>

        {/* Last Activity & Sprint */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {agent.last_execution_at
              ? formatDistanceToNow(new Date(agent.last_execution_at), { addSuffix: true })
              : 'Never'}
          </div>
          <Badge variant="outline" className="text-[10px]">
            Sprint {agent.sprint}
          </Badge>
        </div>

        {/* Expand/Collapse */}
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full h-7 text-xs">
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  More
                </>
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-4">
            {/* Full Description */}
            <div>
              <p className="text-xs text-muted-foreground">{agent.description}</p>
            </div>

            {/* Error Message */}
            {agent.last_error_message && (
              <div className="p-2 rounded-md bg-red-50 border border-red-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{agent.last_error_message}</p>
                </div>
              </div>
            )}

            {/* Lifetime Stats */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded-md bg-muted/50">
                <p className="text-muted-foreground">Avg Execution</p>
                <p className="font-medium">{agent.avg_execution_ms ? `${agent.avg_execution_ms.toFixed(0)}ms` : 'N/A'}</p>
              </div>
              <div className="p-2 rounded-md bg-muted/50">
                <p className="text-muted-foreground">Total Executions</p>
                <p className="font-medium">{agent.executions_total.toLocaleString()}</p>
              </div>
            </div>

            {/* Recent Activity */}
            {recentActivity && recentActivity.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-foreground mb-2">Recent Activity</h4>
                <ScrollArea className="h-32">
                  <div className="space-y-1">
                    {recentActivity.map((activity) => (
                      <div
                        key={activity.id}
                        className="flex items-center justify-between p-1.5 rounded bg-muted/30 text-[10px]"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={cn(
                              'shrink-0 h-1.5 w-1.5 rounded-full',
                              activity.status === 'success' && 'bg-green-500',
                              activity.status === 'failure' && 'bg-red-500',
                              activity.status === 'skipped' && 'bg-gray-400',
                              activity.status === 'in_progress' && 'bg-blue-500'
                            )}
                          />
                          <span className="truncate">{activity.action}</span>
                        </div>
                        <span className="text-muted-foreground shrink-0">
                          {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Agent Configuration */}
            {renderConfigSection()}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
};
