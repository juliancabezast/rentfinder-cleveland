import { supabase } from "@/integrations/supabase/client";

// Fire-and-forget property-view tracking for the public renter site.
// - "impression": the home displayed these properties (fired once per load)
// - "detail_view": a visitor opened a property page
// Never blocks or throws into the UI; failures are swallowed.

export type ViewEvent = "impression" | "detail_view";

export function trackPropertyView(event: ViewEvent, propertyIds: string[]): void {
  const ids = Array.from(new Set((propertyIds || []).filter(Boolean)));
  if (ids.length === 0) return;
  try {
    void supabase.functions
      .invoke("track-property-view", { body: { event, propertyIds: ids } })
      .catch(() => {});
  } catch {
    /* ignore — tracking must never break the page */
  }
}
