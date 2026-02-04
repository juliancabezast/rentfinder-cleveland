import React from "react";
import { Badge } from "@/components/ui/badge";
import { DoorOpen, ExternalLink, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DoorloopStatusBadgeProps {
  leadId: string;
  doorloopProspectId: string | null;
  showLastSync?: boolean;
}

export const DoorloopStatusBadge: React.FC<DoorloopStatusBadgeProps> = ({
  leadId,
  doorloopProspectId,
  showLastSync = true,
}) => {
  // Fetch last sync timestamp if enabled
  const { data: lastSync } = useQuery({
    queryKey: ["doorloop-sync", leadId],
    queryFn: async () => {
      if (!showLastSync) return null;
      
      const { data } = await supabase
        .from("doorloop_sync_log")
        .select("created_at, action_taken, status")
        .eq("local_id", leadId)
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      return data;
    },
    enabled: showLastSync && !!doorloopProspectId,
    staleTime: 60000, // 1 minute
  });

  if (!doorloopProspectId) {
    return (
      <Badge variant="secondary" className="text-muted-foreground">
        <ExternalLink className="mr-1 h-3 w-3" />
        Not synced
      </Badge>
    );
  }

  const truncatedId = doorloopProspectId.length > 8 
    ? `${doorloopProspectId.slice(0, 8)}...` 
    : doorloopProspectId;

  const badgeContent = (
    <Badge variant="outline" className="border-primary/50 text-primary bg-primary/10">
      <DoorOpen className="mr-1 h-3 w-3" />
      Synced: {truncatedId}
    </Badge>
  );

  if (lastSync) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {badgeContent}
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs space-y-1">
              <p className="font-medium">Doorloop ID: {doorloopProspectId}</p>
              <p className="text-muted-foreground flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                Last sync: {formatDistanceToNow(new Date(lastSync.created_at), { addSuffix: true })}
              </p>
              {lastSync.action_taken && (
                <p className="text-muted-foreground">{lastSync.action_taken}</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badgeContent;
};
