import React, { lazy, Suspense, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Workflow, Megaphone, Star, Mail } from "lucide-react";
import FlowsTab from "@/components/communications/FlowsTab";

// The three modules used to be link tiles that navigated away. They are tabs of
// one dashboard now, so each keeps its own <h1> as the tab's heading and the
// hub adds no second header of its own.
const CampaignsPage = lazy(() => import("@/pages/campaigns/CampaignsPage"));
const PropertySpotlightPage = lazy(() => import("@/pages/communications/PropertySpotlightPage"));
const EmailsPage = lazy(() => import("@/pages/emails/EmailsPage"));

const TABS = [
  { value: "flujos", label: "Flujos", icon: Workflow },
  { value: "campanas", label: "Campañas", icon: Megaphone },
  { value: "spotlight", label: "Spotlight", icon: Star },
  { value: "emails", label: "Emails", icon: Mail },
] as const;

const DEFAULT_TAB = "flujos";

const TabFallback = () => (
  <div className="space-y-3">
    {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
  </div>
);

const CommunicationsHub = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = searchParams.get("tab") || DEFAULT_TAB;
  const tab = TABS.some((t) => t.value === raw) ? raw : DEFAULT_TAB;

  // Non-destructive param write (keeps any other query the tabs don't own) and
  // the default tab is omitted from the URL, so /communications stays clean.
  const setTab = useCallback((next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next === DEFAULT_TAB) params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="inline-flex w-full sm:w-auto h-auto">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className="flex-1 sm:flex-initial gap-2">
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Flows is not lazy: it is the default tab, so it would only add a flash. */}
        <TabsContent value="flujos"><FlowsTab /></TabsContent>

        <TabsContent value="campanas">
          <Suspense fallback={<TabFallback />}><CampaignsPage /></Suspense>
        </TabsContent>
        <TabsContent value="spotlight">
          <Suspense fallback={<TabFallback />}><PropertySpotlightPage /></Suspense>
        </TabsContent>
        <TabsContent value="emails">
          <Suspense fallback={<TabFallback />}><EmailsPage /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CommunicationsHub;
