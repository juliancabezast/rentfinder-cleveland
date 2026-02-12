import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Bot, Zap, Clock, TrendingUp, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentStats } from "./types";

interface AgentMetricsBarProps {
  stats: AgentStats;
}

export const AgentMetricsBar: React.FC<AgentMetricsBarProps> = ({ stats }) => {
  return (
    <Card variant="glass">
      <CardContent className="p-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          {/* Active agents */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
            </span>
            <span className="font-semibold">{stats.active}/{stats.total}</span>
            <span className="text-muted-foreground">Active</span>
          </div>

          <div className="hidden sm:block h-4 w-px bg-border" />

          {/* Executed today */}
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-blue-500" />
            <span className="font-semibold">{stats.executedToday}</span>
            <span className="text-muted-foreground">Executed</span>
          </div>

          <div className="hidden sm:block h-4 w-px bg-border" />

          {/* Pending */}
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            <span className={cn("font-semibold", stats.pendingGlobal > 0 && "text-amber-600")}>{stats.pendingGlobal}</span>
            <span className="text-muted-foreground">Pending</span>
          </div>

          <div className="hidden sm:block h-4 w-px bg-border" />

          {/* Success rate */}
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-green-500" />
            <span className="font-semibold">{stats.successRate}%</span>
            <span className="text-muted-foreground">Success</span>
          </div>

          {/* Errors (only shown if > 0) */}
          {stats.errorCount > 0 && (
            <>
              <div className="hidden sm:block h-4 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                <span className="font-semibold text-red-600">{stats.errorCount}</span>
                <span className="text-muted-foreground">Errors</span>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
