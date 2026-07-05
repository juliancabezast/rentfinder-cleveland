import React from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  BarChart3,
  Zap,
  Calendar,
  DollarSign,
  Activity,
  Bell,
  RotateCcw,
} from "lucide-react";

export interface DashboardWidget {
  id: string;
  label: string;
  icon: React.ReactNode;
  defaultVisible: boolean;
  defaultOrder: number;
  minRole: string;
  span: "full" | "half";
}

export const DASHBOARD_WIDGETS: DashboardWidget[] = [
  {
    id: "stats_cards",
    label: "Stats Cards",
    icon: <BarChart3 className="h-4 w-4" />,
    defaultVisible: true,
    defaultOrder: 1,
    minRole: "editor",
    span: "full",
  },
  {
    id: "priority_leads",
    label: "Priority Leads",
    icon: <Zap className="h-4 w-4" />,
    defaultVisible: true,
    defaultOrder: 4,
    minRole: "editor",
    span: "half",
  },
  {
    id: "upcoming_showings",
    label: "Upcoming Showings",
    icon: <Calendar className="h-4 w-4" />,
    defaultVisible: true,
    defaultOrder: 5,
    minRole: "editor",
    span: "half",
  },
  {
    id: "agent_activity",
    label: "Agent Activity",
    icon: <Activity className="h-4 w-4" />,
    defaultVisible: true,
    defaultOrder: 6,
    minRole: "editor",
    span: "full",
  },
  {
    id: "cost_overview",
    label: "Cost Overview",
    icon: <DollarSign className="h-4 w-4" />,
    defaultVisible: false,
    defaultOrder: 7,
    minRole: "admin",
    span: "half",
  },
];

// Stat cards grouped into 3 dashboard rows of 5. `category` drives the row
// headers + per-row color accents on the dashboard and the grouped toggles
// in this customizer.
export const STAT_CARD_CATEGORIES = [
  "Leads",
  "Pipeline & Portfolio",
  "Communications & Ops",
] as const;

export const STAT_CARD_DEFS = [
  // Row 1 — Leads
  { id: "leads", label: "Leads", category: "Leads" },
  { id: "new_leads_week", label: "New This Week", category: "Leads" },
  { id: "hot_leads", label: "Hot Leads", category: "Leads" },
  { id: "hot_awaiting", label: "Hot Awaiting Contact", category: "Leads" },
  { id: "uncontacted_backlog", label: "Uncontacted Backlog", category: "Leads" },
  // Row 2 — Pipeline & Portfolio
  { id: "showings", label: "Showings", category: "Pipeline & Portfolio" },
  { id: "show_up_rate", label: "Show-Up Rate", category: "Pipeline & Portfolio" },
  { id: "applicants", label: "Applicants", category: "Pipeline & Portfolio" },
  { id: "total_doors", label: "Total Doors", category: "Pipeline & Portfolio" },
  { id: "available_units", label: "Available Units", category: "Pipeline & Portfolio" },
  // Row 3 — Communications & Ops
  { id: "response_time", label: "Lead Response Time", category: "Communications & Ops" },
  { id: "emails_sent", label: "Emails Sent", category: "Communications & Ops" },
  { id: "emails_parsed", label: "Leads From Email", category: "Communications & Ops" },
  { id: "sms_sent", label: "SMS Sent", category: "Communications & Ops" },
  { id: "agent_queue", label: "Agent Queue", category: "Communications & Ops" },
];

export type StatsPeriod = "day" | "week" | "month" | "total";

export const STATS_PERIOD_OPTIONS: { value: StatsPeriod; label: string }[] = [
  { value: "day", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "total", label: "All Time" },
];

export interface WidgetPreference {
  id: string;
  visible: boolean;
  order: number;
}

export interface DashboardPrefs {
  widgets: WidgetPreference[];
  layout: "comfortable" | "compact";
  statCards: Record<string, boolean>;
  /** Time window applied to the period-aware stat cards. Lives here so the
   * selector sits in this panel instead of a toggle strip on the dashboard. */
  statsPeriod: StatsPeriod;
}

export const getDefaultPrefs = (): DashboardPrefs => ({
  widgets: DASHBOARD_WIDGETS.map((w) => ({
    id: w.id,
    visible: w.defaultVisible,
    order: w.defaultOrder,
  })),
  layout: "comfortable",
  statCards: Object.fromEntries(STAT_CARD_DEFS.map((sc) => [sc.id, true])),
  statsPeriod: "total",
});

