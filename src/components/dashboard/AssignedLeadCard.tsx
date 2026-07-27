import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UserCheck, Phone } from "lucide-react";

interface AssignedLeadCardProps {
  lead: {
    id: string;
    full_name: string | null;
    phone: string;
    status: string;
    property_address?: string;
    is_human_controlled?: boolean | null;
  };
  onTakeControl: (leadId: string) => void;
  loading?: boolean;
}

export const AssignedLeadCard = ({
  lead,
  onTakeControl,
  loading = false,
}: AssignedLeadCardProps) => {
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

  return (
    <Card variant="glass" className="border-l-4 border-l-accent">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold truncate">
              {lead.full_name || "Unknown"}
            </h4>
            {lead.property_address && (
              <p className="text-sm text-muted-foreground truncate mt-1">
                Interested in: {lead.property_address}
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

export const AssignedLeadCardSkeleton = () => (
  <AssignedLeadCard
    lead={{
      id: "",
      full_name: null,
      phone: "",
      status: "",
    }}
    onTakeControl={() => {}}
    loading
  />
);
