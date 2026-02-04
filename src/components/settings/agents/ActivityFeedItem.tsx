import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Phone,
  Brain,
  MessageSquare,
  ShieldCheck,
  RefreshCw,
  Server,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { AgentActivityLog, Agent } from '@/hooks/useAgentsData';
import { cn } from '@/lib/utils';

interface ActivityFeedItemProps {
  activity: AgentActivityLog;
  agents: Agent[];
}

const CATEGORY_ICONS = {
  voice: Phone,
  intelligence: Brain,
  communication: MessageSquare,
  verification: ShieldCheck,
  sync: RefreshCw,
  system: Server,
};

const STATUS_COLORS = {
  success: 'bg-green-100 text-green-700',
  failure: 'bg-red-100 text-red-700',
  skipped: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
};

export const ActivityFeedItem: React.FC<ActivityFeedItemProps> = ({ activity, agents }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const agent = agents.find((a) => a.agent_key === activity.agent_key);
  const category = agent?.category || 'system';
  const Icon = CATEGORY_ICONS[category] || Server;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-card/50 hover:bg-card cursor-pointer transition-colors">
          <div className="p-1.5 rounded bg-primary/10 shrink-0">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-foreground">
                {agent?.biblical_name || activity.agent_key}
              </span>
              <Badge variant="outline" className={cn('text-[10px]', STATUS_COLORS[activity.status])}>
                {activity.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">{activity.action}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
            </span>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-11 p-3 mt-1 rounded-lg bg-muted/30 space-y-2">
          <div>
            <p className="text-xs font-medium text-foreground mb-1">Message</p>
            <p className="text-xs text-muted-foreground">{activity.message}</p>
          </div>
          {activity.execution_ms && (
            <div className="flex items-center gap-4 text-xs">
              <span className="text-muted-foreground">
                Execution: <span className="font-medium text-foreground">{activity.execution_ms}ms</span>
              </span>
              {activity.cost_incurred !== null && activity.cost_incurred > 0 && (
                <span className="text-muted-foreground">
                  Cost: <span className="font-medium text-foreground">${activity.cost_incurred.toFixed(4)}</span>
                </span>
              )}
            </div>
          )}
          {activity.details && Object.keys(activity.details).length > 0 && (
            <div>
              <p className="text-xs font-medium text-foreground mb-1">Details</p>
              <pre className="text-[10px] text-muted-foreground bg-background/50 p-2 rounded overflow-x-auto">
                {JSON.stringify(activity.details, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
