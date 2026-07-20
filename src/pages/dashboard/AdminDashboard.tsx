import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  Calendar,
  CalendarCheck,
  DoorOpen,
  Home,
  Mail,
  Flame,
  FileText,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { DashboardGreeting } from "@/components/dashboard/DashboardGreeting";
import { LiveKpiCard, SubStat } from "@/components/dashboard/LiveKpiCard";
import { NextShowingsWidget } from "@/components/dashboard/NextShowingsWidget";
import { TopPropertiesWidget } from "@/components/dashboard/TopPropertiesWidget";
import { TaskQueuePanel } from "@/components/dashboard/TaskQueuePanel";
import { useDashboardLive } from "@/hooks/useDashboardLive";
import { cn } from "@/lib/utils";

const LiveBadge: React.FC<{ live: boolean; pulseAt: number }> = ({ live, pulseAt }) => (
  <div className="flex items-center gap-1.5 rounded-full border bg-white/70 dark:bg-card/70 backdrop-blur px-2.5 py-1 text-xs font-medium shrink-0">
    <span
      key={pulseAt}
      className={cn("h-2 w-2 rounded-full", live ? "bg-success dash-live-ping" : "bg-muted-foreground")}
    />
    {live ? "En vivo" : "Conectando…"}
  </div>
);

export const AdminDashboard = () => {
  const navigate = useNavigate();
  const { data, isLoading, error, live, pulseAt, flashByKey } = useDashboardLive();

  const leads = data?.leads;
  const showings = data?.showings;
  const portfolio = data?.portfolio;
  const comms = data?.comms;

  // New-this-week trend vs the previous full week
  const weekTrend =
    leads && leads.prev_week > 0
      ? Math.round(((leads.this_week - leads.prev_week) / leads.prev_week) * 100)
      : null;

  const leadSubs: SubStat[] = [
    { value: `+${leads?.this_week ?? 0}`, label: "esta semana", tone: "default" },
    { value: `${leads?.hot ?? 0}`, label: "hot", tone: "hot", icon: Flame },
    ...(weekTrend != null
      ? [{
          value: `${weekTrend >= 0 ? "+" : ""}${weekTrend}%`,
          label: "vs sem. ant.",
          tone: (weekTrend >= 0 ? "up" : "down") as SubStat["tone"],
          icon: weekTrend >= 0 ? TrendingUp : TrendingDown,
        }]
      : []),
  ];

  const showingSubs: SubStat[] = [
    { value: showings?.show_up_rate != null ? `${showings.show_up_rate}%` : "—", label: "show-up", tone: "success", icon: CalendarCheck },
    { value: `${showings?.upcoming ?? 0}`, label: "próximos" },
    { value: `${leads?.applicants ?? 0}`, label: "applicants", icon: FileText },
  ];

  const portfolioSubs: SubStat[] = [
    { value: `${portfolio?.available ?? 0}`, label: "disponibles", tone: "success", icon: Home },
    { value: `${portfolio?.occupancy_pct ?? 0}%`, label: "ocupado" },
    { value: `${portfolio?.properties ?? 0}`, label: "propiedades" },
  ];

  const emailSubs: SubStat[] = [
    { value: (comms?.emails_sent_24h ?? 0).toLocaleString(), label: "últimas 24h", tone: "success", icon: TrendingUp },
    { value: (comms?.queue_pending ?? 0).toLocaleString(), label: "en cola", tone: (comms?.queue_overdue ?? 0) > 0 ? "warning" : "default" },
  ];

  return (
    <div className="grid gap-6 grid-cols-1 xl:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-6 xl:min-h-[500px]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <DashboardGreeting />
          <LiveBadge live={live} pulseAt={pulseAt} />
        </div>

        {error && !data && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            No se pudo cargar el dashboard en vivo. Reintentando automáticamente…
          </div>
        )}

        {/* ── Hero KPIs — merged live cards ── */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <LiveKpiCard
            title="Leads"
            icon={Users}
            accent="indigo"
            value={leads?.total ?? 0}
            flash={flashByKey.leads}
            flashLabel="lead"
            subs={leadSubs}
            onClick={() => navigate("/leads")}
            loading={isLoading}
          />
          <LiveKpiCard
            title="Showings"
            icon={Calendar}
            accent="amber"
            value={showings?.total ?? 0}
            flash={flashByKey.showings}
            subs={showingSubs}
            onClick={() => navigate("/showings")}
            loading={isLoading}
          />
          <LiveKpiCard
            title="Portafolio"
            icon={DoorOpen}
            accent="violet"
            value={portfolio?.total_doors ?? 0}
            subs={portfolioSubs}
            onClick={() => navigate("/properties")}
            loading={isLoading}
          />
          <LiveKpiCard
            title="Emails"
            icon={Mail}
            accent="sky"
            value={comms?.emails_sent_total ?? 0}
            flash={flashByKey.emails}
            flashLabel="enviados"
            subs={emailSubs}
            onClick={() => navigate("/analytics?tab=email")}
            loading={isLoading}
          />
        </div>

        {/* ── Widgets ── */}
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          <TopPropertiesWidget />
          <NextShowingsWidget showings={data?.next_showings} loading={isLoading} />
        </div>
      </div>

      {/* Live agent queue — sticky right rail */}
      <div className="hidden xl:block xl:col-start-2 xl:row-start-1">
        <div className="xl:sticky xl:top-4">
          <TaskQueuePanel />
        </div>
      </div>
    </div>
  );
};
