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

export const STAT_CARD_DEFS = [
  { id: "total_doors", label: "Total Doors" },
  { id: "leads", label: "Leads" },
  { id: "hot_leads", label: "Hot Leads" },
  { id: "showings", label: "Showings" },
  { id: "applicants", label: "Applicants" },
  { id: "sms_sent", label: "SMS Sent" },
  { id: "emails_sent", label: "Emails Sent" },
  { id: "emails_parsed", label: "Emails Parsed" },
  { id: "calls_made", label: "Calls Made" },
  { id: "agent_queue", label: "Agent Queue" },
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
}

export const getDefaultPrefs = (): DashboardPrefs => ({
  widgets: DASHBOARD_WIDGETS.map((w) => ({
    id: w.id,
    visible: w.defaultVisible,
    order: w.defaultOrder,
  })),
  layout: "comfortable",
  statCards: Object.fromEntries(STAT_CARD_DEFS.map((sc) => [sc.id, true])),
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

            {/* Individual Stat Card Toggles */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Stat cards:
              </h3>
              <div className="space-y-3">
                {STAT_CARD_DEFS.map((card) => (
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
