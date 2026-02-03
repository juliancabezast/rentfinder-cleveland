import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UserCheck, AlertTriangle, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

interface PriorityLeadCardProps {
  lead: {
    id: string;
    full_name: string | null;
    phone: string;
    lead_score: number | null;
    priority_reason: string | null;
    status: string;
    property_address?: string;
    is_human_controlled?: boolean;
  };
  onTakeControl: (leadId: string) => void;
  loading?: boolean;
}

export const PriorityLeadCard = ({
  lead,
  onTakeControl,
  loading = false,
}: PriorityLeadCardProps) => {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-9 w-28" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const getScoreClasses = (score: number | null) => {
    if (!score) return "bg-muted text-muted-foreground border-muted";
    if (score >= 70) return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
    if (score >= 40) return "bg-amber-500/15 text-amber-700 border-amber-500/30";
    return "bg-rose-500/15 text-rose-700 border-rose-500/30";
  };

  return (
    <Card variant="glass" className="border-l-4 border-l-accent">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-accent shrink-0" />
              <h4 className="font-semibold truncate">
                {lead.full_name || "Unknown"}
              </h4>
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border shrink-0",
                  getScoreClasses(lead.lead_score)
                )}
              >
                {lead.lead_score ?? "?"}
              </div>
            </div>
            {lead.property_address && (
              <p className="text-sm text-muted-foreground truncate mt-1">
                Interested in: {lead.property_address}
              </p>
            )}
            {lead.priority_reason && (
              <p className="text-xs text-accent font-medium mt-1">
                {lead.priority_reason}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Phone className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{lead.phone}</span>
              <Badge variant="secondary" className="text-xs">
                {lead.status.replace("_", " ")}
              </Badge>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {lead.is_human_controlled ? (
              <Badge variant="default" className="bg-primary">
                <UserCheck className="h-3 w-3 mr-1" />
                Controlled
              </Badge>
            ) : (
              <Button
                size="sm"
                onClick={() => onTakeControl(lead.id)}
                className="whitespace-nowrap"
              >
                <UserCheck className="h-4 w-4 mr-1" />
                Take Control
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const PriorityLeadCardSkeleton = () => (
  <PriorityLeadCard
    lead={{
      id: "",
      full_name: null,
      phone: "",
      lead_score: null,
      priority_reason: null,
      status: "",
    }}
    onTakeControl={() => {}}
    loading
  />
);
