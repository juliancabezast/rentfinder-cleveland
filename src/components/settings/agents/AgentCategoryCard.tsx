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
        'cursor-pointer transition-all duration-200 hover:shadow-modern-lg text-center p-3',
        isActive && 'ring-2 ring-accent'
      )}
      onClick={onClick}
    >
      <CardContent className="p-0">
        <div className="flex justify-center mb-1">
          <div className={cn(
            "h-10 w-10 rounded-full flex items-center justify-center",
            errorCount > 0 ? "bg-red-100" : activeCount > 0 ? "bg-green-100" : "bg-primary/10"
          )}>
            <Icon className={cn(
              "h-5 w-5",
              errorCount > 0 ? "text-red-600" : activeCount > 0 ? "text-green-600" : "text-primary"
            )} />
          </div>
        </div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{count} agents</p>
        {errorCount > 0 && (
          <Badge variant="destructive" className="text-xs px-1.5 py-0 mt-1">
            {errorCount} err
          </Badge>
        )}
      </CardContent>
    </Card>
  );
};
