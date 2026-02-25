import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp,
  Phone,
  Globe,
  UserPlus,
  Home,
  Megaphone,
  FileText,
  Mail,
  Footprints,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SourceCount {
  source: string;
  count: number;
}

interface TopSourcesWidgetProps {
  data: SourceCount[];
  total: number;
  loading?: boolean;
}

const SOURCE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  inbound_call: { label: "Inbound Call", icon: Phone, color: "text-blue-600 bg-blue-100" },
  web_form: { label: "Web Form", icon: Globe, color: "text-emerald-600 bg-emerald-100" },
  website: { label: "Website", icon: Globe, color: "text-emerald-600 bg-emerald-100" },
  referral: { label: "Referral", icon: UserPlus, color: "text-purple-600 bg-purple-100" },
  zillow: { label: "Zillow", icon: Home, color: "text-blue-500 bg-blue-100" },
  craigslist: { label: "Craigslist", icon: FileText, color: "text-violet-600 bg-violet-100" },
  walk_in: { label: "Walk-in", icon: Footprints, color: "text-amber-600 bg-amber-100" },
  hemlane: { label: "Hemlane", icon: Mail, color: "text-rose-600 bg-rose-100" },
  manual: { label: "Manual Entry", icon: FileText, color: "text-gray-600 bg-gray-100" },
  campaign: { label: "Campaign", icon: Megaphone, color: "text-orange-600 bg-orange-100" },
};

const DEFAULT_CONFIG = { label: "", icon: Globe, color: "text-gray-600 bg-gray-100" };

export const TopSourcesWidget: React.FC<TopSourcesWidgetProps> = ({
  data,
  total,
  loading = false,
}) => {
  if (loading) {
    return (
      <Card variant="glass" className="h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-40" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-7 w-7 rounded-lg" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="glass" className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Top Lead Sources
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No lead source data yet
          </p>
        ) : (
          <div className="space-y-4">
            {data.map((item) => {
              const config = SOURCE_CONFIG[item.source] || {
                ...DEFAULT_CONFIG,
                label: item.source,
              };
              const Icon = config.icon;
              const percentage = total > 0 ? Math.round((item.count / total) * 100) : 0;
              const [iconColor, iconBg] = config.color.split(" ");

              return (
                <div key={item.source} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn("p-1.5 rounded-lg", iconBg)}>
                        <Icon className={cn("h-4 w-4", iconColor)} />
                      </div>
                      <span className="text-sm font-medium">{config.label}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {item.count} <span className="text-xs">({percentage}%)</span>
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/70 rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
