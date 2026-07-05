import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Megaphone, Mail, ArrowRight, Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommModule {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  badge?: string;
}

// Ordered by how a user builds outreach: curate a spotlight → run a campaign →
// review what went out. New modules get added here as the hub grows.
const MODULES: CommModule[] = [
  {
    title: "Property Spotlight",
    description:
      "Curate up to 3 properties into a branded email and send it to a targeted, consent-checked audience of leads.",
    href: "/communications/spotlight",
    icon: Star,
    iconClass: "bg-amber-100 text-amber-600",
    badge: "New",
  },
  {
    title: "Campaigns",
    description:
      "Build and launch multi-lead email / SMS blasts with audience targeting, scheduling, and delivery tracking.",
    href: "/campaigns",
    icon: Megaphone,
    iconClass: "bg-indigo-100 text-indigo-600",
  },
  {
    title: "Emails",
    description:
      "Browse the full history of emails sent and received — delivery status, opens, and per-lead threads.",
    href: "/emails",
    icon: Mail,
    iconClass: "bg-sky-100 text-sky-600",
  },
];

const CommunicationsHub = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Send className="h-6 w-6 text-[#4F46E5]" />
          Communications
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Everything you use to reach leads — spotlights, campaigns, and email history — in one place
        </p>
      </div>

      {/* Module cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {MODULES.map((m) => {
          const Icon = m.icon;
          return (
            <Link key={m.href} to={m.href} className="group focus:outline-none">
              <Card
                variant="glass"
                className="h-full transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-indigo-400"
              >
                <CardContent className="p-6 flex flex-col gap-4 h-full">
                  <div
                    className={cn(
                      "h-12 w-12 rounded-2xl flex items-center justify-center shrink-0",
                      m.iconClass
                    )}
                  >
                    <Icon className="h-6 w-6" />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-slate-900">{m.title}</h3>
                      {m.badge && (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0 text-[10px]">
                          {m.badge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 leading-relaxed">{m.description}</p>
                  </div>

                  <div className="mt-auto flex items-center gap-1 text-sm font-semibold text-indigo-600">
                    Open
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default CommunicationsHub;