export const loadDashboardPrefs = (userId: string): DashboardPrefs => {
  const key = `dashboard_prefs_${userId}`;
  const saved = localStorage.getItem(key);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      const defaults = getDefaultPrefs();
      // Merge widgets: keep saved prefs but add any new widgets from defaults
      const savedWidgetIds = new Set((parsed.widgets || []).map((w: WidgetPreference) => w.id));
      const mergedWidgets = [
        ...(parsed.widgets || []),
        ...defaults.widgets.filter((w) => !savedWidgetIds.has(w.id)),
      ];
      return {
        ...defaults,
        ...parsed,
        widgets: mergedWidgets,
        statCards: { ...defaults.statCards, ...(parsed.statCards || {}) },
      };
    } catch {
      return getDefaultPrefs();
    }
  }
  return getDefaultPrefs();
};

export const saveDashboardPrefs = (userId: string, prefs: DashboardPrefs) => {
  const key = `dashboard_prefs_${userId}`;
  localStorage.setItem(key, JSON.stringify(prefs));
};

interface DashboardCustomizerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefs: DashboardPrefs;
  onPrefsChange: (prefs: DashboardPrefs) => void;
  onReset: () => void;
}

export const DashboardCustomizer: React.FC<DashboardCustomizerProps> = ({
  open,
  onOpenChange,
  prefs,
  onPrefsChange,
  onReset,
}) => {
  const toggleWidget = (widgetId: string) => {
    const updatedWidgets = prefs.widgets.map((w) =>
      w.id === widgetId ? { ...w, visible: !w.visible } : w
    );
    onPrefsChange({ ...prefs, widgets: updatedWidgets });
  };

  const toggleStatCard = (cardId: string) => {
    onPrefsChange({
      ...prefs,
      statCards: { ...prefs.statCards, [cardId]: !prefs.statCards[cardId] },
    });
  };

  const setLayout = (layout: "comfortable" | "compact") => {
    onPrefsChange({ ...prefs, layout });
  };

  const setStatsPeriod = (statsPeriod: StatsPeriod) => {
    onPrefsChange({ ...prefs, statsPeriod });
  };

  const isWidgetVisible = (widgetId: string) => {
    return prefs.widgets.find((w) => w.id === widgetId)?.visible ?? true;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            ⚙️ Customize Dashboard
          </SheetTitle>
          <SheetDescription>
            Toggle widgets on/off to personalize your dashboard view.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-220px)] mt-6 pr-4">
          <div className="space-y-6">
            {/* Widget Toggles */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Toggle widgets on/off:
              </h3>
              <div className="space-y-3">
                {DASHBOARD_WIDGETS.map((widget) => (
                  <div
                    key={widget.id}
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-muted-foreground">{widget.icon}</div>
                      <span className="text-sm font-medium">{widget.label}</span>
                    </div>
                    <Switch
                      checked={isWidgetVisible(widget.id)}
                      onCheckedChange={() => toggleWidget(widget.id)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Stats period filter — applies to the period-aware stat cards */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Stats period:
              </h3>
              <RadioGroup
                value={prefs.statsPeriod ?? "total"}
                onValueChange={(v) => setStatsPeriod(v as StatsPeriod)}
                className="grid grid-cols-2 gap-2"
              >
                {STATS_PERIOD_OPTIONS.map((opt) => (
                  <div key={opt.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={opt.value} id={`period-${opt.value}`} />
                    <Label htmlFor={`period-${opt.value}`}>{opt.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <Separator />

            {/* Individual Stat Card Toggles, grouped by dashboard category */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Stat cards:
              </h3>
              {STAT_CARD_CATEGORIES.map((cat) => (
                <div key={cat} className="space-y-1">
                  <p className="px-3 pt-1 text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em]">
                    {cat}
                  </p>
                  {STAT_CARD_DEFS.filter((c) => c.category === cat).map((card) => (
                    <div
                      key={card.id}
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-sm font-medium">{card.label}</span>
                      <Switch
                        checked={prefs.statCards[card.id] ?? true}
                        onCheckedChange={() => toggleStatCard(card.id)}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <Separator />

            {/* Layout Options */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Layout:
              </h3>
              <RadioGroup
                value={prefs.layout}
                onValueChange={(v) => setLayout(v as "comfortable" | "compact")}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="comfortable" id="comfortable" />
                  <Label htmlFor="comfortable">Comfortable</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="compact" id="compact" />
                  <Label htmlFor="compact">Compact</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        </ScrollArea>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={onReset} className="mr-auto">
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Default
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
