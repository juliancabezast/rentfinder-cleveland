import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentCategoryCardProps {
  title: string;
  count: number;
  activeCount: number;
  errorCount: number;
  icon: LucideIcon;
  isActive?: boolean;
  onClick?: () => void;
}

export const AgentCategoryCard: React.FC<AgentCategoryCardProps> = ({
  title,
  count,
  activeCount,
  errorCount,
  icon: Icon,
  isActive,
  onClick,
}) => {
  return (
    <Card
      variant="glass"
      className={cn(
        'cursor-pointer transition-all duration-200 hover:shadow-modern-lg',
        isActive && 'ring-2 ring-accent'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground">{count} agents</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeCount > 0 && (
              <div className="flex items-center gap-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <span className="text-xs text-green-600">{activeCount}</span>
              </div>
            )}
            {errorCount > 0 && (
              <Badge variant="destructive" className="text-xs px-1.5 py-0">
                {errorCount}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
